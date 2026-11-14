import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { activation } from "@Database/Table/Oxxy/activation";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { task } from "@Database/Table/Oxxy/task";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { assertId, sourceOf } from "./BotActions.service";
import { ChangeFeedService, FEED_PAGE_MAX } from "./ChangeFeed.service";
import { CrmWebhookService } from "./CrmWebhook.service";

// The client's CRM only calls the bot's API (it builds nothing the bot calls). It pulls changes from the feed,
// reads open bookings / tasks / payments, and makes the sales team's changes through these calls; they do the
// same work as the CRM webhooks (customer messages, product lock, Trigger P, follow-up cancelling).

type Body = Record<string, unknown>;
const text = (v: unknown, max = 200): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** 1..max, default def */
export function pageLimit(v: unknown, def = 100, max = FEED_PAGE_MAX): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : def;
}

/** Errors thrown by the shared webhook handlers -> Actions API errors */
export function mapApplyError(e: unknown): Error {
  const msg = (e as Error)?.message ?? String(e);
  if (/booking not found/.test(msg))
    return new NotFoundException({
      message: "Booking request not found",
      code: "booking_not_found",
    });
  if (/activation not found/.test(msg))
    return new NotFoundException({ message: "Activation not found", code: "activation_not_found" });
  if (/task not found/.test(msg))
    return new NotFoundException({ message: "Task not found", code: "task_not_found" });
  if (/missing preferred_date/.test(msg))
    return new BadRequestException({
      message: "preferred_date is required (YYYY-MM-DD)",
      code: "date_required",
    });
  if (/date out of window/.test(msg))
    return new BadRequestException({
      message: "preferred_date must be today + 3 days up to + 6 months (Asia/Kolkata)",
      code: "date_out_of_window",
    });
  return e as Error;
}

const customerOf = (c: any) =>
  c
    ? {
        customer_id: c.id,
        first_name: c.first_name ?? null,
        wa_number: c.wa_number ?? null,
        crm_customer_id: c.crm_customer_id ?? null,
      }
    : null;

export const BOOKING_LIST_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "changed",
  "cancelled",
  "all",
];
export const TASK_LIST_STATUSES = ["open", "in_progress", "done", "all", "not_done"];
export const PAYMENT_LIST_STATUSES = ["pending", "paid", "failed", "all"];

@Injectable()
export class CrmPullService {
  constructor(
    private readonly _Feed: ChangeFeedService,
    private readonly _Apply: CrmWebhookService,
  ) {}

  // ---- reading ----
  async changes(q: Record<string, string>) {
    const after = Math.max(0, Math.floor(Number(q.after ?? 0)) || 0);
    return this._Feed.list(after, pageLimit(q.limit));
  }

  /** All customers, oldest first, for the first import into the CRM (?limit=1..500&offset=) */
  async customers(q: Record<string, string>) {
    const offset = Math.max(0, Math.floor(Number(q.offset ?? 0)) || 0);
    const limit = pageLimit(q.limit);
    const rows = await customer
      .createQueryBuilder("c")
      .addSelect("c.created_on")
      .leftJoinAndMapOne("c.consent", consent, "consent", "consent.customer_id = c.id")
      .orderBy("c.created_on", "ASC")
      .addOrderBy("c.id", "ASC")
      .skip(offset)
      .take(limit + 1)
      .getMany();
    const page = rows.slice(0, limit);
    return {
      count: page.length,
      next_offset: rows.length > limit ? offset + limit : null,
      customers: page.map((c: any) => ({
        customer_id: c.id,
        crm_customer_id: c.crm_customer_id ?? null,
        lead_id: c.lead_id ?? null,
        first_name: c.first_name ?? null,
        wa_number: c.wa_number,
        language: c.language ?? null,
        active_product: c.active_product ?? null,
        active_plan: c.active_plan ?? null,
        opted_out: !!c.consent?.opt_out_at,
        created_at: c.created_on,
      })),
    };
  }

  /** Store the CRM's own id on a bot customer, so the feed and lists carry it */
  async linkCustomer(id: string, body: Body) {
    const c = await customer.findOne({ where: { id: assertId(id, "customer_id") } });
    if (!c)
      throw new NotFoundException({ message: "Customer not found", code: "customer_not_found" });
    const crmId = text(body.crm_customer_id, 120);
    if (!crmId)
      throw new BadRequestException({
        message: "crm_customer_id is required",
        code: "crm_customer_id_required",
      });
    const other = await customer.findOne({ where: { crm_customer_id: crmId } });
    if (other && other.id !== c.id)
      throw new ConflictException({
        message: "That CRM id is already linked to another customer",
        code: "crm_id_in_use",
      });
    await customer.update(c.id, { crm_customer_id: crmId });
    return { customer_id: c.id, crm_customer_id: crmId };
  }

