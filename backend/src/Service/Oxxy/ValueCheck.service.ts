import { Injectable } from "@nestjs/common";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { ProductType } from "@Helper/Enum/ProductType";
import { BillingCycle } from "@Helper/Enum/BillingCycle";

export interface PlanLike {
  plan: string;
  price: number;
  max_saving_pct: number | null;
  age_limit: number | null;
  gst_rate: number | string;
}

// saving = floor(spend * rate / 500) * 500   (integer maths, rate in percent)
export function computeSaving(spend: number, ratePct: number): number {
  if (!spend || spend <= 0 || !ratePct) return 0;
  return Math.floor((spend * ratePct) / 100 / 500 + 1e-9) * 500;
}

// recommend only if saving > yearly price * 1.18 (GST)
export function isWorthIt(saving: number, yearlyPrice: number, gstRate = 0.18): boolean {
  return saving > yearlyPrice * (1 + gstRate);
}

export interface PlanPick {
  plan: string;
  saving: number;
  price: number;
}

// Pick the plan with the best (saving - price incl. GST). null if no plan passes.
export function pickPlan(spend: number, age: number | null, plans: PlanLike[]): PlanPick | null {
  let best: (PlanPick & { net: number }) | null = null;
  for (const p of plans) {
    if (!p.max_saving_pct) continue;
    if (p.age_limit && age && age > p.age_limit) continue;
    const gst = Number(p.gst_rate) || 0.18;
    const saving = computeSaving(spend, p.max_saving_pct);
    if (!isWorthIt(saving, p.price, gst)) continue;
    const net = saving - p.price * (1 + gst);
    if (!best || net > best.net) best = { plan: p.plan, saving, price: p.price, net };
  }
  return best ? { plan: best.plan, saving: best.saving, price: best.price } : null;
}

@Injectable()
export class ValueCheckService {
  async recommend(
    spend: number,
    age: number | null,
    product: string = ProductType.Oxxy,
  ): Promise<PlanPick | null> {
    const plans = await plan_catalog.find({
      where: { product, billing: BillingCycle.Yearly, status: true },
    });
    return pickPlan(spend, age, plans);
  }
}
