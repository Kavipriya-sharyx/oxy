// The SharyX call result (webhook call.completed, guide "Receiving call results"). What the customer told the
// voice AI becomes the chat's call_context (shown to the LLM for 7 days, so WhatsApp does not ask again), and a
// call that needs a next step becomes one task for the team. Matched by contact.data (customer_id /
// conversation_id we sent with the call), else by the customer's number. A repeated delivery changes nothing.
import { Injectable, Logger } from "@nestjs/common";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { task } from "@Database/Table/Oxxy/task";
import { TaskType } from "@Helper/Enum/TaskType";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANSWERED = new Set(["completed", "caller_hangup"]);

/** The call in a few lines for the chat (no transcript) */
export function callContextText(b: any): string {
  const when = b?.call?.ended_at ? String(b.call.ended_at).slice(0, 16).replace("T", " ") : "";
  const parts = [
    `Voice AI call${when ? ` (${when} UTC)` : ""}: ${b?.outcome?.label ?? b?.call?.result ?? "call"}.`,
    b?.summary ? String(b.summary) : "",
    b?.follow_up ? `Next step: ${b.follow_up}` : "",
    b?.data && typeof b.data === "object"
      ? Object.entries(b.data)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join("; ")
      : "",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 1500);
}

@Injectable()
export class SharyxWebhookService {
  private readonly logger = new Logger(SharyxWebhookService.name);

  async handle(event: string, b: any): Promise<"ok" | "ignored" | "unknown_customer"> {
    if (event && event !== "call.completed") return "ignored";
    const callId = String(b?.call?.id ?? "");
    if (!callId) return "ignored";
    const result = String(b?.call?.result ?? "");
    const d = b?.contact?.data ?? {};

    let conv: conversation | null = null;
    if (UUID.test(String(d.conversation_id ?? "")))
      conv = await conversation.findOne({ where: { id: d.conversation_id } });
    let cust: customer | null = null;
    if (UUID.test(String(d.customer_id ?? "")))
      cust = await customer.findOne({ where: { id: d.customer_id } });
    if (!cust) {
      const digits = String(b?.call?.customer_number ?? b?.contact?.phone ?? "").replace(/\D/g, "");
      if (digits) cust = await customer.findOne({ where: { wa_number: digits } });
    }
    if (!conv && cust)
      conv = await conversation.findOne({
        where: { customer_id: cust.id } as any,
        order: { created_on: "DESC" } as any,
      });
    if (!conv) return "unknown_customer";

    // unanswered (no_answer, busy, failed): nothing the customer said, nothing to keep
    if (!ANSWERED.has(result)) return "ok";

    conv.call_context = callContextText(b);
    conv.call_context_at = new Date();
    await conv.save();

    const group = String(b?.outcome?.group ?? "");
    if (group === "positive" || group === "follow_up" || b?.follow_up) {
      // one task per call (crm_task_id is unique): a repeated delivery adds nothing
      const key = `sharyx:${callId}`;
      if (!(await task.findOne({ where: { crm_task_id: key } as any }))) {
        await task
          .save(
            task.create({
              type: TaskType.HumanHandoff,
              priority: group === "positive" ? "high" : "normal",
              customer_id: conv.customer_id,
              conversation_id: conv.id,
              summary:
                `Voice AI call: ${b?.outcome?.label ?? result}. ${b?.follow_up ?? b?.summary ?? ""}`.slice(
                  0,
                  1000,
                ),
              reason: "sharyx_call",
              crm_task_id: key,
            } as any),
          )
          .catch((e) => this.logger.warn(`call task not saved: ${(e as Error).message}`));
      }
    }
    return "ok";
  }
}
