// The voice-aligned button flow (client, 17 Nov 2026: "first message like our current bot", "as per the voice bot
// call flow", "a chat bot flow where the customer can select buttons"). Pure texts, readers and calculations;
// the pipeline (handleGuidedFlow) stores the answers and moves the step.
//
// Order = Voice AI manual 16 / 18 / 20 / 24 in chat form, with the client's current cards:
//   welcome card -> who -> (health-data notice) -> service -> condition -> age -> city -> insurance -> yearly
//   spend -> savings card (up to 30%, floor ₹500) + one plan with price + GST -> activate / add family.
// Prices come from plan_catalog; GST and the family discount follow the client's pricing document
// (first plan full price, each additional member 30% off the plan cost, GST 18% on the discounted cost).
import { InteractiveHeader, ListRow, OutboundMessage } from "@Helper/WhatsappMessage";
import { OXXY_LINKS, VERIFY_CARD_TEXT, WELCOME_CARD_TEXT } from "@Helper/TemplateDefinitions";

export type FlowStep =
  | "start"
  | "who"
  | "need"
  | "condition"
  | "age"
  | "city"
  | "insurance"
  | "spend"
  | "close"
  | "family";
export const FLOW_PREFIX = "flow:";
/** pending_action while the health-data notice waits, before the service question */
export const FLOW_AFTER_CONSENT = "after_consent:flow";

export const flowStep = (pending: string | null | undefined): FlowStep | null =>
  pending?.startsWith(FLOW_PREFIX) ? (pending.slice(FLOW_PREFIX.length).split(":")[0] as FlowStep) : null;
/** the family members added at the close step ("flow:close:2" -> 2) */
export const flowFamily = (pending: string | null | undefined): number =>
  Number((pending ?? "").split(":")[2] ?? 0) || 0;

const TITLE: InteractiveHeader = { type: "text", text: "Get in Touch with Oxxy To Reduce Your Medical Expenses" };

/** The logo for the cards: OXXY_WELCOME_IMAGE_URL, else none (WhatsApp needs a public https link) */
export function logoHeader(): InteractiveHeader | undefined {
  const url = process.env.OXXY_WELCOME_IMAGE_URL || "";
  return /^https:\/\//i.test(url) ? { type: "image", link: url } : undefined;
}

// ---------- the messages ----------

export function welcomeCard(): OutboundMessage {
  return {
    kind: "buttons",
    header: logoHeader(),
    body: WELCOME_CARD_TEXT,
    buttons: [
      { id: "flow_start", title: "Get Started" },
      { id: "flow_website", title: "Visit Our Website" },
      { id: "flow_contact", title: "Contact Us" },
    ],
  };
}

export const websiteCard = (): OutboundMessage => ({
  kind: "cta_url",
  header: { type: "text", text: "Visit Our Website" },
  body: "Explore to save on every medical visit expenditure.",
  buttonText: "Website Link",
  url: OXXY_LINKS.website,
});

export const contactText = (): string =>
  `You can reach Oxxy on ${process.env.OXXY_SUPPORT_PHONE || "8800855340"} or ${process.env.OXXY_SUPPORT_EMAIL || "info@oxxy.in"}. I can also help you right here.`;

export const verifyCard = (): OutboundMessage => ({
  kind: "cta_url",
  header: logoHeader(),
  body: VERIFY_CARD_TEXT,
  footer: "Oxxy Healthcare",
  buttonText: "Customer Testimonial",
  url: OXXY_LINKS.stories,
});

export const termsCard = (): OutboundMessage => ({
  kind: "cta_url",
  body: "Please view all our terms and conditions before proceeding with your Oxxy care plan.",
  buttonText: "Terms & Conditions",
  url: OXXY_LINKS.policies,
});

const list = (body: string, buttonLabel: string, rows: ListRow[], footer?: string, header = TITLE): OutboundMessage => ({
  kind: "list",
  header: header as { type: "text"; text: string },
  body,
  buttonLabel,
  rows,
  ...(footer ? { footer } : {}),
});