  async bookings(q: Record<string, string>) {
    const status = q.status || "pending_confirmation";
    if (!BOOKING_LIST_STATUSES.includes(status))
      throw new BadRequestException({
        message: `status must be one of ${BOOKING_LIST_STATUSES.join(", ")}`,
        code: "invalid_status",
      });
    const qb = booking_request
      .createQueryBuilder("b")
      .addSelect("b.created_on")
      .leftJoinAndSelect("b.customer", "customer")
      .leftJoinAndSelect("b.centre", "centre")
      .orderBy("b.created_on", "ASC")
      .take(pageLimit(q.limit));
    if (status !== "all") qb.where("b.booking_status = :status", { status });
    if (q.customer_id)
      qb.andWhere("b.customer_id = :cid", { cid: assertId(q.customer_id, "customer_id") });
    const rows = await qb.getMany();
    return {
      count: rows.length,
      booking_requests: rows.map((b: any) => ({
        booking_request_id: b.id,
        status: b.booking_status,
        customer: customerOf(b.customer),
        centre: b.centre
          ? { centre_id: b.centre.id, name: b.centre.name, branch: b.centre.branch ?? null }
          : null,
        specialisation: b.specialisation,
        preferred_date: b.preferred_date,
        preferred_time: b.preferred_time ?? null,
        timezone: "Asia/Kolkata",
        crm_booking_id: b.crm_booking_id ?? null,
        confirmed_by: b.confirmed_by_name ?? null,
        created_at: b.created_on,
      })),
    };
  }

