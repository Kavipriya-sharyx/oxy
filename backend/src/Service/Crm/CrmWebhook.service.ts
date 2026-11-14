import { RoleEnum } from "@Helper/Enum/RoleEnum";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";
import { AnalyticsService } from "./Analytics.service";
import { FollowUpSchedulerService } from "@Service/Oxxy/FollowUpScheduler.service";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { randomBytes } from "crypto";
import { DataSource, IsNull, LessThan } from "typeorm";
import { crm_webhook_event } from "@Database/Table/Crm/crm_webhook_event";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { consent } from "@Database/Table/Oxxy/consent";
import { customer } from "@Database/Table/Oxxy/customer";
import { task } from "@Database/Table/Oxxy/task";
import { user } from "@Database/Table/Admin/user";
import { user_role } from "@Database/Table/Admin/user_role";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { EncryptionService } from "@Service/Encryption.service";
import { ConversationRepository } from "@Service/Oxxy/ConversationRepository.service";
import { InvalidTransitionError } from "@Service/Oxxy/ConversationStateMachine";
import { DateWindowService } from "@Service/Oxxy/DateWindow.service";
import { WhatsappClient } from "@Service/Oxxy/WhatsappClient.service";
import { normaliseWa } from "@Service/Crm/BotActions.service";
import { ChangeFeedService } from "@Service/Crm/ChangeFeed.service";

type Data = Record<string, unknown>;
const QUEUE = "crm-webhook";
const ATTEMPTS = 3;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