export const WHO_ROWS: ListRow[] = [
  { id: "who_self", title: "For Self/Spouse" },
  { id: "who_parent", title: "Father/Mother" },
  { id: "who_parents", title: "Parents" },
  { id: "who_family", title: "For Entire Family" },
  { id: "who_child", title: "Daughter/Son" },
];
export const NEED_ROWS: ListRow[] = [
  { id: "need_consult", title: "Doctor Consultations" },
  { id: "need_medicines", title: "Medicines" },
  { id: "need_pathlab", title: "Pathlab Tests" },
  { id: "need_diagnostic", title: "Diagnostic Center" },
  { id: "need_hospital", title: "Hospital/Clinics" },
  { id: "need_surgery", title: "Surgery/Treatment" },
  { id: "need_pregnancy", title: "Pregnancy/IVF" },
  { id: "need_future", title: "Reduce Medical Expenses", description: "Savings on future medical bills" },
  { id: "need_all", title: "All Of The Above" },
];
export const CONDITION_ROWS: ListRow[] = [
  { id: "cond_none", title: "No condition" },
  { id: "cond_sugar", title: "Diabetes / BP / Thyroid" },
  { id: "cond_heart", title: "Heart condition" },
  { id: "cond_kidney", title: "Kidney / Liver" },
  { id: "cond_cancer", title: "Cancer" },
  { id: "cond_bone", title: "Bone / Joint" },
  { id: "cond_other", title: "Other condition" },
];
export const AGE_ROWS: ListRow[] = [
  { id: "age_35", title: "Below 40" },
  { id: "age_50", title: "40 – 60" },
  { id: "age_65", title: "61 – 70" },
  { id: "age_73", title: "71 – 75" },
  { id: "age_78", title: "76 – 80" },
  { id: "age_85", title: "Above 80" },
];
// The client's ranges (their bot skipped 5,000 – 10,000). The id is the LOWER end (Voice manual 20: "use the
// lower end for a conservative illustration"); below 5,000 counts as 4,000.
const SPEND: [number, string][] = [
  [4000, "Below 5,000"],
  [5000, "5,000 – 10,000"],
  [10000, "10,000 – 20,000"],
  [20000, "20,000 – 30,000"],
  [30000, "30,000 – 50,000"],
  [50000, "50,000 – 1,00,000"],
  [100000, "1,00,000 – 5,00,000"],
  [500000, "5,00,000 – 10,00,000"],
  [1000000, "Above 10,00,000"],
];
export const SPEND_ROWS: ListRow[] = SPEND.map(([v, t]) => ({
  id: `spend_${v}`,
  title: t,
  description: v === 4000 ? "Yearly medical expenditure below 5,000" : `Yearly medical expenditure around ${t}`,
}));

export function stepMessage(step: FlowStep, prefix?: string): OutboundMessage {
  const p = (t: string) => (prefix ? `${prefix}\n\n${t}` : t);
  switch (step) {
    case "who":
      return list(p("Who are you looking for healthcare support for?"), "Family Member", WHO_ROWS);
    case "need":
      return list(
        p("Are you planning a consultation, test, medicine, treatment or surgery now, or looking to reduce future medical expenses?"),
        "Choose the option",
        NEED_ROWS,
      );
    case "condition":
      return list(
        p("Is there an ongoing or pre-existing condition we should consider?"),
        "Choose one",
        CONDITION_ROWS,
        "Share only what you are comfortable with",
      );
    case "age":
      return list(
        p("May I know the patient's age? If several family members need care, the age of the oldest."),
        "Choose age",
        AGE_ROWS,
      );
    case "city":
      return {
        kind: "location_request",
        body: p("Which city and locality is the patient in? Type it, or share the location with the button below."),
      };
    case "insurance":
      return {
        kind: "buttons",
        body: p("Do you currently have health insurance?"),
        buttons: [
          { id: "ins_yes", title: "Yes" },
          { id: "ins_no", title: "No" },
          { id: "ins_corp", title: "Through Employer" },
        ],
      };
    case "spend":
      return list(
        p("How much will your annual medical expense be next year? Include consultations, tests, medicines and treatments."),
        "Calculate Now",
        SPEND_ROWS,
        undefined,
        { type: "text", text: "Calculator: See how much you can save" },
      );
    default:
      return welcomeCard();
  }
}

// ---------- reading the answers (a tap sends the id; typed words work too) ----------

const t = (s: string) => (s || "").toLowerCase().trim();