  async tasks(q: Record<string, string>) {
    const status = q.status || "not_done";
    if (!TASK_LIST_STATUSES.includes(status))
      throw new BadRequestException({
        message: `status must be one of ${TASK_LIST_STATUSES.join(", ")}`,
        code: "invalid_status",
      });
    const qb = task
      .createQueryBuilder("t")
      .addSelect("t.created_on")
      .leftJoinAndSelect("t.customer", "customer")
      .orderBy("t.created_on", "ASC")
      .take(pageLimit(q.limit));
    if (status === "not_done") qb.where("t.task_status <> :done", { done: TaskStatus.Done });
    else if (status !== "all") qb.where("t.task_status = :status", { status });
    if (q.type) qb.andWhere("t.type = :type", { type: String(q.type) });
    const rows = await qb.getMany();
    const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    rows.sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9));
    return {
      count: rows.length,
      tasks: rows.map((t: any) => ({
        task_id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.task_status,
        reason: t.reason ?? null,
        summary: t.summary ?? null,
        customer: customerOf(t.customer),
        callback_window: t.callback_from ? { from: t.callback_from, to: t.callback_to } : null,
        crm_task_id: t.crm_task_id ?? null,
        outcome: t.outcome ?? null,
        created_at: t.created_on,
      })),
    };
  }

  async activations(q: Record<string, string>) {
    const status = q.payment_status || "pending";
    if (!PAYMENT_LIST_STATUSES.includes(status))
      throw new BadRequestException({
        message: `payment_status must be one of ${PAYMENT_LIST_STATUSES.join(", ")}`,
        code: "invalid_status",
      });
    const qb = activation
      .createQueryBuilder("a")
      .addSelect("a.created_on")
      .leftJoinAndSelect("a.customer", "customer")
      .orderBy("a.created_on", "ASC")
      .take(pageLimit(q.limit));
    if (status !== "all") qb.where("a.payment_status = :status", { status });
    const rows = await qb.getMany();
    return {
      count: rows.length,
      activations: rows.map((a: any) => ({
        activation_id: a.id,
        customer: customerOf(a.customer),
        product: a.product,
        plan: a.plan ?? null,
        billing: a.billing,
        price: a.price != null ? Number(a.price) : null,
        gst_rate: a.gst_rate != null ? Number(a.gst_rate) : null,
        link_sent_at: a.link_sent_at ?? null,
        payment_status: a.payment_status,
        activation_status: a.activation_status,
        crm_activation_id: a.crm_activation_id ?? null,
        created_at: a.created_on,
      })),
    };
  }

  // ---- changes the sales team makes in the CRM ----
  private async run(type: string, data: Record<string, unknown>) {
    try {
      await this._Apply.apply(type, data);
    } catch (e) {
      throw mapApplyError(e);
    }
  }

  private async booking(id: string) {
    const b = await booking_request.findOne({ where: { id: assertId(id, "booking_request_id") } });
    if (!b)
      throw new NotFoundException({
        message: "Booking request not found",
        code: "booking_not_found",
      });
    return b;
  }

  private bookingView(b: booking_request) {
    return {
      booking_request_id: b.id,
      status: b.booking_status,
      preferred_date: b.preferred_date,
      preferred_time: b.preferred_time ?? null,
      crm_booking_id: b.crm_booking_id ?? null,
      confirmed_by: b.confirmed_by_name ?? null,
    };
  }

  async confirmBooking(id: string, body: Body) {
    const b = await this.booking(id);
    const by = text(body.confirmed_by, 120);
    if (!by)
      throw new BadRequestException({
        message: "confirmed_by (the sales person's name or email) is required",
        code: "confirmed_by_required",
      });
    if (b.booking_status !== BookingStatus.PendingConfirmation)
      throw new ConflictException({
        message: `The booking is ${b.booking_status}, not pending`,
        code: "not_pending",
        status_now: b.booking_status,
      });
    await this.run("booking.confirmed", {
      booking_id: b.id,
      crm_booking_id: text(body.crm_booking_id, 120),
      confirmed_by_name: by,
      confirmed_by_crm_user_id: text(body.confirmed_by_crm_user_id, 120),
      source: sourceOf(body.source),
    });
    return {
      ...this.bookingView(await this.booking(id)),
      customer_notified: "booking_confirmed template",
    };
  }

  async rescheduleBooking(id: string, body: Body) {
    const b = await this.booking(id);
    if (b.booking_status === BookingStatus.Cancelled)
      throw new ConflictException({
        message: "The booking is cancelled",
        code: "booking_cancelled",
      });
    await this.run("booking.rescheduled", {
      booking_id: b.id,
      crm_booking_id: text(body.crm_booking_id, 120),
      preferred_date: text(body.preferred_date, 10),
      preferred_time: text(body.preferred_time, 20),
      source: sourceOf(body.source),
    });
    return {
      ...this.bookingView(await this.booking(id)),
      customer_notified: "booking_rescheduled template",
    };
  }

  async cancelBooking(id: string, body: Body) {
    const b = await this.booking(id);
    if (b.booking_status === BookingStatus.Cancelled)
      return { ...this.bookingView(b), already_cancelled: true };
    await this.run("booking.cancelled", {
      booking_id: b.id,
      crm_booking_id: text(body.crm_booking_id, 120),
      reason: text(body.reason, 300),
      source: sourceOf(body.source),
    });
    return { ...this.bookingView(await this.booking(id)), already_cancelled: false };
  }

  async recordPayment(id: string, body: Body) {
    const a = await activation.findOne({ where: { id: assertId(id, "activation_id") } });
    if (!a)
      throw new NotFoundException({
        message: "Activation not found",
        code: "activation_not_found",
      });
    const result = String(body.result ?? "");
    if (!["paid", "failed", "refunded"].includes(result))
      throw new BadRequestException({
        message: "result must be paid, failed or refunded",
        code: "invalid_result",
      });
    if (result === "paid" && a.payment_status === PaymentStatus.Paid)
      return {
        activation_id: a.id,
        payment_status: a.payment_status,
        activation_status: a.activation_status,
        already: true,
      };
    await this.run(`activation.${result}`, {
      activation_id: a.id,
      crm_activation_id: text(body.crm_activation_id, 120),
      source: sourceOf(body.source),
    });
    const now = await activation.findOne({ where: { id: a.id } });
    return {
      activation_id: a.id,
      payment_status: now?.payment_status,
      activation_status: now?.activation_status,
      already: false,
      customer_notified: result === "paid" ? "activation_confirmed template" : "no message",
    };
  }

  async completeTask(id: string, body: Body) {
    const t = await task.findOne({ where: { id: assertId(id, "task_id") } });
    if (!t) throw new NotFoundException({ message: "Task not found", code: "task_not_found" });
    if (t.task_status === TaskStatus.Done)
      return { task_id: t.id, status: t.task_status, already_done: true };
    if (body.crm_task_id && !t.crm_task_id)
      await task.update(t.id, { crm_task_id: text(body.crm_task_id, 120) });
    await this.run("task.completed", {
      task_id: t.id,
      outcome: text(body.outcome, 500),
      source: sourceOf(body.source),
    });
    return { task_id: t.id, status: TaskStatus.Done, already_done: false };
  }
}
