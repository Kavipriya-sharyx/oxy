import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { message } from "@Database/Table/Oxxy/message";
import { ChatPipelineService } from "./ChatPipeline.service";
import { CustomerLockService } from "./CustomerLock.service";
import { InboundJob } from "./WhatsappTypes";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";

export const INBOUND_QUEUE = "inbound";
export const RECOVER_JOB = "recover-lost";

type JobData = InboundJob | Record<string, never>; // the recovery job carries no data

export interface LostMessage {
  messageId: string;
  wamid: string;
  conversationId: string;
  customerId: string;
}

@Injectable()
export class InboundQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundQueueService.name);
  private queue: Queue<JobData> | null = null;
  private worker: Worker<JobData> | null = null;

  constructor(
    private readonly _Pipeline: ChatPipelineService,
    private readonly _Lock: CustomerLockService,
  ) {}

  private connection() {
    return redisConnection();
  }

  onModuleInit() {
    this.queue = new Queue<JobData>(INBOUND_QUEUE, {
      connection: this.connection(),
      prefix: queuePrefix(),
    });
    this.queue.on("error", (e) => this.logger.error(`queue error: ${e.message}`));
    // concurrency 1: one message at a time. A thrown error = job retried by BullMQ.
    this.worker = new Worker<JobData>(
      INBOUND_QUEUE,
      (job) => (job.name === RECOVER_JOB ? this.recover() : this.process(job.data as InboundJob)),
      {
        connection: this.connection(),
        prefix: queuePrefix(),
        concurrency: 1,
      },
    );
    // every minute: look for messages that were saved but never answered
    this.queue
      .upsertJobScheduler("inbound-recovery", { every: 60_000 }, { name: RECOVER_JOB })
      .catch((e) => this.logger.error(`could not start recovery scheduler: ${e.message}`));
    this.worker.on("error", (e) => this.logger.error(`worker error: ${e.message}`));
    this.worker.on("failed", (job, e) =>
      this.logger.warn(`job ${job?.id} failed (attempt ${job?.attemptsMade}): ${e.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  // jobId = wa_message_id, so BullMQ itself also ignores a repeated wamid
  async enqueue(data: InboundJob, wamid: string): Promise<void> {
    if (!this.queue) throw new Error("inbound queue not started");
    await this.queue.add("inbound", data, {
      jobId: wamid,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  // Inbound messages saved >1 min ago (and <24h), still "received", with no outbound reply.
  // Opted-out customers are filtered in recover().
  async findLostMessages(): Promise<LostMessage[]> {
    return await message
      .createQueryBuilder("m")
      .innerJoin(conversation, "c", "c.id = m.conversation_id")
      .select("m.id", "messageId")
      .addSelect("m.wa_message_id", "wamid")
      .addSelect("m.conversation_id", "conversationId")
      .addSelect("c.customer_id", "customerId")
      .where("m.direction = 'in'")
      .andWhere("m.message_status = 'received'")
      .andWhere("m.wa_message_id IS NOT NULL")
      .andWhere("m.created_on < now() - interval '1 minute'")
      .andWhere("m.created_on > now() - interval '24 hours'")
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM "message" o WHERE o.direction = 'out' AND o.reply_to_wa_message_id = m.wa_message_id)`,
      )
      .orderBy("m.created_on", "ASC")
      .limit(50)
      .getRawMany<LostMessage>();
  }

  async recover(): Promise<number> {
    let requeued = 0;
    for (const l of await this.findLostMessages()) {
      try {
        const cons = await consent.findOne({ where: { customer_id: l.customerId } });
        if (cons?.opt_out_at) continue; // never requeue opted-out customers
        if (await this.requeue(l)) requeued++;
      } catch (e) {
        this.logger.error(`${l.wamid} recovery failed: ${(e as Error).message}`);
      }
    }
    if (requeued) this.logger.log(`recovered ${requeued} lost message(s)`);
    return requeued;
  }

  // false = a job for this wamid is already waiting / active / delayed
  async requeue(l: LostMessage): Promise<boolean> {
    if (!this.queue) return false;
    const job = await this.queue.getJob(l.wamid);
    if (job) {
      const state = await job.getState();
      if (state !== "completed" && state !== "failed") return false;
      await job.remove(); // a finished job with the same id would make add() a no-op
    }
    await this.enqueue(
      { messageId: l.messageId, conversationId: l.conversationId, customerId: l.customerId },
      l.wamid,
    );
    this.logger.log(`${l.wamid} requeued (lost)`);
    return true;
  }

  // one customer's messages are handled one at a time, in order
  async process(data: InboundJob): Promise<void> {
    await this._Lock.withCustomerLock(data.customerId, () => this.processLocked(data));
  }

  private async processLocked(data: InboundJob): Promise<void> {
    const msg = await message.findOne({ where: { id: data.messageId } });
    const conv = await conversation.findOne({ where: { id: data.conversationId } });
    const cust = await customer.findOne({ where: { id: data.customerId } });
    if (!msg || !conv || !cust) throw new Error("inbound job refers to a missing row");
    await this._Pipeline.process(
      {
        waNumber: cust.wa_number,
        waMessageId: msg.wa_message_id,
        text: msg.body || `[${msg.type} message]`, // non-text: Claude only needs to know something was sent
        type: msg.type,
      },
      { customer: cust, conversation: conv, message: msg },
    );
  }
}