export type Who = "self" | "parent" | "parents" | "family" | "child";
export function readWho(text: string): Who | null {
  const s = t(text);
  const id = s.match(/^who_(self|parent|parents|family|child)$/);
  if (id) return id[1] as Who;
  if (/\b(self|myself|me|spouse|wife|husband|for me)\b/.test(s)) return "self";
  if (/\bparents\b|amma appa|maa papa/.test(s)) return "parents";
  if (/\b(father|mother|dad|mom|mum|amma|appa|papa|maa)\b/.test(s)) return "parent";
  if (/\b(family|everyone|all of us|whole)\b/.test(s)) return "family";
  if (/\b(son|daughter|child|children|kid|kids)\b/.test(s)) return "child";
  return null;
}

export type Need = "consult" | "medicines" | "pathlab" | "diagnostic" | "hospital" | "surgery" | "pregnancy" | "future" | "all";
export function readNeed(text: string): Need | null {
  const s = t(text);
  const id = s.match(/^need_(consult|medicines|pathlab|diagnostic|hospital|surgery|pregnancy|future|all)$/);
  if (id) return id[1] as Need;
  if (/\b(pregnan\w*|ivf|delivery|fertility)\b/.test(s)) return "pregnancy";
  if (/\b(surgery|operation|treatment|procedure|transplant|chemo\w*)\b/.test(s)) return "surgery";
  if (/\b(hospital|admission|admit\w*|clinic|ipd)\b/.test(s)) return "hospital";
  if (/\b(scan|mri|ct|x-?ray|ultrasound|diagnostic)\b/.test(s)) return "diagnostic";
  if (/\b(lab|test|tests|blood|pathlab|pathology)\b/.test(s)) return "pathlab";
  if (/\b(medicine|medicines|tablet|pharmacy)\b/.test(s)) return "medicines";
  if (/\b(doctor|consult\w*|opd|checkup|check-up)\b/.test(s)) return "consult";
  if (/\b(all of the above|all)\b/.test(s)) return "all";
  if (/\b(future|savings?|reduce|general|no need|nothing now|not now|just exploring)\b/.test(s)) return "future";
  return null;
}
export const NEED_LABEL: Record<Need, string> = {
  consult: "doctor consultations",
  medicines: "medicines",
  pathlab: "lab tests",
  diagnostic: "diagnostic scans",
  hospital: "hospital or clinic care",
  surgery: "a surgery or treatment",
  pregnancy: "pregnancy or IVF care",
  future: "savings on future medical bills",
  all: "consultations, tests, medicines and hospital care",
};

export type Condition = "none" | "sugar" | "heart" | "kidney" | "cancer" | "bone" | "other";
export function readCondition(text: string): Condition | null {
  const s = t(text);
  const id = s.match(/^cond_(none|sugar|heart|kidney|cancer|bone|other)$/);
  if (id) return id[1] as Condition;
  if (/^(no|none|nothing|nil|illa|nahi|no condition)\b/.test(s)) return "none";
  if (/\b(diabet\w*|sugar|bp|blood pressure|thyroid)\b/.test(s)) return "sugar";
  if (/\b(heart|cardiac|bypass|angio\w*)\b/.test(s)) return "heart";
  if (/\b(kidney|dialysis|liver)\b/.test(s)) return "kidney";
  if (/\b(cancer|tumou?r|onco\w*)\b/.test(s)) return "cancer";
  if (/\b(bone|joint|knee|spine|arthritis|ortho\w*)\b/.test(s)) return "bone";
  if (s.split(/\s+/).length <= 6 && !/\?\s*$/.test(s)) return "other";
  return null;
}
export const CONDITION_LABEL: Record<Condition, string | null> = {
  none: null,
  sugar: "diabetes, BP or thyroid",
  heart: "a heart condition",
  kidney: "a kidney or liver condition",
  cancer: "cancer",
  bone: "a bone or joint condition",
  other: "an ongoing condition",
};

export function readAgeChoice(text: string): number | null {
  const id = t(text).match(/^age_(\d{2})$/);
  return id ? Number(id[1]) : null;
}

