// The client's "Monthly & Annual Plan Pricing Calculation Logic" (17 Nov 2026), in one place for every message
// that shows a price (the button flow's cards, the activation disclosure, the recommendation, the price answer,
// the four-plan comparison, the LLM's price table and the validator's allowed amounts).
//
//   First plan:       GST = cost × 18%                 Final payable = cost + GST
//   Second plan on:   Discounted = cost × 70%          GST = discounted × 18%     Final = discounted + GST
//   The 30% applies to the plan cost only, never to the GST. Shown in whole rupees (doc 11); paise only inside.
//
// "Second plan onwards" = an additional family member added in the SAME activation (client Q&A Q132: "the family
// member should be added at the time while activating the plan for the first time to avail 30% discount").
import { lang, say, L } from "./Lang";

export const GST_RATE = 0.18;
export const SUBSEQUENT_DISCOUNT = 0.3;

const rupees = (n: number) => Math.round(Number(n) || 0);
export const inr = (n: number) => "₹" + rupees(n).toLocaleString("en-IN");
const ratePct = (rate: number) => `${Math.round(rate * 100)}%`;

export interface FirstPlanPrice {
  cost: number;
  gst: number;
  total: number;
}
export interface SubsequentPlanPrice {
  original: number;
  discount: number;
  cost: number;
  gst: number;
  total: number;
}

/** First plan: the full plan cost + GST (doc 2 step 1, 10) */
export function firstPlan(cost: number, rate = GST_RATE): FirstPlanPrice {
  const c = Number(cost) || 0;
  const gst = rupees(c * rate);
  return { cost: rupees(c), gst, total: rupees(c) + gst };
}

/** Second plan onwards: 30% off the plan cost, GST on the discounted cost (doc 2 step 2, 10, 12) */
export function subsequentPlan(cost: number, rate = GST_RATE): SubsequentPlanPrice {
  const c = Number(cost) || 0;
  const discounted = c * (1 - SUBSEQUENT_DISCOUNT); // paise kept inside (doc 11)
  const shown = rupees(discounted);
  const gst = rupees(discounted * rate);
  return { original: rupees(c), discount: rupees(c) - shown, cost: shown, gst, total: shown + gst };
}

/** The first plan plus `extra` subsequent plans: what the family pays in all */
export function familyTotal(cost: number, extra: number, rate = GST_RATE): number {
  return firstPlan(cost, rate).total + Math.max(0, extra) * subsequentPlan(cost, rate).total;
}

/** Every rupee figure a price message may show for this plan cost (the validator's allowed amounts) */
export function priceFigures(cost: number, rate = GST_RATE): number[] {
  const f = firstPlan(cost, rate);
  const s = subsequentPlan(cost, rate);
  const out = [f.cost, f.gst, f.total, s.discount, s.cost, s.gst, s.total];
  for (let extra = 1; extra <= 5; extra++) out.push(familyTotal(cost, extra, rate));
  return out;
}

const W: Record<"cost" | "gst" | "final" | "original" | "discount" | "discounted" | "perMonth" | "perYear", L> = {
  cost: { en: "Plan cost", hi: "प्लान की कीमत", hinglish: "Plan cost" },
  gst: { en: "GST", hi: "GST", hinglish: "GST" },
  final: { en: "Final payable", hi: "कुल देय राशि", hinglish: "Final payable" },
  original: { en: "Original plan cost", hi: "मूल प्लान कीमत", hinglish: "Original plan cost" },
  discount: { en: "30% discount", hi: "30% छूट", hinglish: "30% discount" },
  discounted: { en: "Discounted plan cost", hi: "छूट के बाद कीमत", hinglish: "Discounted plan cost" },
  perMonth: { en: "a month", hi: "प्रति माह", hinglish: "per month" },
  perYear: { en: "a year", hi: "प्रति वर्ष", hinglish: "per year" },
};
const w = (k: keyof typeof W, l?: string | null) => say(W[k], l);
export const per = (billing: string, l?: string | null) => w(billing === "monthly" ? "perMonth" : "perYear", l);

/** Doc 9, first plan:  Plan cost / + GST / = Final payable */
export function firstPlanLines(cost: number, l?: string | null, rate = GST_RATE): string[] {
  const p = firstPlan(cost, rate);
  return [
    `${w("cost", l)}: ${inr(p.cost)}`,
    `+ ${w("gst", l)} (${ratePct(rate)}): ${inr(p.gst)}`,
    `= ${w("final", l)}: ${inr(p.total)}`,
  ];
}

/** Doc 9, second plan onwards: Original / − 30% / = Discounted / + GST / = Final payable */
export function subsequentPlanLines(cost: number, l?: string | null, rate = GST_RATE): string[] {
  const p = subsequentPlan(cost, rate);
  return [
    `${w("original", l)}: ${inr(p.original)}`,
    `− ${w("discount", l)}: ${inr(p.discount)}`,
    `= ${w("discounted", l)}: ${inr(p.cost)}`,
    `+ ${w("gst", l)} (${ratePct(rate)}): ${inr(p.gst)}`,
    `= ${w("final", l)}: ${inr(p.total)}`,
  ];
}

/** In a sentence: "₹2,999 + GST ₹540 = ₹3,539" */
export function inlineFirst(cost: number, rate = GST_RATE): string {
  const p = firstPlan(cost, rate);
  return `${inr(p.cost)} + GST ${inr(p.gst)} = ${inr(p.total)}`;
}

/** "₹2,999 + GST ₹540 = ₹3,539 monthly or ₹30,000 + GST ₹5,400 = ₹35,400 yearly" */
export function inlineMonthlyYearly(yearly: number | null, monthly: number | null, l?: string | null, rate = GST_RATE): string {
  const g = lang(l);
  const m = monthly ? `${inlineFirst(monthly, rate)} ${g === "hi" ? "मासिक" : "monthly"}` : null;
  const y = yearly ? `${inlineFirst(yearly, rate)} ${g === "hi" ? "वार्षिक" : "yearly"}` : null;
  const or = g === "hi" ? " या " : g === "hinglish" ? " ya " : " or ";
  return [m, y].filter(Boolean).join(or);
}
