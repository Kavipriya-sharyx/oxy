import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { DataSource } from "typeorm";
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

type Data = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

@Injectable()
export class CrmWebhookService {
  private readonly logger = new Logger(CrmWebhookService.name);

  constructor(
    private readonly _Encryption: EncryptionService,
    private readonly _Wa: WhatsappClient,
    private readonly _DataSource: DataSource,
    private readonly _ConvRepo: ConversationRepository,
    private readonly _DateWindow: DateWindowService,
  ) {}

  // Store first, then process. A resend of the same event_id is ignored.
  async handle(body: { event_id?: string; event_type?: string; data?: Data }): Promise<"ok" | "duplicate" | "invalid"> {
    const eventId = str(body?.event_id);
    const type = str(body?.event_type);
    if (!eventId || !type) return "invalid";
    if (await crm_webhook_event.findOne({ where: { event_id: eventId } })) return "duplicate";

    let ev: crm_webhook_event;
    try {
      ev = await crm_webhook_event.save(
        crm_webhook_event.create({ event_id: eventId, event_type: type, payload: (body.data ?? {}) as Data }),
      );
    } catch {
      return "duplicate"; // two requests raced on the primary key
    }
    try {
      await this.process(type, (body.data ?? {}) as Data);
      ev.processed_at = new Date();
    } catch (e) {
      ev.error = String((e as Error).message).slice(0, 1000);
      this.logger.error(`CRM event ${eventId} (${type}) failed: ${ev.error}`);
    }
    await ev.save();
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
        return await this.activationFailed(d);
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

  private async sendBookingTemplate(b: booking_request, templateName: string) {
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
    } catch (e) {
      this.logger.warn(`CRM webhook WhatsApp send (${templateName}) failed: ${(e as Error).message}`);
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
    b.updated_on = new Date();
    if (crmId && !b.crm_booking_id) b.crm_booking_id = crmId;
    await b.save();
    await this.sendBookingTemplate(b, "booking_confirmed");
  }

  private async bookingCancelled(d: Data) {
    const { b, crmId } = await this.findBooking(d);
    if (b.booking_status === BookingStatus.Cancelled) return;
    b.booking_status = BookingStatus.Cancelled;
    b.updated_on = new Date();
    if (crmId && !b.crm_booking_id) b.crm_booking_id = crmId;
    await b.save();
    await this.sendBookingTemplate(b, "booking_cancelled");
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
    await this.sendBookingTemplate(b, "booking_confirmed");
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
  }

  private async activationFailed(d: Data) {
    const id = str(d.activation_id);
    const crmId = str(d.crm_activation_id);
    const a = await activation.findOne({ where: id ? { id } : { crm_activation_id: crmId ?? "" } });
    if (!a) throw new Error("activation not found");
    a.payment_status = PaymentStatus.Failed;
    a.activation_status = ActivationStatus.Failed;
    await a.save();
  }

  private async customerOwnerChanged(d: Data) {
    const id = str(d.customer_id);
    const ownerId = str(d.crm_user_id) ?? str(d.owner_id);
    this.logger.log(`CRM owner changed for customer ${id ?? "unknown"} -> ${ownerId ?? "unknown"}`);
  }

  private async customerOptedOut(d: Data) {
    const id = str(d.customer_id);
    const crmId = str(d.crm_customer_id);
    const wa = str(d.whatsapp) ?? str(d.wa_number);
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
    t.updated_on = new Date();
    await t.save();

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
    let u = (await user.findOne({ where: { crm_user_id: crmId } })) ?? (await user.findOne({ where: { email } }));
    if (u) {
      u.crm_user_id = crmId;
      u.first_name = str(d.first_name) ?? u.first_name;
      u.last_name = str(d.last_name) ?? u.last_name;
      u.updated_on = new Date();
      await u.save();
      return;
    }
    const role =
      (await user_role.findOne({ where: { name: str(d.role) ?? "agent" } })) ??
      (await user_role.findOne({ where: { name: "agent" } }));
    if (!role) throw new Error("no agent role");
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
