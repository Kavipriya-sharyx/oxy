import { FrequencyCapError } from "@Helper/WhatsappErrors";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";
import { WhatsappClient } from "./WhatsappClient.service";
import { isQuietHours, isWithin24h, nextAllowedAt } from "./WhatsappRules";
import { activation } from "@Database/Table/Oxxy/activation";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { customer } from "@Database/Table/Oxxy/customer";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { MAX_RESCUES, RESCUE_DELAYS_MS, RESCUE_TEMPLATES } from "./RecoveryFlow";

const QUEUE = "scheduled";

// lead_intro: a StartConversation that came in during quiet hours, sent at 09:00 IST
export type FollowUpKind =
  | "agreed_follow_up"
  | "rescue"
  | "trigger_q"
  | "booking_update"
  | "lead_intro";

export interface FollowUpJob {
  customerId: string;
  conversationId: string;
  kind: FollowUpKind;
  templateName: string;
  params?: string[];
  followUpId?: string; // the follow_up row (the record); the job is only the alarm clock
}

export interface NewFollowUp {
  customerId: string;
  conversationId: string | null;
  kind: FollowUpKind;
  scheduledFor: Date;
  templateName: string;
  reason?: string | null;
  selectedProduct?: string | null;
  source?: string | null;
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

  /** Saves the follow_up row (the record) and sets the alarm. Returns the row. */
  async create(f: NewFollowUp): Promise<follow_up> {
    const row = await follow_up.save(
      follow_up.create({
        customer_id: f.customerId,
        conversation_id: f.conversationId,
        kind: f.kind,
        scheduled_for: f.scheduledFor,
        template_name: f.templateName,
        reason: f.reason ?? null,
        selected_product: f.selectedProduct ?? null,
        source: f.source ?? null,
        follow_up_status: "scheduled",
      } as any),
    );
    await this.schedule(
      {
        customerId: f.customerId,
        conversationId: f.conversationId ?? "",
        kind: f.kind,
        templateName: f.templateName,
        params: f.params,
        followUpId: row.id,
      },
      f.scheduledFor.getTime() - Date.now(),
    );
    return row;
  }

  /** Cancels every scheduled follow-up of a customer (STOP, privacy request, product active) */
  async cancelAll(customerId: string, reason: string): Promise<number> {
    const res = await follow_up.update({ customer_id: customerId, follow_up_status: "scheduled" }, {
      follow_up_status: "cancelled",
      skip_reason: reason,
      updated_on: new Date(),
    } as any);
    return res.affected ?? 0;
  }

  /** Cancels the scheduled follow-ups of these kinds in one conversation (e.g. rescues when the customer replies) */
  async cancelForConversation(
    conversationId: string,
    kinds: FollowUpKind[],
    reason: string,
  ): Promise<number> {
    let n = 0;
    for (const kind of kinds) {
      const res = await follow_up.update(
        { conversation_id: conversationId, kind, follow_up_status: "scheduled" },
        { follow_up_status: "cancelled", skip_reason: reason, updated_on: new Date() } as any,
      );
      n += res.affected ?? 0;
    }
    return n;
  }

  /** Something is already waiting for this conversation (a rescue or an agreed follow-up) */
  async hasScheduled(conversationId: string, kinds: FollowUpKind[]): Promise<boolean> {
    for (const kind of kinds) {
      if (
        await follow_up.findOne({
          where: { conversation_id: conversationId, kind, follow_up_status: "scheduled" },
        })
      )
        return true;
    }
    return false;
  }

  private async finish(
    job: FollowUpJob,
    status: "sent" | "skipped" | "cancelled",
    reason?: string,
  ) {
    if (!job.followUpId) return;
    await follow_up.update(job.followUpId, {
      follow_up_status: status,
      skip_reason: reason ?? null,
      updated_on: new Date(),
    } as any);
  }

