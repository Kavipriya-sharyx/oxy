import { Injectable } from "@nestjs/common";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

// Pure check. allowedPrices = every price a reply may show (catalog price and price incl. GST).
export function validateReply(text: string, allowedPrices: number[]): ValidationResult {
  const reasons: string[] = [];
  const t = text || "";

  if (/insurance/i.test(t)) reasons.push("mentions insurance");
  if (/\b(sav(e|es|ed|ing|ings)|discounts?|cashback|\d+\s*%\s*off)\b/i.test(t))
    reasons.push("promises savings or discounts");
  if (/confirmed/i.test(t)) reasons.push("says a booking is confirmed");
  if (/tie[\s-]?ups?|tied up|partner(ed|ship|ships)?/i.test(t)) reasons.push("mentions tie-ups");
  if (/oxxy/i.test(t) && /cut\s*medi\s*bills/i.test(t)) reasons.push("offers both products");

  const priceRe = /(?:\u20b9|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = priceRe.exec(t))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!allowedPrices.some((p) => Math.abs(p - n) < 0.5))
      reasons.push(`price not in catalog: ${n}`);
  }
  return { ok: reasons.length === 0, reasons };
}

@Injectable()
export class ReplyValidatorService {
  async allowedPrices(): Promise<number[]> {
    const plans = await plan_catalog.find({ where: { status: true } });
    const out: number[] = [];
    for (const p of plans) {
      out.push(p.price, Math.round(p.price * (1 + (Number(p.gst_rate) || 0.18))));
    }
    return out;
  }

  async validate(text: string): Promise<ValidationResult> {
    return validateReply(text, await this.allowedPrices());
  }
}
