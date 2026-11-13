import { Injectable } from "@nestjs/common";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { ProductType } from "@Helper/Enum/ProductType";
import { BillingCycle } from "@Helper/Enum/BillingCycle";

// Full Development Plan 1.1 and 12.3 (plan choice for Oxxy, value check)

export interface PlanLike {
  plan: string;
  price: number; // yearly price, excl. GST
  illustration_pct?: number | null; // rate for the easy illustration (Infinity: 30)
  max_saving_pct: number | null; // "savings up to" (Infinity: 40) - only a fallback for the rate
  age_limit: number | null;
  gst_rate: number | string;
}

export const PLAN_ORDER = ["everyday", "vital", "thrive", "infinity"];

// saving = floor(spend * rate / 500) * 500   (integer maths, rate in percent)
export function computeSaving(spend: number, ratePct: number): number {
  if (!spend || spend <= 0 || !ratePct) return 0;
  return Math.floor((spend * ratePct) / 100 / 500 + 1e-9) * 500;
}

// recommend only if saving > yearly price * 1.18 (GST)
export function isWorthIt(saving: number, yearlyPrice: number, gstRate = 0.18): boolean {
  return saving > yearlyPrice * (1 + gstRate);
}

const rateOf = (p: PlanLike) => Number(p.illustration_pct ?? p.max_saving_pct ?? 0);
const gstOf = (p: PlanLike) => Number(p.gst_rate) || 0.18;

// Pick by need (12.3): routine OPD = Everyday; OPD + hospitalisation = Vital;
// pre-existing or larger expense = Thrive; major or recurring high expense = Infinity.
export function needLevel(need?: string | null): number {
  const n = (need || "").toLowerCase();
  if (
    /cancer|oncolog|cardiac|heart|bypass|kidney|dialysis|liver|transplant|major surgery|pregnan|ivf|bariatric|cosmetic|hair/.test(
      n,
    )
  )
    return 3;
  if (
    /surgery|operation|pre-?existing|diabet|chronic|bp|blood pressure|thyroid|asthma|arthritis/.test(
      n,
    )
  )
    return 2;
  if (/hospital|admission|admit|ipd|inpatient/.test(n)) return 1;
  if (/check-?up|consult|opd|fever|cold|cough|dental|eye|skin|test|routine|general/.test(n))
    return 0;
  return 1; // not clear: OPD + possible hospitalisation
}

export type Recommendation =
  | { status: "ask_age" }
  | { status: "recommend"; plan: string; saving: number; price: number; rate: number }
  | { status: "not_worth_it"; plan: string; price: number; spend: number };

export function recommendPlan(
  spend: number,
  age: number | null,
  need: string | null | undefined,
  plans: PlanLike[],
): Recommendation | null {
  const byName = new Map(plans.map((p) => [p.plan, p]));
  const ordered = PLAN_ORDER.map((n) => byName.get(n)).filter(Boolean) as PlanLike[];
  if (!ordered.length) return null;
  // the age decides which plans are allowed, so it is asked before any plan is named
  if (age == null || !Number.isFinite(age)) return { status: "ask_age" };
  const allowed = (p: PlanLike) => !p.age_limit || age <= p.age_limit;

  let i = Math.min(needLevel(need), ordered.length - 1);
  while (i < ordered.length - 1 && !allowed(ordered[i])) i++; // move up when the age rules a plan out
  const base = ordered[i];
  if (!allowed(base)) return null;

  const passes = (p: PlanLike) => isWorthIt(computeSaving(spend, rateOf(p)), p.price, gstOf(p));
  // the plan that fits the need, else the next cheaper suitable plan
  for (let j = i; j >= 0; j--) {
    const p = ordered[j];
    if (!allowed(p) || !passes(p)) continue;
    return {
      status: "recommend",
      plan: p.plan,
      saving: computeSaving(spend, rateOf(p)),
      price: p.price,
      rate: rateOf(p),
    };
  }
  return { status: "not_worth_it", plan: base.plan, price: base.price, spend };
}

// Cut Medi Bills: 30% of the one known bill must beat the monthly price + GST (12.3 routing rule)
export function cmbWorthIt(
  bill: number,
  monthlyPrice: number,
  ratePct = 30,
  gstRate = 0.18,
): { ok: boolean; saving: number } {
  const saving = computeSaving(bill, ratePct); // same floor-to-500 rule as every illustration (1.1)
  return { ok: saving > monthlyPrice * (1 + gstRate), saving };
}

export interface PlanPrices {
  monthly: number | null;
  yearly: number | null;
}

@Injectable()
export class ValueCheckService {
  async recommend(
    spend: number,
    age: number | null,
    need?: string | null,
    product: string = ProductType.Oxxy,
  ): Promise<Recommendation | null> {
    const plans = await plan_catalog.find({
      where: { product, billing: BillingCycle.Yearly, status: true },
    });
    return recommendPlan(spend, age, need, plans as unknown as PlanLike[]);
  }

  async prices(product: string, plan: string): Promise<PlanPrices> {
    const rows = await plan_catalog.find({ where: { product, plan, status: true } });
    const by = (b: string) => rows.find((r) => r.billing === b)?.price ?? null;
    return { monthly: by(BillingCycle.Monthly), yearly: by(BillingCycle.Yearly) };
  }
}
