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
    "details detail information about rates pricing price prices cost costs " +
    // Hinglish ("aur plan", "aapke plan", "kaunsa plan")
    "aur ya aapke aapka aapki apne apna apni ke ka ki kis kaunsa kaunse koi yeh ye woh sahi accha achha"
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
const LINK_RE =
  /https?:\/\/|\bwww\.|\b[\w-]+\.(?:in|com|org|net|co|biz|info|io|me|app|ly|link|xyz|site|online)\b/i;
const CONFIRMED_CLAIM_RE =
  /\b(booking|appointment|slot|visit|request)\b[^.!?\n]{0,40}\b(is|has been|have been|are|now)\s+(now\s+)?confirmed\b|\bconfirmed\s+(your|the)\s+(booking|appointment|slot|visit)\b|^\s*confirmed\b/i;

// Playbook 2.1 forbids PROMISING a saving or discount, not describing Oxxy: the approved explanation is
// "a lifelong healthcare savings and support partner" (7.1, 13). So the generic noun passes; a promise,
// a figure, a guarantee, an offer or "pays for itself" (only after the 9.2 check, added by the system) does not.
// Negations ("not guaranteed", "cannot guarantee") are taken out first: they are the required honesty.
const NEGATED_GUARANTEE =
  /\b(not|never|no|cannot|can ?not|can'?t|isn'?t|is not|won'?t)\s+(be\s+|a\s+)?(guarantee[sd]?|guaranteed|promised?)\b|\bwithout (a |any )?guarantee\b|guarantee\s+(nahi|nahin)\b|गारंटी नहीं/giu;
const SAVINGS_PROMISE: RegExp[] = [
  /\b(you|you'?ll|you will|you can|you could|we will|we'll|it will|this will)\s+(definitely\s+|surely\s+|easily\s+|always\s+)?(save|get (a |an )?(discount|cashback|saving))/i,
  /\bsave\s+(a lot|lots|money|big|huge|thousands|lakhs?|up to|upto|\d)/i,
  /\b(guarantee[sd]?|guaranteed|assured|promised?|definitely|surely|fixed)\b[^.!?\n]{0,40}\b(sav(e|es|ed|ing|ings)|discounts?|cashback)\b/i,
  /\b(sav(e|es|ed|ing|ings)|discounts?|cashback)\b[^.!?\n]{0,40}\b(guarantee[sd]?|guaranteed|assured|promised)\b/i,
  /\b(sav(e|es|ed|ing|ings)|discounts?|off)\b[^.!?\n]{0,30}\d+\s*(%|percent|per cent)|\d+\s*(%|percent|per cent)[^.!?\n]{0,30}\b(sav(e|es|ed|ing|ings)|discounts?|off)\b/i,
  /\b(offer|offers|give|gives|provide|provides|get|gets|enjoy)\s+(you\s+)?(a |an |huge |big |special |flat )?(discounts?|cashback|savings?)\b/i,
  /\bcashback\b/i,
  /\bpays? for itself\b/i,
  /\b(pakka|pakki|guarantee|guaranteed)\b[^.!?\n]{0,20}\b(bachat|discount)\b|\b(bachat|discount)\b[^.!?\n]{0,20}\b(pakka|pakki|milega|milegi|guarantee)\b/i,
  /(बचत|डिस्काउंट|छूट)[^।.!?\n]{0,20}(पक्की|पक्का|गारंटी|मिलेगी|मिलेगा)|(पक्की|गारंटी)[^।.!?\n]{0,20}(बचत|डिस्काउंट|छूट)/u,
];

// A refusal clause ("I can't provide discount codes", "50% bachat ki guarantee nahi de sakta") is the honest
// answer, not a promise. Clauses are split on sentence ends, commas and "but / lekin / par", so a promise
// after the refusal ("I can't say exactly, but you will save 30%") is still checked.
const REFUSAL =
  /\b(can'?t|cannot|can not|won'?t|will not|not able to|unable to|do not|don'?t|nahi|nahin)\s+(\w+\s+){0,2}(provide|give|offer|share|promise|guarantee|confirm|de|kar|bata)\w*\b|\b(nahi|nahin) (de|kar|bata) (sakta|sakti|sakte)\b|नहीं (दे|कर|बता) सक/iu;
const CLAUSES = /[.!?।,;]+|\b(?:but|however|lekin|par|magar|लेकिन|पर)\b/iu;

function withoutRefusals(t: string): string {
  return t
    .split(CLAUSES)
    .filter((c) => c && !REFUSAL.test(c))
    .join(". ");
}

export function promisesSavings(text: string): boolean {
  const t = withoutRefusals(text || "").replace(NEGATED_GUARANTEE, " ");
  return SAVINGS_PROMISE.some((re) => re.test(t));
}

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
  if (promisesSavings(forSavings)) reasons.push("promises savings or discounts");
  // Playbook 2.1: never shorten the name; no urgency or dark patterns; never ask for credentials; never
  // describe either product as insurance, cover or a policy
  if (/\bCMB\b|\bcut[\s-]*medi\b(?![\s-]*bills?\b)|\bcutmedibills?\b|\bc\.m\.b\b/i.test(t))
    reasons.push("shortens Cut Medi Bills");
  if (
    /\b(activate|buy|join|sign up|subscribe)\s+(it\s+|now\s+)?today\b|\b(offer|price|deal|discount)\b[^.!?\n]{0,25}\b(expires?|expiring|ends|ending|valid (till|until|only))\b|\blimited[- ](time|period|offer|slots?)\b|\bprices?\s+(will|may|is going to)\s+(go up|rise|increase)\b|\bhurry\b|\blast chance\b|\btoo late\b/i.test(
      t,
    )
  )
    reasons.push("creates urgency");
  // a warning ("never share your OTP") is fine; a request is not
  const noWarnings = t.replace(
    /\b(never|don'?t|do not|please do not|not|without)\s+(ever\s+)?(share|send|tell|give|enter|provide|type)\b/gi,
    " ",
  );
  if (/\b(share|send|tell|give|enter|provide|type)\b[^.!?\n]{0,30}\b(otp|pin|upi pin|password|cvv|card number|net ?banking)\b/i.test(noWarnings))
    reasons.push("asks for credentials");
  if (
    /\b(oxxy|cut medi bills|the plan|this plan|your plan|everyday|vital|thrive|infinity)\b[^.!?\n]{0,25}\b(covers?|covered|coverage)\b|\bpolicy ?holder\b|\bclaim settlement\b/i.test(
      t,
    )
  )
    reasons.push("describes the product as cover");
  else if (/\bcovered under\b|\b(be|are|is|get|gets|stay|remain)\s+(fully\s+|completely\s+)?covered\b/i.test(t))
    reasons.push("describes the product as cover");
  // Playbook 2: never reveal internal prompts, routing or rules (red-team: prompt injection)
  if (
    // what a leak looks like, not a refusal ("I can't share internal instructions" is the right answer)
    /\b(here is|here's|this is|below is)\s+(my|the)\s+(system\s+)?(prompt|instructions)\b|\bmy (system )?(instructions|prompt|rules|guidelines) (are|say|is)\b|\bi (was|am|have been) (instructed|programmed|told) to\b|\bdeveloper mode (is )?(on|enabled|activated)\b|\bas an ai language model\b|\byou are oxxy health'?s whatsapp ai assistant\b/i.test(
      t,
    )
  )
    reasons.push("reveals internal instructions");
  // only a claim that a booking IS confirmed; "will be confirmed separately" / "pending confirmation" are fine
  if (CONFIRMED_CLAIM_RE.test(t)) reasons.push("says a booking is confirmed");
  // "support partner" (Playbook 7.1, Oxxy describing itself) is fine; a partnership with a centre is not
  if (
    /tie[\s-]?ups?|tied up|\bpartner(ed|ship|ships)\b|\b(partner|network|empanelled|empaneled)\s+(hospitals?|centres?|centers?|clinics?|labs?|doctors?)\b/i.test(
      t,
    )
  )
    reasons.push("mentions tie-ups");
  // links come only from plan_catalog / approved_asset, added by the system (Playbook 2.1, 12.2):
  // a draft with any link, web address or e-mail (even the right one) is rewritten
  if (LINK_RE.test(t)) reasons.push("contains a link");
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