export type Insurance = "has_insurance" | "no_insurance" | "corporate_insurance";
export function readInsurance(text: string): Insurance | null {
  const s = t(text);
  if (s === "ins_yes" || /^(yes|yeah|haan|aama|have|i have)\b/.test(s)) return "has_insurance";
  if (s === "ins_no" || /^(no|nope|nahi|illa|don'?t|do not)\b/.test(s)) return "no_insurance";
  if (s === "ins_corp" || /\b(employer|company|corporate|office)\b/.test(s)) return "corporate_insurance";
  return null;
}

export function readSpendChoice(text: string): number | null {
  const id = t(text).match(/^spend_(\d+)$/);
  return id ? Number(id[1]) : null;
}

// ---------- the calculation (Voice manual 20, KB Q101-Q107) ----------

/** rounded saving = floor((annual expenditure × 0.30) ÷ 500) × 500 */
export const roundedSaving = (yearly: number): number => Math.floor((Number(yearly) * 0.3) / 500) * 500;

export const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

export const GST_RATE = 0.18;
export const gstOn = (cost: number) => Math.round(cost * GST_RATE);
/** Pricing document 10: first plan cost + GST; each additional member: cost × 70% + GST on that */
export function familyPrice(cost: number, extra: number) {
  const first = { cost, gst: gstOn(cost), total: cost + gstOn(cost) };
  const discounted = Math.round(cost * 0.7);
  const next = { cost: discounted, discount: cost - discounted, gst: gstOn(discounted), total: discounted + gstOn(discounted) };
  return { first, next, extra, total: first.total + extra * next.total };
}

// ---------- the plan (Voice manual 10 + 21, KB section 4) ----------

export type PlanName = "everyday" | "vital" | "thrive" | "infinity";
export interface FlowFacts {
  who?: Who | null;
  need?: Need | null;
  condition?: Condition | null;
  age?: number | null;
  spend?: number | null;
  insurance?: Insurance | null;
}

export function pickPlan(f: FlowFacts): PlanName {
  const age = Number(f.age) || 0;
  const spend = Number(f.spend) || 0;
  const elderlyParent = (f.who === "parent" || f.who === "parents") && age >= 60;
  // Infinity: above the other plans' ages, elderly parents, a major condition, a planned surgery or treatment,
  // pregnancy / IVF, or a high yearly spend (Voice manual 10 "Natural Infinity preference")
  if (
    age > 80 ||
    elderlyParent ||
    ["heart", "kidney", "cancer"].includes(String(f.condition)) ||
    f.need === "surgery" ||
    f.need === "pregnancy" ||
    spend >= 200000
  )
    return "infinity";
  // another pre-existing condition: Thrive supports new and pre-existing needs (Voice manual 21)
  if (f.condition && f.condition !== "none") return age > 80 ? "infinity" : "thrive";
  // hospital care: Vital covers OPD and IPD
  if (f.need === "hospital" || f.need === "all") return age <= 75 ? "vital" : age <= 80 ? "thrive" : "infinity";
  // routine OPD: Everyday for a small spend (Voice manual 10 "When not to push Infinity")
  if (age <= 70 && spend < 100000) return "everyday";
  if (age <= 75) return "vital";
  if (age <= 80) return "thrive";
  return "infinity";
}

export const PLAN_TITLE: Record<PlanName, string> = {
  everyday: "Everyday",
  vital: "Vital",
  thrive: "Thrive",
  infinity: "Infinity",
};
// Plan knowledge (Voice manual 9, KB Q061-Q064)
export const PLAN_WHY: Record<PlanName, string> = {
  everyday: "it suits routine consultations, tests and medicines, with eligible bills up to ₹10 lakh and savings of up to 20%",
  vital: "it supports OPD and hospitalisation (IPD), with eligible bills up to ₹20 lakh and savings of up to 25%",
  thrive: "it supports new and pre-existing conditions, with eligible bills up to ₹30 lakh and savings of up to 30%",
  infinity: "it has no age limit and no upper eligible bill limit, supports new and pre-existing needs, OPD and IPD, and offers savings of up to 40%",
};

/** One line that connects the customer's own answers to the plan (Voice manual 7 / 21 value bridges) */
export function valueBridge(f: FlowFacts): string {
  if (f.who === "parent" || f.who === "parents") return "Since this is for your parents, the plan should not run into age or bill limits later.";
  if (f.condition && f.condition !== "none") return `Because you mentioned ${CONDITION_LABEL[f.condition]}, support for pre-existing needs matters most.`;
  if (f.need === "surgery") return "A planned surgery or treatment can create a large bill, so broader support helps.";
  if (f.need === "pregnancy") return "Pregnancy and IVF care are included under Infinity.";
  if (f.insurance === "has_insurance" || f.insurance === "corporate_insurance")
    return "Your insurance remains valuable; Oxxy works alongside it for OPD, exclusions, waiting periods and co-payments.";
  return "Oxxy can be used again and again during the plan, for routine care as well as larger needs, with no medical screening to activate.";
}

export interface PlanPrice {
  monthly: number | null;
  yearly: number | null;
}

/** The savings card: "You mentioned … Oxxy can help you save up to ₹X" + the website calculator */
export function savingsCard(spend: number): OutboundMessage {
  const save = roundedSaving(spend);
  const body =
    save >= 500
      ? `You mentioned a yearly medical expense of about ${inr(spend)}. Oxxy can help you save up to ${inr(save)}. The actual saving depends on the services and providers used.`
      : `You mentioned a yearly medical expense of about ${inr(spend)}. At this level the savings figure would be small, so I will suggest the plan by your healthcare need.`;
  return {
    kind: "cta_url",
    header: logoHeader() ?? { type: "text", text: "Calculator: See how much you can save" },
    body,
    buttonText: "Calculate Now",
    url: OXXY_LINKS.calculator,
  };
}

const priceLine = (label: string, cost: number) => `${label}: ${inr(cost)} + GST ${inr(gstOn(cost))} = ${inr(cost + gstOn(cost))}`;

/** The plan with its price and GST (pricing document 9), and the next step as buttons */
export function planCard(plan: PlanName, price: PlanPrice, f: FlowFacts): OutboundMessage {
  const lines = [
    valueBridge(f),
    `Based on what you shared, the Oxxy ${PLAN_TITLE[plan]} plan fits best because ${PLAN_WHY[plan]}.`,
    "",
    ...(price.yearly ? [priceLine("Yearly", price.yearly)] : []),
    ...(price.monthly ? [priceLine("Monthly", price.monthly)] : []),
    "",
    "Would you like to activate your Oxxy care plan?",
  ];
  return {
    kind: "buttons",
    header: { type: "text", text: `Oxxy ${PLAN_TITLE[plan]} plan` },
    body: lines.join("\n"),
    buttons: [
      { id: "act_yearly", title: "Activate Yearly" },
      { id: "act_monthly", title: "Activate Monthly" },
      { id: "flow_family", title: "Add Family Member" },
    ],
  };
}

export const familyQuestion = (plan: PlanName): OutboundMessage => ({
  kind: "buttons",
  body: `How many more family members would you like to add to the ${PLAN_TITLE[plan]} plan? The first plan is at full price and each additional member gets 30% off the plan cost.`,
  buttons: [
    { id: "fam_1", title: "1 more" },
    { id: "fam_2", title: "2 more" },
    { id: "fam_3", title: "3 more" },
  ],
});

export function readFamily(text: string): number | null {
  const s = t(text);
  const id = s.match(/^fam_([1-9])$/);
  if (id) return Number(id[1]);
  const n = s.match(/^(\d)\b/);
  return n && Number(n[1]) >= 1 && Number(n[1]) <= 9 ? Number(n[1]) : null;
}

/** Pricing document 9: the transparent breakdown, yearly (and the monthly total) */
export function familyCard(plan: PlanName, price: PlanPrice, extra: number): OutboundMessage {
  const out: string[] = [`Oxxy ${PLAN_TITLE[plan]} for ${extra + 1} members:`];
  const block = (label: string, cost: number) => {
    const fp = familyPrice(cost, extra);
    out.push(
      "",
      `${label}`,
      `Member 1: ${inr(fp.first.cost)} + GST ${inr(fp.first.gst)} = ${inr(fp.first.total)}`,
      `Each additional member: ${inr(cost)} − 30% (${inr(fp.next.discount)}) = ${inr(fp.next.cost)} + GST ${inr(fp.next.gst)} = ${inr(fp.next.total)}`,
      `Total for ${extra + 1} members: ${inr(fp.total)}`,
    );
  };
  if (price.yearly) block("Yearly", price.yearly);
  if (price.monthly) block("Monthly", price.monthly);
  out.push("", "Would you like to activate it?");
  return {
    kind: "buttons",
    body: out.join("\n"),
    buttons: [
      { id: "act_yearly", title: "Activate Yearly" },
      { id: "act_monthly", title: "Activate Monthly" },
      { id: "flow_menu", title: "Main Menu" },
    ],
  };
}

/** "main menu", "menu", "start again" or the Main Menu button */
export const asksMainMenu = (text: string) => /^(flow_menu|main menu|menu|start again|restart)\s*[.!]?$/i.test((text || "").trim());