@Injectable()
export class CrmWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmWebhookService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly _Encryption: EncryptionService,
    private readonly _Wa: WhatsappClient,
    private readonly _DataSource: DataSource,
    private readonly _ConvRepo: ConversationRepository,
    private readonly _DateWindow: DateWindowService,
    @Optional() private readonly _Analytics?: AnalyticsService,
    @Optional() private readonly _Scheduler?: FollowUpSchedulerService,
    @Optional() private readonly _Feed?: ChangeFeedService,
  ) {}

  /**
   * The same changes as the signed webhooks, called directly by the Actions API for a CRM that pulls instead of
   * pushing (booking confirmed / rescheduled / cancelled, payment result, task done). Throws on bad data:
   * "… not found", "missing preferred_date", "date out of window: …".
   */
  async apply(type: string, data: Data): Promise<void> {
    await this.process(type, data);
  }

  private feed(type: string, customerId: string | null, data: Data) {
    return this._Feed?.record(null, type, customerId, { ...data, at: new Date().toISOString() });
  }

  // Full Plan 3.3: store -> 200 -> BullMQ. One worker (concurrency 1) keeps the CRM's order, 3 attempts with
  // backoff, and a sweeper re-queues anything stored but never processed (Redis loss, crash). Without Redis
  // (tests) the event is processed inline as before.
  async onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    const connection = redisConnection();
    const prefix = queuePrefix();
    this.queue = new Queue(QUEUE, { connection, prefix });
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name === "sweep") return await this.sweep();
        const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        return await this.processStored(String(job.data.eventId), { rethrow: !last });
      },
      { connection, prefix, concurrency: 1 },
    );
    this.worker.on("error", (e) => this.logger.error(`webhook worker error: ${e.message}`));
    await this.queue.upsertJobScheduler("crm-webhook-sweep", { every: 60_000 }, { name: "sweep" });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** stored more than a minute ago, never processed, no error: the queue lost it */
  async sweep(): Promise<number> {
    const lost = await crm_webhook_event.find({
      where: {
        processed_at: IsNull(),
        error: IsNull(),
        received_at: LessThan(new Date(Date.now() - 60_000)),
      },
      order: { received_at: "ASC" } as any,
      take: 50,
    });
    for (const ev of lost) await this.enqueue(ev.event_id);
    return lost.length;
  }

  private async enqueue(eventId: string): Promise<boolean> {
    if (!this.queue) return false;
    try {
      await this.queue.add(
        "event",
        { eventId },
        {
          jobId: eventId,
          attempts: ATTEMPTS,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: 500,
        },
      );
      return true;
    } catch (e) {
      this.logger.warn(`webhook enqueue failed, processing inline: ${(e as Error).message}`);
      return false;
    }
  }

  /** run one stored event; a processed one is skipped (a resend or a second job is harmless) */
  async processStored(eventId: string, opts: { rethrow?: boolean } = {}): Promise<void> {
    const ev = await crm_webhook_event.findOne({ where: { event_id: eventId } });
    if (!ev || ev.processed_at) return;
    try {
      await this.process(ev.event_type, (ev.payload ?? {}) as Data);
      ev.processed_at = new Date();
      ev.error = null;
    } catch (e) {
      ev.error = String((e as Error).message).slice(0, 1000);
      this.logger.error(`CRM event ${eventId} (${ev.event_type}) failed: ${ev.error}`);
      if (opts.rethrow) {
        await ev.save();
        throw e;
      }
    }
    await ev.save();
  }

  // Store first, then process. A resend of the same event_id is ignored.
  async handle(body: {
    event_id?: string;
    event_type?: string;
    data?: Data;
  }): Promise<"ok" | "duplicate" | "invalid"> {
    const eventId = str(body?.event_id);
    const type = str(body?.event_type);
    if (!eventId || !type) return "invalid";
    if (await crm_webhook_event.findOne({ where: { event_id: eventId } })) return "duplicate";

    let ev: crm_webhook_event;
    try {
      ev = await crm_webhook_event.save(
        crm_webhook_event.create({
          event_id: eventId,
          event_type: type,
          payload: (body.data ?? {}) as Data,
        }),
      );
    } catch {
      return "duplicate"; // two requests raced on the primary key
    }
    if (await this.enqueue(ev.event_id)) return "ok";
    await this.processStored(ev.event_id);
    return "ok";
  }

  private async process(type: string, d: Data) {
    switch (type) {
      case "booking.confirmed":
        return await this.bookingConfirmed(d);
      case "booking.rescheduled":
        return await this.bookingRescheduled(d);
      case "booking.cancelled":
        return await this.bookingCancelled(d);
      case "activation.paid":
        return await this.activationPaid(d);
      case "activation.failed":
      case "activation.refunded":
        return await this.activationFailed(d, type);
      case "customer.opted_out":
        return await this.customerOptedOut(d);
      case "customer.owner_changed":
        return await this.customerOwnerChanged(d);
      case "task.completed":
        return await this.taskCompleted(d);
      case "task.updated":
        return await this.taskUpdated(d);
      case "user.upserted":
        return await this.userUpserted(d);
      default:
        throw new Error(`unknown event_type: ${type}`);
    }
  }

  private async findBooking(d: Data): Promise<{ b: booking_request; crmId: string | null }> {
    const id = str(d.booking_id);
    const crmId = str(d.crm_booking_id);
    const b = await booking_request.findOne({
      where: id ? { id } : { crm_booking_id: crmId ?? "" },
      relations: ["centre"],
    });
    if (!b) throw new Error("booking not found");
    return { b, crmId };
  }

  private async sendBookingTemplate(b: booking_request, templateName: string): Promise<boolean> {
    try {
      await this._Wa.send(
        b.customer_id,
        {
          kind: "template",
          name: templateName,
          languageCode: "en",
          params: [b.centre?.name ?? "Oxxy centre", b.preferred_date],
        },
        "proactive",
      );
      return true;
    } catch (e) {
      this.logger.warn(
        `CRM webhook WhatsApp send (${templateName}) failed: ${(e as Error).message}`,
      );
      return false;
    }
  }

  // The sales team confirmed in the CRM -> update our mirror & notify customer
  private async bookingConfirmed(d: Data) {
    const { b, crmId } = await this.findBooking(d);
    if (b.booking_status !== BookingStatus.PendingConfirmation) return; // already handled
    const crmUser = str(d.confirmed_by_crm_user_id);
    const u = crmUser ? await user.findOne({ where: { crm_user_id: crmUser } }) : null;
    b.booking_status = BookingStatus.Confirmed;
    b.confirmed_by_id = u?.id ?? null;
    b.confirmed_by_name = str(d.confirmed_by_name) ?? b.confirmed_by_name ?? null;
    b.updated_on = new Date();
    if (crmId && !b.crm_booking_id) b.crm_booking_id = crmId;
    await b.save();
    await this.feed("booking.confirmed", b.customer_id, {
      booking_id: b.id,
      crm_booking_id: b.crm_booking_id ?? null,
      preferred_date: b.preferred_date,
      preferred_time: b.preferred_time ?? null,
      confirmed_by: b.confirmed_by_name ?? crmUser ?? null,
      source: str(d.source) ?? "crm",
    });
    await this.sendBookingTemplate(b, "booking_confirmed");
  }

  private async bookingCancelled(d: Data) {
    const { b, crmId } = await this.findBooking(d);
    if (b.booking_status === BookingStatus.Cancelled) return;
    b.booking_status = BookingStatus.Cancelled;
    b.updated_on = new Date();
    if (crmId && !b.crm_booking_id) b.crm_booking_id = crmId;
    await b.save();
    await this.feed("booking.cancelled", b.customer_id, {
      booking_id: b.id,
      crm_booking_id: b.crm_booking_id ?? null,
      reason: str(d.reason),
      source: str(d.source) ?? "crm",
    });
    // Full Plan 3.3: tell the customer and offer another centre ONCE per conversation. A later
    // cancellation only informs (booking_cancelled_info has no question).
    const earlier = await booking_request.count({
      where: { conversation_id: b.conversation_id, booking_status: BookingStatus.Cancelled },
    });
    const offer = earlier <= 1 && !!b.conversation_id;
    const sent = await this.sendBookingTemplate(
      b,
      offer ? "booking_cancelled" : "booking_cancelled_info",
    );
    if (sent && offer)
      await conversation.update(b.conversation_id, { pending_action: `rebook_offer:${b.id}` });
  }

  private async bookingRescheduled(d: Data) {
    const { b, crmId } = await this.findBooking(d);
    const newDate = str(d.preferred_date);
    if (!newDate) throw new Error("missing preferred_date");
    const chk = this._DateWindow.validate(newDate);
    if (!chk.valid) throw new Error(`date out of window: ${newDate}`);
    b.preferred_date = newDate;
    if (str(d.preferred_time)) b.preferred_time = str(d.preferred_time)!;
    b.updated_on = new Date();
    if (crmId && !b.crm_booking_id) b.crm_booking_id = crmId;
    await b.save();
    await this.feed("booking.rescheduled", b.customer_id, {
      booking_id: b.id,
      crm_booking_id: b.crm_booking_id ?? null,
      preferred_date: b.preferred_date,
      preferred_time: b.preferred_time ?? null,
      source: str(d.source) ?? "crm",
    });
    await this.sendBookingTemplate(b, "booking_rescheduled");
  }

  private async activationPaid(d: Data) {
    const id = str(d.activation_id);
    const crmId = str(d.crm_activation_id);
    const a = await activation.findOne({ where: id ? { id } : { crm_activation_id: crmId ?? "" } });
    if (!a) throw new Error("activation not found");
    a.payment_status = PaymentStatus.Paid;
    a.activation_status = ActivationStatus.Active;
    a.updated_on = new Date();
    if (crmId && !a.crm_activation_id) a.crm_activation_id = crmId;
    await a.save();
    await customer.update(a.customer_id, {
      active_product: a.product,
      active_plan: a.plan,
    });
    await this.feed("activation.paid", a.customer_id, {
      activation_id: a.id,
      crm_activation_id: a.crm_activation_id ?? null,
      product: a.product,
      plan: a.plan ?? null,
      billing: a.billing,
      source: str(d.source) ?? "crm",
    });
    // conversion attribution (Trigger layer 13); no more reminders for this product
    await this._Analytics?.attributeConversion(a.id);
    await this._Scheduler?.cancelAll(a.customer_id, "product_active");
    await conversation.update(
      { customer_id: a.customer_id, closed_at: IsNull() },
      { outcome: "activated" },
    );
    // Trigger P (plan 3.3): tell the customer the activation is verified
    try {
      await this._Wa.send(
        a.customer_id,
        {
          kind: "template",
          name: "activation_confirmed",
          languageCode: "en",
          params: [
            a.product === "cut_medi_bills" ? "Cut Medi Bills" : `Oxxy ${a.plan ?? ""}`.trim(),
          ],
        },
        "proactive",
      );
    } catch (e) {
      this.logger.warn(
        `CRM webhook WhatsApp send (activation_confirmed) failed: ${(e as Error).message}`,
      );
    }
  }

  private async activationFailed(d: Data, type = "activation.failed") {
    const id = str(d.activation_id);
    const crmId = str(d.crm_activation_id);
    const a = await activation.findOne({ where: id ? { id } : { crm_activation_id: crmId ?? "" } });
    if (!a) throw new Error("activation not found");
    a.payment_status = PaymentStatus.Failed;
    a.activation_status = ActivationStatus.Failed;
    if (crmId && !a.crm_activation_id) a.crm_activation_id = crmId;
    await a.save();
    await this.feed(type, a.customer_id, {
      activation_id: a.id,
      crm_activation_id: a.crm_activation_id ?? null,
      product: a.product,
      source: str(d.source) ?? "crm",
    });
  }

  private async customerOwnerChanged(d: Data) {
    const id = str(d.customer_id);
    const ownerId = str(d.crm_user_id) ?? str(d.owner_id);
    this.logger.log(`CRM owner changed for customer ${id ?? "unknown"} -> ${ownerId ?? "unknown"}`);
  }

  private async customerOptedOut(d: Data) {
    const id = str(d.customer_id);
    const crmId = str(d.crm_customer_id);
    // "+91 98400 12345", "09840012345" and "919840012345" all find the same customer
    const wa = normaliseWa(str(d.whatsapp) ?? str(d.wa_number));
    const c = id
      ? await customer.findOne({ where: { id } })
      : crmId
        ? await customer.findOne({ where: { crm_customer_id: crmId } })
        : wa
          ? await customer.findOne({ where: { wa_number: wa } })
          : null;
    if (!c) throw new Error("customer not found");

    const at = new Date();
    await this._DataSource.transaction(async (mg) => {
      let cons = await mg.findOne(consent, { where: { customer_id: c.id } });
      if (!cons) cons = mg.create(consent, { customer_id: c.id });
      cons.opt_out_at = cons.opt_out_at ?? at;
      cons.marketing_consent = false;
      await mg.save(cons);

      const open = await this._ConvRepo.findOpenByCustomer(c.id, mg);
      if (open && open.state !== ConversationState.OptedOut) {
        try {
          await this._ConvRepo.transition(open.id, ConversationState.OptedOut, {
            reason: "crm customer.opted_out",
            manager: mg,
          });
        } catch (e) {
          if (!(e instanceof InvalidTransitionError)) throw e;
        }
      }
    });
    await this._Scheduler?.cancelAll(c.id, "opt_out");
  }

  // The same changes the CRM webhooks make, for a deployment WITHOUT the CRM, where a person does
  // them in the console. With the CRM on, only the signed webhooks may make these changes.
  async completeTaskFromConsole(taskId: string) {
    await this.taskCompleted({ task_id: taskId });
  }
  async markActivationFromConsole(activationId: string, paid: boolean) {
    if (paid) await this.activationPaid({ activation_id: activationId });
    else await this.activationFailed({ activation_id: activationId });
  }

  private async taskCompleted(d: Data) {
    const id = str(d.task_id);
    const crmId = str(d.crm_task_id);
    const t = id
      ? await task.findOne({ where: { id } })
      : crmId
        ? await task.findOne({ where: { crm_task_id: crmId } })
        : null;
    if (!t) throw new Error("task not found");
    t.task_status = TaskStatus.Done;
    if (str(d.outcome)) t.outcome = str(d.outcome);
    t.updated_on = new Date();
    await t.save();
    await this.feed("task.completed", t.customer_id, {
      task_id: t.id,
      crm_task_id: t.crm_task_id ?? null,
      type: t.type,
      outcome: t.outcome ?? null,
      source: str(d.source) ?? "crm",
    });

    if (!t.conversation_id) return;
    const conv = await this._ConvRepo.findById(t.conversation_id);
    if (!conv) return;
    try {
      if (conv.state === ConversationState.Escalated) {
        await this._ConvRepo.resolveEscalation(conv.id);
      } else if (conv.state === ConversationState.Pause) {
        await this._ConvRepo.resolveSafetyEvent(conv.id);
      }
    } catch (e) {
      if (!(e instanceof InvalidTransitionError)) throw e;
    }
  }

  private async taskUpdated(d: Data) {
    const crmId = str(d.crm_task_id);
    const status = str(d.task_status);
    if (!crmId || !status || !Object.values(TaskStatus).includes(status as TaskStatus))
      throw new Error("bad task.updated payload");
    const t = await task.findOne({ where: { crm_task_id: crmId } });
    if (!t) throw new Error("task not found");
    t.task_status = status;
    t.updated_on = new Date();
    await t.save();
  }

  // CRM sales user mirrored here. They get a random password, so they cannot log in to this console.
  private async userUpserted(d: Data) {
    const crmId = str(d.crm_user_id);
    const email = str(d.email);
    if (!crmId || !email) throw new Error("bad user.upserted payload");
    let u =
      (await user.findOne({ where: { crm_user_id: crmId } })) ??
      (await user.findOne({ where: { email } }));
    if (u) {
      u.crm_user_id = crmId;
      u.first_name = str(d.first_name) ?? u.first_name;
      u.last_name = str(d.last_name) ?? u.last_name;
      u.updated_on = new Date();
      await u.save();
      return;
    }
    const role =
      (await user_role.findOne({ where: { name: str(d.role) ?? RoleEnum.User } })) ??
      (await user_role.findOne({ where: { name: RoleEnum.User } }));
    if (!role) throw new Error("no User role");
    u = user.create({
      email,
      crm_user_id: crmId,
      first_name: str(d.first_name),
      last_name: str(d.last_name),
      user_role_id: role.id,
      password: this._Encryption.Encrypt(randomBytes(32).toString("hex")),
    } as any) as unknown as user;
    await u.save();
  }
}
