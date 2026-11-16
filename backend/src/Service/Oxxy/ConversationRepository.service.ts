import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, IsNull } from "typeorm";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { consent } from "@Database/Table/Oxxy/consent";
import { customer } from "@Database/Table/Oxxy/customer";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import {
  InvalidTransitionError,
  NORMAL_STATES,
  assertTransition,
} from "./ConversationStateMachine";

export class ConcurrentTransitionError extends Error {
  constructor(conversationId: string, from: string, to: string) {
    super(`Conversation ${conversationId} changed while moving ${from} -> ${to}`);
    this.name = "ConcurrentTransitionError";
  }
}

export interface TransitionOptions {
  reason?: string; // free text for the caller's own logs
  manager?: EntityManager; // run inside the caller's transaction
}

// Old values from the first version of the bot, mapped to the state they stand for
const LEGACY: Record<string, S> = {
  [S.Consent]: S.Discovery,
  [S.Needs]: S.Discovery,
  [S.Recommend]: S.PlanFit,
  [S.Booking]: S.BookingCapture,
  [S.Human]: S.Escalated,
};

const PARKING: readonly S[] = [S.Pause, S.Escalated, S.FollowUp]; // states that remember where to return to

/** outcome of a conversation closed by "Restart chat"; "restarted_fresh" = the bot also forgets what was said */
export const RESTARTED = "restarted";
export const RESTARTED_FRESH = "restarted_fresh";

export interface RestartOptions {
  /** the bot does not use the need, city, spend, plan or age from before (default true) */
  forgetEarlier?: boolean;
  /** the health-data consent notice is shown again on the next message (default false) */
  askConsentAgain?: boolean;
}

// The ONLY place that changes conversation.state.
@Injectable()
export class ConversationRepository {
  constructor(private readonly _DataSource: DataSource) {}

  private mgr(m?: EntityManager): EntityManager {
    return m ?? this._DataSource.manager;
  }

  async findById(id: string, manager?: EntityManager): Promise<conversation | null> {
    return await this.mgr(manager).findOne(conversation, { where: { id } });
  }

  async findOpenByCustomer(
    customerId: string,
    manager?: EntityManager,
  ): Promise<conversation | null> {
    return await this.mgr(manager).findOne(conversation, {
      where: { customer_id: customerId, closed_at: IsNull() },
      order: { created_on: "DESC" },
    });
  }

  // One open conversation per customer: returns the open one if there is one, else creates NEW.
  async openNew(customerId: string, manager?: EntityManager): Promise<conversation> {
    const m = this.mgr(manager);
    const open = await this.findOpenByCustomer(customerId, m);
    if (open) return open;
    try {
      return await m.save(m.create(conversation, { customer_id: customerId, state: S.New }));
    } catch (e) {
      const code = e as { code?: string; driverError?: { code?: string } };
      if (code.code === "23505" || code.driverError?.code === "23505") {
        const again = await this.findOpenByCustomer(customerId, m);
        if (again) return again; // someone opened it a moment ago
      }
      throw e;
    }
  }

  // Normal change of state. Checks the state machine, then compare-and-set.
  async transition(
    conversationId: string,
    to: S,
    opts: TransitionOptions = {},
  ): Promise<conversation> {
    const m = this.mgr(opts.manager);
    const conv = await this.load(m, conversationId);
    const stored = conv.state as S;
    if (stored === to) return conv; // no-op
    assertTransition(LEGACY[stored] ?? stored, to);

    const set: Partial<conversation> = { state: to };
    const from = (LEGACY[stored] ?? stored) as S;
    if ((PARKING as readonly S[]).includes(to) && (NORMAL_STATES as readonly S[]).includes(from)) {
      set.resume_state = from; // remember where to return to
    }
    if ((NORMAL_STATES as readonly S[]).includes(to)) set.resume_state = null; // came back from FOLLOW_UP
    if (to === S.Closed) {
      set.closed_at = new Date();
      set.resume_state = null;
    }
    return await this.apply(m, conv, stored, to, set);
  }

  // The customer opted in again: OPTED_OUT -> NEW (or the state stored before). Clears the opt-out.
  async optIn(conversationId: string): Promise<conversation> {
    return await this._DataSource.transaction(async (mg) => {
      const conv = await this.load(mg, conversationId);
      const target = this.leave(conv, S.OptedOut, S.New);
      const updated = await this.apply(mg, conv, S.OptedOut, target, {
        state: target,
        resume_state: null,
      });
      await mg.update(consent, { customer_id: conv.customer_id }, { opt_out_at: null });
      return updated;
    });
  }

