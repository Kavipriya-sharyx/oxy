import { BadRequestException, Injectable, NotFoundException, Logger, Optional } from "@nestjs/common";
import { QuietHoursError } from "@Helper/WhatsappErrors";
import { FollowUpSchedulerService } from "./FollowUpScheduler.service";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { DateWindowService } from "./DateWindow.service";
import { DataSource, EntityManager } from "typeorm";
import { centre } from "@Database/Table/Oxxy/centre";
import { customer } from "@Database/Table/Oxxy/customer";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { activation } from "@Database/Table/Oxxy/activation";
import { user } from "@Database/Table/Admin/user";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { WhatsappClient } from "./WhatsappClient.service";

export interface CreateBooking {
  customer_id: string;
  conversation_id: string;
  centre_id: string;
  specialisation?: string;
  preferred_date: string;
  preferred_time?: string;
}

export type BookingNotice = { state: "sent" } | { state: "scheduled"; at: string } | { state: "failed"; problem: string };

/** Why the WhatsApp message did not go out, in words the sales team can act on */
export function sendProblem(e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? "unknown error");
  const code = (e as { metaCode?: number })?.metaCode;
  if (/template .* is (rejected|paused|disabled)/i.test(msg)) return `${msg.replace(/^template /, "the template ")}. Fix it in Meta, then Templates -> Read status from Meta.`;
  if (code === 132001 || /template name .*does not exist|132001/i.test(msg))
    return "the template booking_confirmed is not approved in Meta for this language yet (Templates screen).";
  if (code === 132000 || /number of parameters|132000/i.test(msg)) return "the approved template has a different number of variables than the bot sends.";
  if (code === 190 || /access token|session has expired|OAuth/i.test(msg)) return "the WhatsApp access token is invalid or expired (Configuration).";
  if (code === 131026 || /131026|undeliverable/i.test(msg)) return "WhatsApp could not deliver to this number.";
  if (/opted out|opt-out|opt_out/i.test(msg)) return "the customer has opted out (STOP).";
  if (/quiet hours/i.test(msg)) return "it is quiet hours and the message could not be queued for 09:00.";
  return msg.slice(0, 200);
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly _DateWindow: DateWindowService,
    private readonly _DataSource: DataSource,
    private readonly _Outbox: CrmOutboxService,
    private readonly _Wa: WhatsappClient,
    @Optional() private readonly _Scheduler?: FollowUpSchedulerService,
  ) {}

  // Bot path: always saved as pending_confirmation
  async create(data: CreateBooking) {
    const check = this._DateWindow.validate(data.preferred_date);
    if (!check.valid) {
      throw new BadRequestException(
        `Booking date must be between ${check.min} and ${check.max} (${check.reason})`,
      );
    }
    // booking + CRM outbox row in one transaction
    const { b, ob } = await this._DataSource.transaction(async (m) => {
      const saved = await m.save(
        m.create(booking_request, {
          ...data,
          booking_status: BookingStatus.PendingConfirmation,
        } as any),
      );
      const row = await this._Outbox.enqueue(
        m,
        CrmAction.CreateBookingRequest,
        data.customer_id,
        await this.crmPayload((saved as any).id, data, m), // also the pull feed, so always built
      );
      return { b: saved as any, ob: row };
    });
    await this._Outbox.dispatch(ob);
    return b;
  }

  /** Playbook 17.2 booking payload (plus the bot's own ids so the CRM can answer with webhooks) */
  private async crmPayload(bookingId: string, data: CreateBooking, m: EntityManager) {
    const ctr = await m.findOne(centre, { where: { id: data.centre_id } });
    const cust = await m.findOne(customer, { where: { id: data.customer_id } });
    const conv = data.conversation_id
      ? await m.findOne(conversation, { where: { id: data.conversation_id } })
      : null;
    const act = await m.findOne(activation, {
      where: { customer_id: data.customer_id },
      order: { created_on: "DESC" } as any,
    });
    const product = cust?.active_product || conv?.selected_product || null;
    const plan = cust?.active_plan || conv?.recommended_plan || null;
    return {
      booking_id: bookingId,
      customer_id: data.customer_id,
      crm_customer_id: cust?.crm_customer_id ?? null,
      conversation_id: data.conversation_id ?? null,
      centre: { centre_id: data.centre_id, name: ctr?.name ?? null, branch: ctr?.branch ?? null },
      specialisation: data.specialisation ?? null,
      preferred_date: data.preferred_date,
      preferred_time: data.preferred_time ?? null,
      timezone: "Asia/Kolkata",
      selected_product: product === "oxxy" && plan ? `oxxy_${plan}` : product,
      activation_status: cust?.active_product ? "active" : (act?.activation_status ?? "none"),
      request_status: BookingStatus.PendingConfirmation,
      source: "whatsapp_ai",
    };
  }

  // Human path: only called from the JWT-protected controller
  // Full Plan 12.9: the sales team confirms bookings in the CRM. Console confirmation is only for a
  // deployment without the CRM (CRM_ENABLED=false); then the customer is told on WhatsApp here.
  async confirm(id: string, userId: string) {
    if (this._Outbox.enabled)
      throw new BadRequestException(
        "Bookings are confirmed in the CRM. The CRM webhook updates this list.",
      );
    const b = await booking_request.findOne({ where: { id }, relations: ["centre"] });
    if (!b) throw new NotFoundException("Booking not found");
    if (b.booking_status !== BookingStatus.PendingConfirmation)
      throw new BadRequestException("Booking is not pending");
    b.booking_status = BookingStatus.Confirmed;
    b.confirmed_by_id = userId;
    b.updated_by_id = userId;
    b.updated_on = new Date();
    const u = await user.findOne({ where: { id: userId } });
    const ob = await this._DataSource.transaction(async (m) => {
      await m.save(b);
      return await this._Outbox.enqueue(m, CrmAction.ConfirmBooking, b.customer_id, {
        booking_id: b.id,
        crm_booking_id: b.crm_booking_id ?? null,
        confirmed_by_crm_user_id: u?.crm_user_id ?? null,
      });
    });
    await this._Outbox.dispatch(ob);
    // The booking stays confirmed whatever happens to the message, but the console is always told what
    // happened: sent now, waiting for 09:00 IST (quiet hours: never dropped), or not sent and why.
    const params = [b.centre?.name ?? "the centre", b.preferred_date];
    let notice: BookingNotice;
    try {
      await this._Wa.send(
        b.customer_id,
        { kind: "template", name: "booking_confirmed", languageCode: "en", params },
        "proactive",
      );
      notice = { state: "sent" };
    } catch (e) {
      if (e instanceof QuietHoursError && this._Scheduler) {
        await this._Scheduler.create({
          customerId: b.customer_id,
          conversationId: b.conversation_id ?? null,
          kind: "status_update",
          scheduledFor: e.nextAllowedAt,
          templateName: "booking_confirmed",
          params,
          reason: "booking_confirmed: quiet hours, sent at 09:00 IST",
          source: "console",
        } as any);
        notice = { state: "scheduled", at: e.nextAllowedAt.toISOString() };
      } else {
        this.logger.warn(`booking ${b.id} confirmed, WhatsApp message not sent: ${(e as Error).message}`);
        notice = { state: "failed", problem: sendProblem(e) };
      }
    }
    return Object.assign(b, { notice });
  }

  async list(status?: string) {
    return await booking_request
      .createQueryBuilder("b")
      .addSelect("b.created_on")
      .leftJoinAndSelect("b.customer", "customer")
      .leftJoinAndSelect("b.centre", "centre")
      .where(status ? "b.booking_status = :status" : "1=1", { status })
      .orderBy("b.created_on", "DESC")
      .take(300)
      .getMany();
  }

  get confirmsInConsole(): boolean {
    return !this._Outbox.enabled;
  }

  async listPending() {
    return await booking_request.find({
      where: { booking_status: BookingStatus.PendingConfirmation },
      relations: ["customer", "centre"],
    });
  }
}
