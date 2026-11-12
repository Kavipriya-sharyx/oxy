import { Injectable, Logger } from "@nestjs/common";
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

const PRIORITY: TriggerId[] = [
  "R", "O", "P", "G", "H", "D", "A", "B", "L", "C", "J", "K", "M", "I", "F", "E", "N", "Q",
];

@Injectable()
export class TriggerEngineService {
  private readonly logger = new Logger(TriggerEngineService.name);

  inferCandidate(intent: string, product?: string | null, needsHuman?: boolean): TriggerId | null {
    if (needsHuman) return "O";
    switch (intent) {
      case "find_centre":
        return "D";
      case "book":
        return "H";
      case "recommend":
        return product === "cut_medi_bills" ? "I" : "E";
      case "activate":
        return "E";
      default:
        return null;
    }
  }

  async recordIfAllowed(
    customerId: string,
    conv: conversation,
    candidate: TriggerId | null,
    reason: string,
  ): Promise<TriggerId | null> {
    if (!candidate) return null;
    const cons = await consent.findOne({ where: { customer_id: customerId } });
    let suppression: string | null = null;
    if (cons?.opt_out_at || cons?.privacy_request_at) suppression = "opt_out";
    else if (conv.state === ConversationState.Pause) suppression = "emergency";

    const existing = await trigger_event.findOne({
      where: { customer_id: customerId, trigger_id: candidate },
    });
    if (existing) return null;

    const ordered = PRIORITY.includes(candidate) ? candidate : null;
    if (!ordered) return null;

    try {
      await trigger_event.save(
        trigger_event.create({
          customer_id: customerId,
          conversation_id: conv.id,
          trigger_id: ordered,
          reason,
          suppression_reason: suppression,
        } as any),
      );
      return suppression ? null : ordered;
    } catch (e) {
      this.logger.debug(`trigger ${ordered} skipped: ${(e as Error).message}`);
      return null;
    }
  }
}

