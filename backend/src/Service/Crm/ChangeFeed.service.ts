import { Injectable, Logger } from "@nestjs/common";
import { EntityManager, LessThan } from "typeorm";
import { change_event } from "@Database/Table/Crm/change_event";
import { CrmAction } from "@Helper/Enum/CrmAction";

// The client's CRM pulls (GET /Actions/Changes) instead of taking calls from the bot. Every change the bot
// would have pushed (the outbox actions) and every state change (booking confirmed, payment verified, task
// done) is written here, in order, whether CRM push is on or off.

/** Feed type for an outbox action: the same names as the CRM webhook events, so both directions read alike */
export function feedType(action: string, payload: Record<string, unknown> = {}): string {
  switch (action) {
    case CrmAction.UpsertCustomer:
      return "customer.updated";
    case CrmAction.CreateBookingRequest:
      return "booking.created";
    case CrmAction.ConfirmBooking:
      return "booking.confirmed";
    case CrmAction.CreateTask:
      return "task.created";
    case CrmAction.CreateActivation:
      return "activation.created";
    case CrmAction.SetOptOut:
      return "customer.opted_out";
    case CrmAction.SetOptIn:
      return "customer.opted_in";
    case CrmAction.SetCallbackWindow:
      return "task.callback_window";
    case CrmAction.LogEvent: {
      const e = String(payload.event ?? "event");
      if (e === "trigger") return "trigger.fired";
      if (e === "consent") return "consent.changed";
      if (e === "activation_declined") return "activation.declined";
      return `event.${e}`;
    }
    default:
      return action;
  }
}

export const FEED_TYPES = [
  "customer.updated",
  "customer.opted_out",
  "customer.opted_in",
  "consent.changed",
  "booking.created",
  "booking.confirmed",
  "booking.rescheduled",
  "booking.cancelled",
  "task.created",
  "task.callback_window",
  "task.completed",
  "activation.created",
  "activation.declined",
  "activation.paid",
  "activation.failed",
  "activation.refunded",
  "trigger.fired",
] as const;

export const FEED_PAGE_MAX = 500;
export const FEED_KEEP_DAYS = 90;

@Injectable()
export class ChangeFeedService {
  private readonly logger = new Logger(ChangeFeedService.name);

  /** Never throws: the feed must not break the bot change it describes. With a manager it joins that transaction. */
  async record(
    manager: EntityManager | null,
    type: string,
    customerId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const row = { type, customer_id: customerId, payload };
      if (manager) await manager.insert(change_event, row);
      else await change_event.insert(row);
    } catch (e) {
      this.logger.warn(`change feed ${type} not recorded: ${(e as Error).message}`);
    }
  }

  /** The changes after cursor `after` (0 = from the start), oldest first */
  async list(after: number, limit: number) {
    const rows = await change_event
      .createQueryBuilder("e")
      .where("e.seq > :after", { after: String(after) })
      .orderBy("e.seq", "ASC")
      .take(limit + 1)
      .getMany();
    const page = rows.slice(0, limit);
    return {
      changes: page.map((r) => ({
        seq: Number(r.seq),
        type: r.type,
        customer_id: r.customer_id,
        data: r.payload,
        created_at: r.created_on,
      })),
      next_after: page.length ? Number(page[page.length - 1].seq) : after,
      has_more: rows.length > limit,
    };
  }

  /** Nightly: keep FEED_KEEP_DAYS days */
  async prune(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - FEED_KEEP_DAYS * 86_400_000);
    const res = await change_event.delete({ created_on: LessThan(before) });
    return res.affected ?? 0;
  }
}
