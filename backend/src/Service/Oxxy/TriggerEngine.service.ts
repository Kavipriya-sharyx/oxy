import { Injectable, Logger, Optional } from "@nestjs/common";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { ConversationState } from "@Helper/Enum/ConversationState";

export type TriggerId =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I"
  | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R";

export const TRIGGER_CATALOG: { id: TriggerId; name: string; when: string }[] = [
  { id: "A", name: "Trust and legitimacy pack", when: "Trust or legitimacy doubt" },
  { id: "B", name: "Health insurance vs Oxxy", when: "Insurance comparison" },
  { id: "C", name: "Why activate Oxxy?", when: "Why activate or no urgency" },
  { id: "D", name: "Nearby healthcare centres", when: "Provider or location question" },
  { id: "E", name: "Plan recommendation and activation", when: "Plan interest or activation readiness" },
  { id: "F", name: "Personalised savings illustration", when: "Bill amount or annual spend shared" },
  { id: "G", name: "Booking request", when: "Appointment or provider choice" },
  { id: "H", name: "Booking saved", when: "Booking request saved" },
  { id: "I", name: "Cut Medi Bills route", when: "One specific upcoming expense" },
  { id: "J", name: "Insurance coordination", when: "Has insurance for planned service" },
  { id: "K", name: "Medicines", when: "Medicine requirement" },
  { id: "L", name: "News and testimonials", when: "Wants proof from others" },
  { id: "M", name: "One objection, one resolution", when: "Objection or hesitation" },
  { id: "N", name: "Agreed follow-up", when: "Asks for time or is busy" },
  { id: "O", name: "Senior callback", when: "Fact cannot be confirmed" },
  { id: "P", name: "Payment completed", when: "Says payment is done" },
  { id: "Q", name: "Incomplete activation", when: "Link sent, payment not completed" },
  { id: "R", name: "Stop commercial flow", when: "Refusal, opt-out, emergency or privacy" },
];

export interface TriggerDecision {
  id: TriggerId;
  suppression: string | null; // opt_out | emergency | active_complaint | active_product
}

// Fired only when the pipeline really showed them (a centre list, a plan / disclosure, the Cut Medi
// Bills gate result), never just because Claude named the intent: "find a hospital" + ASK_CITY is not D.
export const NEEDS_SHOWN: TriggerId[] = ["D", "E", "F", "I"];

const PRIORITY: TriggerId[] = [
  "R", "O", "P", "G", "H", "D", "A", "B", "L", "C", "J", "K", "M", "I", "F", "E", "N", "Q",
];

@Injectable()
export class TriggerEngineService {
  private readonly logger = new Logger(TriggerEngineService.name);

  // Full Plan 3.2 log_event: every trigger (fired or suppressed) also goes to the CRM record (Trigger layer 13)
  constructor(@Optional() private readonly _Outbox?: CrmOutboxService) {}

  inferCandidate(intent: string, product?: string | null, needsHuman?: boolean): TriggerId | null {
    if (needsHuman) return "O";
    switch (intent) {
      case "find_centre":
        return "D";
      case "book":
        return "G"; // H (booking saved) is recorded by the pipeline only when the request is saved
      case "recommend":
        return product === "cut_medi_bills" ? "I" : "E";
      case "activate":
      case "compare_plans":
        return "E";
      // content triggers: answered with an approved asset (Trigger layer A, C, L)
      case "trust_doubt":
        return "A";
      case "why_activate":
        return "C";
      case "wants_proof":
        return "L";
      default:
        return null;
    }
  }

  /**
   * Before the reply is sent: may this trigger fire? null = already fired in this journey (or unknown).
   * A decision with a suppression_reason is recorded (for the KPIs) but its content is not sent.
   */
  async decide(
    customerId: string,
    conv: conversation,
    candidate: TriggerId | null,
    activeProduct?: string | null,
  ): Promise<TriggerDecision | null> {
    if (!candidate || !PRIORITY.includes(candidate)) return null;
    const cons = await consent.findOne({ where: { customer_id: customerId } });
    let suppression: string | null = null;
    if (cons?.opt_out_at || cons?.privacy_request_at) suppression = "opt_out";
    else if (conv.state === ConversationState.Pause) suppression = "emergency";
    else if (conv.state === ConversationState.Escalated && (candidate === "E" || candidate === "Q"))
      suppression = "active_complaint"; // open complaint / payment / callback case (plan 12.6)
    else if (activeProduct && (candidate === "E" || candidate === "I")) suppression = "active_product";

    // dedupe per decision journey (this conversation), not for life
    const existing = await trigger_event.findOne({
      where: { conversation_id: conv.id, trigger_id: candidate },
    });
    if (existing) return null;
    return { id: candidate, suppression };
  }

  /** After the reply is sent: the trigger_event row. Assets are stored only when they really went out. */
  async record(
    customerId: string,
    conv: conversation,
    d: TriggerDecision,
    reason: string,
    extra: { assets?: string[]; cta?: string | null } = {},
  ): Promise<void> {
    try {
      await trigger_event.save(
        trigger_event.create({
          customer_id: customerId,
          conversation_id: conv.id,
          trigger_id: d.id,
          reason,
          suppression_reason: d.suppression,
          conversation_source: "whatsapp_inbound",
          next_state: conv.state,
          assets: !d.suppression && extra.assets?.length ? extra.assets : null,
          cta: d.suppression ? null : (extra.cta ?? null),
        } as any),
      );
    } catch (e) {
      this.logger.debug(`trigger ${d.id} not recorded: ${(e as Error).message}`);
      return;
    }
    await this._Outbox?.emit(CrmAction.LogEvent, customerId, {
      event: "trigger",
      customer_id: customerId,
      conversation_id: conv.id,
      trigger_id: d.id,
      trigger_reason: reason,
      conversation_source: "whatsapp_inbound",
      asset_ids: !d.suppression ? (extra.assets ?? []) : [],
      cta: d.suppression ? null : (extra.cta ?? null),
      next_state: conv.state,
      suppression_reason: d.suppression,
      at: new Date().toISOString(),
    });
  }

  /** decide + record in one step (for triggers with nothing extra to send) */
  async recordIfAllowed(
    customerId: string,
    conv: conversation,
    candidate: TriggerId | null,
    reason: string,
    activeProduct?: string | null,
    extra: { assets?: string[]; cta?: string | null } = {},
  ): Promise<TriggerId | null> {
    const d = await this.decide(customerId, conv, candidate, activeProduct);
    if (!d) return null;
    await this.record(customerId, conv, d, reason, extra);
    return d.suppression ? null : d.id;
  }
}

