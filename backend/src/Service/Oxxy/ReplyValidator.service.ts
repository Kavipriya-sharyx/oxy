import { Injectable } from "@nestjs/common";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { NEUTRAL_SAVINGS_LINE } from "@Helper/FixedReplies";
import { OutboundMessage } from "@Helper/WhatsappMessage";
import { LIMITS, validateMessage } from "./WhatsappPayload";

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

// What the validator needs to know about the customer and the catalog (all from the DB)
export interface ValidationContext {
  // Active catalog plans. When given, a plan name that is not in it is rejected. "cut_medi_bills" is
  // written as "cut medi bills".
  plans?: { name: string; product: string }[];
  // The one product this customer may hear about: active_product, else the selected product.
  lockedProduct?: string | null;
}

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
const planKey = (s: string) => clean(s.replace(/_/g, " ")).toLowerCase();

// Words that can sit in front of "plan" without being a plan name ("the plan", "which plan", ...)
const NOT_A_PLAN_NAME = new Set(
  (
    "a an the this that these those your our my any each every another which what right best suitable good better " +
    "one same current new old existing chosen selected recommended suggested particular specific different other " +
    "health healthcare care medical payment monthly yearly annual annually membership whole full preferred available " +
    "following above below with for of and or to in on if is are can will would its their his her no not both either " +
    "first second next last perfect ideal simple regular general personal personalised custom we you it there here " +
    "oxxy bills cut medi per as at by from so than then also only just very more most less ask choose pick compare " +
    "details detail information about rates pricing price prices cost costs"
  ).split(" "),
);

// Words that only make sense as a (made-up) plan tier. Always checked, with or without the word "plan".
const TIER_WORDS =
  /\b(platinum|gold|silver|bronze|diamond|premium|elite|ultimate|starter|essentials?|lite|super)\b/gi;

function planCandidates(t: string): string[] {
  const out: string[] = [];
  for (const m of t.matchAll(/\b([\p{L}][\p{L}-]*)\s+plans?\b/giu)) out.push(m[1].toLowerCase());
  for (const m of t.matchAll(/\bplans?\s+(?:called|named|such as|like)\s+([\p{L}][\p{L}-]*)/giu))
    out.push(m[1].toLowerCase());
  for (const m of t.matchAll(TIER_WORDS)) out.push(m[1].toLowerCase());
  return out.filter((w) => !NOT_A_PLAN_NAME.has(w));
}

const CMB_RE = /cut\s*medi\s*bills/i;
const OXXY_PLAN_RE = /\b(everyday|vital|thrive|infinity)\b|\boxxy\s+(plans?|membership)\b/i;
const BOTH_RE =
  /\boxxy\b\s*(or|and|\/|,|&)\s*cut\s*medi|cut\s*medi\s*bills\s*(or|and|\/|,|&)\s*(the\s+)?oxxy\b|\bboth\b/i;
const CONFIRMED_CLAIM_RE =
  /\b(booking|appointment|slot|visit|request)\b[^.!?\n]{0,40}\b(is|has been|have been|are|now)\s+(now\s+)?confirmed\b|\bconfirmed\s+(your|the)\s+(booking|appointment|slot|visit)\b|^\s*confirmed\b/i;

// Pure check. allowedPrices = every price a reply may show (catalog price and price incl. GST).
export function validateReply(
  text: string,
  allowedPrices: number[],
  ctx: ValidationContext = {},
): ValidationResult {
  const reasons: string[] = [];
  const t = text || "";

  // the neutral savings line is the ONLY savings wording allowed: it is removed before the
  // savings check, so it passes word for word and any other savings talk is still rejected
  let forSavings = t;
  for (const line of Object.values(NEUTRAL_SAVINGS_LINE)) {
    forSavings = clean(forSavings).split(clean(line)).join(" ");
  }

  if ([...t].length > LIMITS.textBody) reasons.push(`reply is over ${LIMITS.textBody} characters`);
  // "insurance" in English, Hindi (Devanagari) and Hinglish. "बीमारी" (illness) must not match.
  if (/insurance|(?<![\p{L}\p{M}])(इंश्योरेंस|बीमा)(?![\p{L}\p{M}])|\bbima\b/iu.test(t))
    reasons.push("mentions insurance");
  if (/\b(sav(e|es|ed|ing|ings)|discounts?|cashback|\d+\s*%\s*off)\b/i.test(forSavings))
    reasons.push("promises savings or discounts");
  // only a claim that a booking IS confirmed; "will be confirmed separately" / "pending confirmation" are fine
  if (CONFIRMED_CLAIM_RE.test(t)) reasons.push("says a booking is confirmed");
  if (/tie[\s-]?ups?|tied up|partner(ed|ship|ships)?/i.test(t)) reasons.push("mentions tie-ups");
  // offering both = Cut Medi Bills next to an Oxxy plan ("Cut Medi Bills is Oxxy's service" is one product)
  if (CMB_RE.test(t) && (OXXY_PLAN_RE.test(t) || BOTH_RE.test(t)))
    reasons.push("offers both products");

  const priceRe = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = priceRe.exec(t))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!allowedPrices.some((p) => Math.abs(p - n) < 0.5))
      reasons.push(`price not in catalog: ${n}`);
  }

  if (ctx.plans) {
    const known = new Map(ctx.plans.map((p) => [planKey(p.name), p.product]));
    for (const c of new Set(planCandidates(t))) {
      if (!known.has(c)) reasons.push(`plan name not in catalog: ${c}`);
    }
  }

  // one product per customer: nothing about the other product
  if (ctx.lockedProduct) {
    const other = ctx.lockedProduct === "oxxy" ? "cut_medi_bills" : "oxxy";
    const mentionsOtherName =
      other === "oxxy" ? /\boxxy\s+(plans?|membership)\b/i.test(t) : CMB_RE.test(t);
    const mentionsOtherPlan = (ctx.plans ?? []).some(
      (p) =>
        p.product === other &&
        p.product !== ctx.lockedProduct &&
        new RegExp(`\\b${planKey(p.name)}\\s+plans?\\b`, "i").test(t),
    );
    if (mentionsOtherName || mentionsOtherPlan) reasons.push("offers a second product");
  }

  return { ok: reasons.length === 0, reasons };
}

// A message with buttons or a list: WhatsApp's own limits (3 buttons of 20 characters, list rows of 24, ...)
export function checkMessageLimits(msg: OutboundMessage): ValidationResult {
  try {
    validateMessage(msg);
    return { ok: true, reasons: [] };
  } catch (e) {
    return { ok: false, reasons: [(e as Error).message] };
  }
}

@Injectable()
export class ReplyValidatorService {
  private async catalog() {
    const rows = await plan_catalog.find({ where: { status: true } });
    const prices: number[] = [];
    for (const p of rows) {
      prices.push(p.price, Math.round(p.price * (1 + (Number(p.gst_rate) || 0.18))));
    }
    const plans = rows.map((p) => ({ name: p.plan, product: p.product }));
    return { prices, plans };
  }

  async allowedPrices(): Promise<number[]> {
    return (await this.catalog()).prices;
  }

  // Prices and plan names come from plan_catalog only, never from the draft itself
  async validate(
    text: string,
    ctx: Pick<ValidationContext, "lockedProduct"> = {},
  ): Promise<ValidationResult> {
    const { prices, plans } = await this.catalog();
    return validateReply(text, prices, { plans, lockedProduct: ctx.lockedProduct });
  }
}