  // The sales team closed the safety event: PAUSE -> back to where it was
  async resolveSafetyEvent(conversationId: string): Promise<conversation> {
    return await this.resolve(conversationId, S.Pause);
  }

  // The escalation task is resolved: ESCALATED -> back to where it was
  async resolveEscalation(conversationId: string): Promise<conversation> {
    return await this.resolve(conversationId, S.Escalated);
  }

  // The customer came back after FOLLOW_UP: -> the state stored before (or DISCOVERY)
  async resumeFromFollowUp(conversationId: string): Promise<conversation> {
    return await this.resolve(conversationId, S.FollowUp);
  }

  private async resolve(conversationId: string, expected: S): Promise<conversation> {
    const m = this.mgr();
    const conv = await this.load(m, conversationId);
    const target = this.leave(conv, expected, S.Discovery);
    return await this.apply(m, conv, expected, target, { state: target, resume_state: null });
  }

  // target = stored resume_state (if it is a normal state) else the fallback. Wrong current state throws.
  private leave(conv: conversation, expected: S, fallback: S): S {
    const stored = (LEGACY[conv.state] ?? conv.state) as S;
    const back = (conv.resume_state ?? fallback) as S;
    if (stored !== expected) throw new InvalidTransitionError(conv.state, back);
    return (NORMAL_STATES as readonly S[]).includes(back) ? back : fallback;
  }

  private async load(m: EntityManager, id: string): Promise<conversation> {
    const conv = await m.findOne(conversation, { where: { id } });
    if (!conv) throw new Error("conversation not found");
    return conv;
  }

  // UPDATE ... WHERE id = :id AND state = :from : if someone else moved it first, 0 rows are updated
  private async apply(
    m: EntityManager,
    conv: conversation,
    from: string,
    to: S,
    set: Partial<conversation>,
  ): Promise<conversation> {
    const res = await m
      .createQueryBuilder()
      .update(conversation)
      .set({ ...set, updated_on: new Date() })
      .where("id = :id AND state = :from", { id: conv.id, from: conv.state })
      .execute();
    if (!res.affected) throw new ConcurrentTransitionError(conv.id, from, to);
    Object.assign(conv, set);
    return conv;
  }

  /**
   * Console "Restart chat": the customer's chat starts again from NEW, as for a new customer. The open
   * conversation is closed (its messages stay, shown above the new start), scheduled messages are cancelled,
   * and the 24-hour window carries over. Never for an opted-out customer (STOP stays until they send START)
   * or during a safety pause (a person must hand it back first).
   */
  async restart(conversationId: string, opts: RestartOptions = {}): Promise<conversation> {
    const forget = opts.forgetEarlier !== false;
    return await this._DataSource.transaction(async (m) => {
      const given = await m.findOne(conversation, { where: { id: conversationId } });
      if (!given) throw new NotFoundException("Conversation not found");
      const open = await this.findOpenByCustomer(given.customer_id, m);
      const cons = await m.findOne(consent, { where: { customer_id: given.customer_id } });
      if (cons?.opt_out_at || open?.state === S.OptedOut)
        throw new ConflictException("The customer opted out. The chat starts again only when they send START.");
      if (open?.state === S.Pause)
        throw new ConflictException("A safety pause is open. Hand the chat back first, then restart it.");

      await m.update(
        follow_up,
        { customer_id: given.customer_id, follow_up_status: "scheduled" },
        { follow_up_status: "cancelled", skip_reason: "chat restarted", updated_on: new Date() } as any,
      );
      // closed_at by the database clock, the same clock as created_on (the "forget" cut-off compares them)
      await m.query(
        `UPDATE "conversation" SET "closed_at" = now(), "state" = $2, "outcome" = $3, "pending_action" = NULL,
           "resume_state" = NULL, "taken_over_by_id" = NULL, "updated_on" = now()
         WHERE "customer_id" = $1 AND "closed_at" IS NULL`,
        [given.customer_id, S.Closed, forget ? RESTARTED_FRESH : RESTARTED],
      );
      const fresh = await m.save(
        m.create(conversation, {
          customer_id: given.customer_id,
          state: S.New,
          // the WhatsApp 24-hour window belongs to the customer, not to the conversation
          last_customer_message_at: open?.last_customer_message_at ?? given.last_customer_message_at ?? null,
        }),
      );
      if (forget) await m.update(customer, { id: given.customer_id }, { age: null } as any);
      if (opts.askConsentAgain && cons)
        await m.update(consent, { id: cons.id }, {
          health_data_consent: false,
          notice_version: null,
          consent_timestamp: null,
          health_refused_at: null,
          health_refused_version: null,
          notice_sent_at: null,
          notice_sent_version: null,
        } as any);
      return fresh;
    });
  }
}
