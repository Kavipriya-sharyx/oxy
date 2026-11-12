import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";
import { WhatsappClient } from "./WhatsappClient.service";
import { isQuietHours } from "./WhatsappRules";

const QUEUE = "scheduled";

export interface FollowUpJob {
  customerId: string;
  conversationId: string;
  kind: "agreed_follow_up" | "rescue" | "trigger_q";
  templateName: string;
  params?: string[];
}

@Injectable()
export class FollowUpSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpSchedulerService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly _Wa: WhatsappClient) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    const connection = redisConnection();
    const prefix = queuePrefix();
    this.queue = new Queue(QUEUE, { connection, prefix });
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        await this.execute(job.data as FollowUpJob);
      },
      { connection, prefix, concurrency: 3 },
    );
    this.worker.on("error", (e) => this.logger.error(`scheduler worker error: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async schedule(job: FollowUpJob, delayMs: number): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(job.kind, job, {
      delay: Math.max(1000, delayMs),
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async execute(job: FollowUpJob): Promise<void> {
    const cons = await consent.findOne({ where: { customer_id: job.customerId } });
    if (cons?.opt_out_at || cons?.privacy_request_at) return;

    const conv = await conversation.findOne({ where: { id: job.conversationId } });
    if (!conv || conv.closed_at) return;
    if (
      conv.state === ConversationState.Pause ||
      conv.state === ConversationState.Escalated ||
      conv.state === ConversationState.OptedOut
    ) {
      return;
    }
    if (job.kind === "rescue" && conv.rescue_count >= 2) return;
    if (isQuietHours(new Date())) return;

    try {
      await this._Wa.send(
        job.customerId,
        { kind: "template", name: job.templateName, languageCode: "en", params: job.params },
        "proactive",
      );
      if (job.kind === "rescue") {
        await conversation.update(conv.id, { rescue_count: conv.rescue_count + 1 });
      }
    } catch (e) {
      this.logger.warn(`scheduled follow-up skipped (${job.kind}): ${(e as Error).message}`);
    }
  }
}

