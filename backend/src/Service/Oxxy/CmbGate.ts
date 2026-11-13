// Cut Medi Bills routing and eligibility gate (Full Plan 6.1, 8.2, 12.3). Pure rules + fixed texts;
// the chat pipeline stores the answers in `eligibility` and asks one question per turn.
import { eligibility } from "@Database/Table/Oxxy/eligibility";

const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

/** The customer names Cut Medi Bills themself */
export function asksForCmb(text: string): boolean {
  return /cut\s*-?\s*medi(cal)?\s*bills?|\bcmb\b/i.test(text || "");
}

// One question per turn, in this order. A YES to any of them = not eligible at that centre.
export const GATE_STEPS = ["booking", "registration", "treatment", "bill"] as const;
export type GateStep = (typeof GATE_STEPS)[number] | "centre" | "bill_amount";

export const GATE_QUESTION: Record<GateStep, string> = {
  centre:
    "Cut Medi Bills is for one upcoming expense at one centre. At which hospital or centre will this happen?",
  booking:
    "Have you already booked an appointment there yourself for this (not through Oxxy)? Reply YES or NO.",
  registration: "Have you already registered as a patient there for this? Reply YES or NO.",
  treatment: "Has the treatment for this already started? Reply YES or NO.",
  bill: "Have you already received or paid any bill there for this? Reply YES or NO.",
  bill_amount: "Roughly how much is the expected bill for this?",
};

const COLUMN: Record<(typeof GATE_STEPS)[number], keyof eligibility> = {
  booking: "booking_state",
  registration: "registration_state",
  treatment: "treatment_state",
  bill: "bill_state",
};

export function columnFor(step: (typeof GATE_STEPS)[number]): keyof eligibility {
  return COLUMN[step];
}

/** The plan's generated column: nothing booked independently, registered, started or billed */
export function isEligible(e: Partial<eligibility> | null | undefined): boolean {
  if (!e) return false;
  return GATE_STEPS.every((s) => (e[COLUMN[s]] ?? "none") === "none");
}

/** A YES to any gate question: not eligible at that centre */
export function gateFailed(e: Partial<eligibility> | null | undefined): boolean {
  if (!e) return false;
  return GATE_STEPS.some((s) => ["done", "generated", "part_paid", "paid"].includes(String(e[COLUMN[s]])));
}

/** True once every gate question has an answer */
export function gateComplete(e: Partial<eligibility> | null | undefined): boolean {
  if (!e) return false;
  return GATE_STEPS.every((s) => !!e[COLUMN[s]] && e[COLUMN[s]] !== "unknown");
}

/** "50,000", "50k", "1.5 lakh", "₹ 80000" -> number, or null */
export function parseAmount(text: string): number | null {
  const t = (text || "").toLowerCase().replace(/,/g, "").replace(/₹|rs\.?|inr/g, " ");
  const m = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l\b|k\b|thousand|hazaar|hazar)?/);
  if (!m) return null;
  let n = Number(m[1]);
  const unit = m[2] || "";
  if (/lakh|lac|^l$/.test(unit)) n *= 100000;
  else if (/k|thousand|haz/.test(unit)) n *= 1000;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function notEligibleText(step: (typeof GATE_STEPS)[number]): string {
  const what: Record<(typeof GATE_STEPS)[number], string> = {
    booking: "an appointment was already booked there",
    registration: "you are already registered there for this",
    treatment: "the treatment has already started",
    bill: "a bill has already been raised there",
  };
  return (
    `Thank you for telling me. Cut Medi Bills can be used only before you book, register, start treatment ` +
    `or get a bill at that centre, and ${what[step]}, so it cannot be used for this expense. ` +
    `An Oxxy plan may still help with your healthcare needs, or I can help you find another centre. What would you prefer?`
  );
}

export function cmbOfferText(
  bill: number,
  saving: number,
  monthly: number | null,
  yearly: number | null,
  activationTime: string | null = null,
): string {
  const prices = [
    monthly ? `${inr(monthly)} a month, renewing monthly until you cancel` : null,
    yearly ? `${inr(yearly)} one-time for one year` : null,
  ]
    .filter(Boolean)
    .join(", or ");
  return (
    `Cut Medi Bills fits this one upcoming expense. The current price is ${prices}, plus applicable GST. ` +
    `For an expected bill of about ${inr(bill)}, as an easy illustration it could help you save about ${inr(saving)}. ` +
    `Actual saving depends on the centre and the services used.` +
    (activationTime ? ` Activation takes ${activationTime}.` : "") +
    ` ` +
    `Would you like to go ahead with the monthly or the one-year option?`
  );
}

export function cmbNotWorthText(bill: number, monthly: number | null): string {
  return (
    `For an expected bill of about ${inr(bill)}, Cut Medi Bills${monthly ? ` (${inr(monthly)} a month plus GST)` : ""} ` +
    `may not pay for itself on this expense. I can still help you find a centre or take a booking request at no cost, ` +
    `or tell you about Oxxy plans for ongoing needs.`
  );
}
