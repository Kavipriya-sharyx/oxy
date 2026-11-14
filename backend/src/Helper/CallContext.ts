// What the voice AI learnt on the phone, sent with StartConversation so the WhatsApp chat continues from there
// instead of asking the same questions again.

export interface CallContext {
  summary: string | null; // short, in the customer's words where possible
  need: string | null; // e.g. "dental treatment for mother"
  beneficiary: string | null; // self, mother, father, family …
  city: string | null;
  locality: string | null;
  specialisation: string | null;
  selected_product: "oxxy" | "cut_medi_bills" | null;
  recommended_plan: "everyday" | "vital" | "thrive" | "infinity" | null;
}

const PRODUCTS = ["oxxy", "cut_medi_bills"] as const;
const PLANS = ["everyday", "vital", "thrive", "infinity"] as const;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Cleans the context; null when nothing usable was sent. Unknown keys are ignored. */
export function cleanCallContext(raw: unknown): CallContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const product = String(r.selected_product ?? "").toLowerCase();
  const plan = String(r.recommended_plan ?? "").toLowerCase();
  const ctx: CallContext = {
    summary: text(r.summary, 1000),
    need: text(r.need, 200),
    beneficiary: text(r.beneficiary, 60),
    city: text(r.city, 80),
    locality: text(r.locality, 80),
    specialisation: text(r.specialisation, 80),
    selected_product: (PRODUCTS as readonly string[]).includes(product)
      ? (product as CallContext["selected_product"])
      : null,
    recommended_plan: (PLANS as readonly string[]).includes(plan)
      ? (plan as CallContext["recommended_plan"])
      : null,
  };
  // a plan belongs to Oxxy only
  if (ctx.selected_product === "cut_medi_bills") ctx.recommended_plan = null;
  return Object.values(ctx).some((v) => v) ? ctx : null;
}

/** One short line for the LLM context */
export function describeCallContext(c: CallContext): string {
  const parts: string[] = [];
  if (c.summary) parts.push(c.summary);
  if (c.need) parts.push(`need: ${c.need}`);
  if (c.beneficiary) parts.push(`for: ${c.beneficiary}`);
  if (c.city || c.locality)
    parts.push(`location: ${[c.locality, c.city].filter(Boolean).join(", ")}`);
  if (c.specialisation) parts.push(`specialisation: ${c.specialisation}`);
  if (c.selected_product)
    parts.push(`interested in: ${c.selected_product === "oxxy" ? "Oxxy" : "Cut Medi Bills"}`);
  if (c.recommended_plan) parts.push(`plan discussed: ${c.recommended_plan}`);
  return parts.join("; ");
}

const CALL_CONTEXT_MS = 7 * 24 * 3600 * 1000;

/** The call context while it is fresh (7 days) */
export function freshCallContext(
  conv?: { call_context?: string | null; call_context_at?: Date | string | null } | null,
  now = Date.now(),
): string | null {
  const t = conv?.call_context?.trim();
  if (!t || !conv?.call_context_at) return null;
  return now - new Date(conv.call_context_at).getTime() <= CALL_CONTEXT_MS ? t : null;
}