  // Everything is checked again at send time, not when the job was made (plan 12.8)
  async execute(job: FollowUpJob): Promise<void> {
    if (job.followUpId) {
      const row = await follow_up.findOne({ where: { id: job.followUpId } });
      if (!row || row.follow_up_status !== "scheduled") return; // cancelled meanwhile
    }
    const cons = await consent.findOne({ where: { customer_id: job.customerId } });
    if (cons?.opt_out_at || cons?.privacy_request_at)
      return this.finish(job, "cancelled", "opt_out");

    const conv = job.conversationId
      ? await conversation.findOne({ where: { id: job.conversationId } })
      : null;
    if (job.conversationId && (!conv || conv.closed_at))
      return this.finish(job, "skipped", "closed");
    if (
      conv &&
      (conv.state === ConversationState.Pause ||
        conv.state === ConversationState.Escalated ||
        conv.state === ConversationState.OptedOut)
    ) {
      return this.finish(
        job,
        "skipped",
        conv.state === ConversationState.Pause ? "emergency" : "active_complaint",
      );
    }
    if (job.kind === "rescue" && conv && conv.rescue_count >= 2)
      return this.finish(job, "skipped", "frequency_cap");
    if (job.kind === "trigger_q") {
      // only while the link is still unpaid, no product is active, and only once per journey
      const cust = await customer.findOne({ where: { id: job.customerId } });
      if (cust?.active_product) return this.finish(job, "skipped", "active_product");
      const unpaid = await activation.findOne({
        where: {
          customer_id: job.customerId,
          activation_status: ActivationStatus.LinkSent,
          payment_status: PaymentStatus.Pending,
        },
      });
      if (!unpaid) return this.finish(job, "skipped", "paid_or_cancelled");
      if (
        conv &&
        (await trigger_event.findOne({ where: { conversation_id: conv.id, trigger_id: "Q" } }))
      )
        return this.finish(job, "skipped", "duplicate");
      // the customer already said DONE (Trigger P): the team is verifying, no reminder
      if (
        conv &&
        (await trigger_event.findOne({ where: { conversation_id: conv.id, trigger_id: "P" } }))
      )
        return this.finish(job, "skipped", "payment_reported");
    }
    // the customer started chatting meanwhile: no first-contact template (the call context is already saved)
    if (
      job.kind === "lead_intro" &&
      conv &&
      (conv.state !== ConversationState.New || isWithin24h(conv.last_customer_message_at))
    )
      return this.finish(job, "skipped", "chat_open");
    if (isQuietHours(new Date())) {
      // never dropped: moved to 09:00 IST next morning (plan 12.8); everything is checked again then
      await this.schedule(job, nextAllowedAt(new Date()).getTime() - Date.now());
      return;
    }

    try {
      await this._Wa.send(
        job.customerId,
        { kind: "template", name: job.templateName, languageCode: "en", params: job.params },
        "proactive",
      );
      // the three lead buttons are answered by the lead_intro flow (Playbook 4.1)
      if (job.kind === "lead_intro" && conv)
        await conversation.update(conv.id, { pending_action: "lead_intro" });
      if (job.kind === "rescue" && conv) {
        const count = conv.rescue_count + 1;
        await conversation.update(conv.id, { rescue_count: count });
        // Playbook 15: at most two rescues in a row; the second is scheduled only after the first went out
        if (count < MAX_RESCUES) {
          await this.finish(job, "sent");
          await this.create({
            customerId: job.customerId,
            conversationId: conv.id,
            kind: "rescue",
            scheduledFor: new Date(Date.now() + RESCUE_DELAYS_MS[count]),
            templateName: RESCUE_TEMPLATES[count],
            reason: `no reply, rescue ${count + 1} of ${MAX_RESCUES}`,
            selectedProduct: conv.selected_product ?? null,
            source: "whatsapp_outbound",
          });
          return;
        }
      }
      if (job.kind === "trigger_q" && conv) {
        await trigger_event.save(
          trigger_event.create({
            customer_id: job.customerId,
            conversation_id: conv.id,
            trigger_id: "Q",
            reason: "link sent, payment not completed",
            conversation_source: "whatsapp_outbound",
            next_state: conv.state,
          } as any),
        );
      }
      await this.finish(job, "sent");
    } catch (e) {
      this.logger.warn(`scheduled follow-up skipped (${job.kind}): ${(e as Error).message}`);
      const reason =
        e instanceof FrequencyCapError
          ? "frequency_cap"
          : String((e as Error).name || "send_failed");
      await this.finish(job, "skipped", reason.slice(0, 60)); // frequency_cap: never retried the same day (15.1)
      // a reminder Meta blocked is still logged as Trigger Q, suppressed (Trigger layer 13: frequency_cap)
      if (reason === "frequency_cap" && job.kind === "trigger_q" && conv) {
        await trigger_event
          .save(
            trigger_event.create({
              customer_id: job.customerId,
              conversation_id: conv.id,
              trigger_id: "Q",
              reason: "link sent, payment not completed",
              conversation_source: "whatsapp_outbound",
              suppression_reason: "frequency_cap",
              next_state: conv.state,
            } as any),
          )
          .catch(() => undefined);
      }
    }
  }
}
