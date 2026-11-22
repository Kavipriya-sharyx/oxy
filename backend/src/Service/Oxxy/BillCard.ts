// Client sequence 1 (19-20 Nov 2026, hand sketch "Reduce Your Medical Bill Now"): the first card of a chat.
//   image (client's picture) + "up to 40% discount"
//   [Calculate discount] -> "Enter your bill amount" -> the discount at 30%
//   [Learn More]         -> the client's comparison picture + its rows as text (22 Nov)
//   [Activate Oxxy]      -> the plans -> the chosen plan card (price + GST) -> the existing activation steps
//   "Talk to Us" (the sketch's fourth item) is left out for now; WhatsApp shows at most three reply buttons and
//   the call link in the text was dropped on 20 Nov, to be added somewhere else later
// Pure texts and readers; the pipeline (handleBillCard) sends them. No LLM, so the answers come at once
// (client: "timer delay: minimise"). Hindi / Hinglish are drafts for a native-speaker review.
import { InteractiveHeader, ListRow, OutboundMessage } from "@Helper/WhatsappMessage";
import { say } from "@Helper/Lang";
import { PLAN_DETAILS, spendAnswer } from "@Helper/PlanReplies";
import { firstPlan, firstPlanLines } from "@Helper/PlanPricing";
import { PLAN_DETAILS_URL, PlanName } from "./GuidedFlow";

type Lg = string | null | undefined;
const tr = (l: Lg, en: string, hi: string, hinglish: string) => say({ en, hi, hinglish }, l);

/** Button and row ids (a tap sends the id) */
export const BILL_IDS = {
  calc: "bill_calc",
  learn: "bill_learn",
  activate: "bill_activate",
  /** the plans list's "View Plan Features" row (client, 21 Nov) */
  features: "plan_features",
  menu: "flow_menu",
} as const;
/** pending_action while the bill amount is awaited */
export const BILL_AMOUNT = "bill_amount";
/** pending_action while the plans list is open (a typed plan name is read too) */
export const BILL_PLAN = "bill_plan";
/** The illustration rate of the calculator (sketch: "@ 30%") and the published maximum (Infinity) */
export const BILL_RATE = 0.3;
export const MAX_DISCOUNT_PCT = 40;

/**
 * The card picture: OXXY_BILL_IMAGE_URL, else oxxy-bill-card.jpg next to the welcome image (the console's public
 * folder, frontend/public). WhatsApp needs a public https JPG / PNG; no link = the card without a picture.
 */
export function billImageHeader(): InteractiveHeader | undefined {
  const own = process.env.OXXY_BILL_IMAGE_URL || "";
  if (/^https:\/\//i.test(own)) return { type: "image", link: own };
  const welcome = process.env.OXXY_WELCOME_IMAGE_URL || "";
  const origin = welcome.match(/^https:\/\/[^/]+/i)?.[0];
  return origin ? { type: "image", link: `${origin}/oxxy-bill-card.jpg` } : undefined;
}

export const BILL_CARD_TEXT = (l?: Lg): string =>
  [
    tr(
      l,
      "*Reduce Your Medical Bill Now*",
      "*अपना मेडिकल बिल अभी कम करें*",
      "*Apna medical bill abhi kam karein*",
    ),
    "",
    tr(
      l,
      `Get an instant discount of up to ${MAX_DISCOUNT_PCT}% on hospital, diagnostic centre and path lab bills across India with Oxxy.`,
      `Oxxy के साथ पूरे भारत में अस्पताल, डायग्नोस्टिक सेंटर और पैथ लैब के बिल पर ${MAX_DISCOUNT_PCT}% तक की तुरंत छूट पाएँ।`,
      `Oxxy ke saath poore India mein hospital, diagnostic centre aur path lab bills par ${MAX_DISCOUNT_PCT}% tak ki instant discount paayein.`,
    ),
  ].join("\n");

/** The first card: picture, text, three buttons */
export function billCard(l?: Lg): OutboundMessage {
  return {
    kind: "buttons",
    header: billImageHeader(),
    body: BILL_CARD_TEXT(l),
    buttons: [
      { id: BILL_IDS.calc, title: tr(l, "Calculate discount", "छूट जानें", "Discount jaanein") },
      { id: BILL_IDS.learn, title: tr(l, "Learn More", "और जानें", "Aur jaanein") },
      {
        id: BILL_IDS.activate,
        title: tr(l, "Activate Oxxy", "Oxxy एक्टिवेट करें", "Oxxy activate"),
      },
    ],
  };
}

export const billAmountAsk = (l?: Lg): string =>
  tr(
    l,
    "Please enter your bill amount (for example 10000 or 1.5 lakh).",
    "कृपया अपने बिल की राशि लिखें (जैसे 10000 या 1.5 लाख)।",
    "Please apne bill ki amount likhein (jaise 10000 ya 1.5 lakh).",
  );

export const billAmountAgain = (l?: Lg): string =>
  tr(
    l,
    "I could not read an amount. Please type only the bill amount in rupees, for example 25000.",
    "मैं राशि नहीं पढ़ पाया। कृपया सिर्फ़ बिल की राशि रुपये में लिखें, जैसे 25000।",
    "Main amount nahi padh paaya. Please sirf bill ki amount rupees mein likhein, jaise 25000.",
  );

/** "10000", "₹25,000", "1.5 lakh", "50k": the bill in rupees; null = not an amount */
export function readBillAmount(text: string): number | null {
  const t = (text || "").trim();
  if (!t || t.split(/\s+/).length > 6) return null;
  // a bill is one amount: "per month" must not multiply it (spendAnswer reads a yearly spend)
  const n = spendAnswer(t.replace(/\b(per\s+)?(month|monthly|mahina|mahine)\b/gi, " "));
  return n != null && n >= 100 ? n : null;
}

const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

/** The discount at the illustration rate (whole rupees) and what is left to pay */
export function billDiscount(amount: number): { discount: number; pay: number } {
  const discount = Math.floor(Number(amount) * BILL_RATE);
  return { discount, pay: Math.round(Number(amount)) - discount };
}

/** The calculator answer, laid out like the client's picture (bill / instant discount / amount paid) */
export function billResultCard(amount: number, l?: Lg): OutboundMessage {
  const { discount, pay } = billDiscount(amount);
  const pct = Math.round(BILL_RATE * 100);
  return {
    kind: "buttons",
    header: {
      type: "text",
      text: tr(l, "Your discount estimate", "आपकी छूट का अनुमान", "Aapki discount estimate"),
    },
    body: [
      tr(
        l,
        `Bill amount: ${inr(amount)}`,
        `बिल राशि: ${inr(amount)}`,
        `Bill amount: ${inr(amount)}`,
      ),
      tr(
        l,
        `Instant discount (up to ${pct}%): − ${inr(discount)}`,
        `तुरंत छूट (${pct}% तक): − ${inr(discount)}`,
        `Instant discount (${pct}% tak): − ${inr(discount)}`,
      ),
      tr(
        l,
        `You could pay: ${inr(pay)}`,
        `आप लगभग इतना देंगे: ${inr(pay)}`,
        `Aap lagbhag itna denge: ${inr(pay)}`,
      ),
      "",
      tr(
        l,
        "Estimate for illustration only. The actual discount depends on the plan (up to 20%, 25%, 30% or 40%), the treatment and the hospital.",
        "यह सिर्फ़ उदाहरण के लिए अनुमान है। असली छूट प्लान (20%, 25%, 30% या 40% तक), इलाज और अस्पताल पर निर्भर करती है।",
        "Yeh sirf example ke liye estimate hai. Asli discount plan (20%, 25%, 30% ya 40% tak), treatment aur hospital par depend karta hai.",
      ),
    ].join("\n"),
    buttons: [
      {
        id: BILL_IDS.activate,
        title: tr(l, "Activate Oxxy", "Oxxy एक्टिवेट करें", "Oxxy activate"),
      },
      { id: BILL_IDS.learn, title: tr(l, "Learn More", "और जानें", "Aur jaanein") },
      { id: BILL_IDS.menu, title: tr(l, "Main Menu", "मुख्य मेनू", "Main Menu") },
    ],
  };
}

/**
 * Learn More's picture: the client's "Why Choose Oxxy Medical Discount Plans?" comparison (20 Nov), from
 * OXXY_COMPARE_IMAGE_URL, else oxxy-compare-card.jpg next to the welcome image; no link = text only.
 */
export function compareImageHeader(): InteractiveHeader | undefined {
  const own = process.env.OXXY_COMPARE_IMAGE_URL || "";
  if (/^https:\/\//i.test(own)) return { type: "image", link: own };
  const origin = (process.env.OXXY_WELCOME_IMAGE_URL || "").match(/^https:\/\/[^/]+/i)?.[0];
  return origin ? { type: "image", link: `${origin}/oxxy-compare-card.jpg` } : undefined;
}

/**
 * The rows of the client's picture "Why Choose Oxxy Medical Discount Plans?" (oxxy-compare-card.jpg), in its
 * order and words (client, 22 Nov: the text under the picture was different from it). [topic, Oxxy, insurance]
 */
const COMPARE_ROWS: [string, string, string][] = [
  ["Cost to you", "Low, fixed subscription (monthly or annual)", "Higher premiums (annual, increases with age)"],
  [
    "Coverage",
    "Instant discounts on hospitals, diagnostics, medicines, consultations & procedures",
    "Pays part of hospital bills (after approval & documents)",
  ],
  ["Waiting period", "Only 3–5 working days (for activation)", "Often 30 days – 4 years (for certain conditions)"],
  ["Age limit", "No age limit", "Entry age limits (usually 60–65 years)"],
  ["Pre-existing conditions", "Included", "Often excluded or covered after a waiting period"],
  ["Usage limit", "Unlimited use (as often as you need)", "Limited to sum assured (e.g. ₹5–50 lakhs)"],
  [
    "Network",
    "Leading hospitals & labs PAN-India",
    "Cashless only at specific hospitals",
  ],
  [
    "Claims",
    "No claims, no paperwork: show your Oxxy code, get the discounted price",
    "Claim filing, documents and approval (can take days/weeks)",
  ],
];
const COMPARE_ROWS_HI: [string, string, string][] = [
  ["आपका खर्च", "कम, तय सब्सक्रिप्शन (मासिक या सालाना)", "ज़्यादा प्रीमियम (सालाना, उम्र के साथ बढ़ता है)"],
  [
    "कवरेज",
    "अस्पताल, जांच, दवाइयों, परामर्श और प्रक्रियाओं पर तुरंत छूट",
    "अस्पताल बिल का एक हिस्सा (मंज़ूरी और कागज़ात के बाद)",
  ],
  ["इंतज़ार", "सिर्फ़ 3–5 कार्य दिवस (एक्टिवेशन के लिए)", "अक्सर 30 दिन – 4 साल (कुछ बीमारियों के लिए)"],
  ["उम्र सीमा", "कोई उम्र सीमा नहीं", "प्रवेश की उम्र सीमा (आमतौर पर 60–65 साल तक)"],
  ["पुरानी बीमारियाँ", "शामिल", "अक्सर बाहर या इंतज़ार के बाद कवर"],
  ["इस्तेमाल की सीमा", "असीमित इस्तेमाल (जितनी बार ज़रूरत हो)", "बीमा राशि तक सीमित (जैसे ₹5–50 लाख)"],
  ["नेटवर्क", "पूरे भारत में प्रमुख अस्पताल और लैब", "सीमित नेटवर्क (कैशलेस सिर्फ़ कुछ अस्पतालों में)"],
  [
    "क्लेम",
    "कोई क्लेम या कागज़ नहीं: अपना Oxxy कोड दिखाएँ और छूट वाली कीमत पाएँ",
    "क्लेम, कागज़ात और मंज़ूरी ज़रूरी (दिन/हफ़्ते लग सकते हैं)",
  ],
];
const COMPARE_ROWS_HINGLISH: [string, string, string][] = [
  ["Aapka kharcha", "Kam, fixed subscription (monthly ya annual)", "Zyada premium (annual, umar ke saath badhta hai)"],
  [
    "Coverage",
    "Hospital, tests, medicines, consultation, procedures par instant discount",
    "Hospital bill ka hissa (approval ke baad)",
  ],
  ["Waiting", "Sirf 3–5 working days (activation ke liye)", "Aksar 30 din – 4 saal (kuch conditions ke liye)"],
  ["Age limit", "Koi age limit nahi", "Entry age limit (aam taur par 60–65 saal tak)"],
  ["Pre-existing conditions", "Included", "Aksar excluded ya waiting period ke baad cover"],
  ["Usage limit", "Unlimited use (jitni baar zaroorat ho)", "Sum assured tak limited (jaise ₹5–50 lakh)"],
  ["Network", "PAN-India leading hospitals aur labs", "Cashless sirf kuch hospitals mein"],
  [
    "Claims",
    "No claim, no paperwork: Oxxy code dikhayein, discounted price paayein",
    "Claim, documents aur approval (din/hafte lagte hain)",
  ],
];

export function billCompareCard(l?: Lg): OutboundMessage {
  const rows = l === "hi" ? COMPARE_ROWS_HI : l === "hinglish" ? COMPARE_ROWS_HINGLISH : COMPARE_ROWS;
  const body = [
    tr(
      l,
      "*Why Choose Oxxy Medical Discount Plans?*",
      "*Oxxy मेडिकल डिस्काउंट प्लान क्यों चुनें?*",
      "*Oxxy Medical Discount Plans kyun chunein?*",
    ),
    tr(l, "✅ Oxxy   ❌ Regular health insurance", "✅ Oxxy   ❌ सामान्य हेल्थ इंश्योरेंस", "✅ Oxxy   ❌ Regular health insurance"),
    ...rows.flatMap(([topic, oxxy, other]) => ["", `*${topic}*`, `✅ ${oxxy}`, `❌ ${other}`]),
    "",
    tr(
      l,
      "Oxxy is not insurance; keep your insurance, Oxxy works alongside it.",
      "Oxxy इंश्योरेंस नहीं है। कृपया अपना इंश्योरेंस जारी रखें; Oxxy उसके साथ काम करता है।",
      "Oxxy insurance nahi hai; apna insurance rakhein, Oxxy saath mein kaam karta hai.",
    ),
  ].join("\n");
  return {
    kind: "buttons",
    header: compareImageHeader(),
    body,
    buttons: [
      { id: BILL_IDS.calc, title: tr(l, "Calculate discount", "छूट जानें", "Discount jaanein") },
      {
        id: BILL_IDS.activate,
        title: tr(l, "Activate Oxxy", "Oxxy एक्टिवेट करें", "Oxxy activate"),
      },
      { id: BILL_IDS.menu, title: tr(l, "Main Menu", "मुख्य मेनू", "Main Menu") },
    ],
  };
}

export const PLAN_ORDER: PlanName[] = ["everyday", "vital", "thrive", "infinity"];
const PLAN_PCT: Record<PlanName, number> = { everyday: 20, vital: 25, thrive: 30, infinity: 40 };
const PLAN_LABEL: Record<PlanName, string> = {
  everyday: "Oxxy Everyday",
  vital: "Oxxy Vital",
  thrive: "Oxxy Thrive",
  infinity: "Oxxy Infinity",
};
export const planRowId = (p: PlanName) => `plan_${p}`;

/** "plan_vital" (a tapped row) or the plan's name typed ("vital", "oxxy thrive") */
export function readPlanPick(text: string): PlanName | null {
  const t = (text || "").trim().toLowerCase();
  const tapped = t.match(/^plan_(everyday|vital|thrive|infinity)$/);
  if (tapped) return tapped[1] as PlanName;
  if (t.split(/\s+/).length > 4) return null;
  return PLAN_ORDER.find((p) => new RegExp(`\\b${p}\\b`).test(t)) ?? null;
}

/**
 * "Activate Oxxy" -> the four plans as a list (sketch: "plans"). Each row: the plan, its discount and the yearly
 * price with GST from plan_catalog (rows without a price show only the discount).
 */
export function plansListCard(
  prices: Partial<Record<PlanName, number | null>>,
  l?: Lg,
): OutboundMessage {
  const rows: ListRow[] = PLAN_ORDER.map((p) => {
    const yearly = prices[p];
    const total = yearly ? firstPlan(yearly).total : null;
    const desc = [
      tr(
        l,
        `Up to ${PLAN_PCT[p]}% off bills`,
        `बिल पर ${PLAN_PCT[p]}% तक छूट`,
        `Bills par ${PLAN_PCT[p]}% tak off`,
      ),
      ...(total
        ? [
            tr(
              l,
              `${inr(total)}/year incl. GST`,
              `${inr(total)}/साल GST सहित`,
              `${inr(total)}/saal GST ke saath`,
            ),
          ]
        : []),
    ].join(" · ");
    return { id: planRowId(p), title: PLAN_LABEL[p], description: desc.slice(0, 72) };
  });
  // client, 21 Nov: "View Plan Features" under View Plans (a list has one button, so it is the last row)
  rows.push({
    id: BILL_IDS.features,
    title: tr(l, "View Plan Features", "प्लान की सुविधाएँ देखें", "Plan features dekhein"),
    description: tr(
      l,
      "What each plan includes",
      "हर प्लान में क्या शामिल है",
      "Har plan mein kya shaamil hai",
    ),
  });
  return {
    kind: "list",
    body: tr(
      l,
      "Choose the Oxxy plan you would like to activate. Tap a plan to see its price, GST and the next step.",
      "जिस Oxxy प्लान को आप एक्टिवेट करना चाहते हैं उसे चुनें। कीमत, GST और अगला कदम देखने के लिए प्लान पर टैप करें।",
      "Jo Oxxy plan aap activate karna chahte hain use chunein. Price, GST aur next step dekhne ke liye plan par tap karein.",
    ),
    buttonLabel: tr(l, "View plans", "प्लान देखें", "Plans dekhein"),
    rows,
  };
}

/**
 * "View Plan Features" (client, 21 Nov): what each of the four plans includes (Playbook 7 plan descriptions,
 * Helper/PlanReplies PLAN_DETAILS), then [Choose a Plan] (the plans list again) and [Main Menu].
 */
export function planFeaturesCard(l?: Lg): OutboundMessage {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const blocks = PLAN_ORDER.map((p) =>
    [
      `*${PLAN_LABEL[p]}*: ${tr(l, `up to ${PLAN_PCT[p]}% off`, `${PLAN_PCT[p]}% तक छूट`, `${PLAN_PCT[p]}% tak off`)}`,
      cap(say(PLAN_DETAILS[p], l)),
    ].join("\n"),
  );
  const body = [
    tr(l, "*Oxxy Plan Features*", "*Oxxy प्लान की सुविधाएँ*", "*Oxxy Plan Features*"),
    ...blocks,
  ].join("\n\n");
  return {
    kind: "buttons",
    body: body.slice(0, 1024),
    buttons: [
      { id: BILL_IDS.activate, title: tr(l, "Choose a Plan", "प्लान चुनें", "Plan chunein") },
      { id: BILL_IDS.menu, title: tr(l, "Main Menu", "मुख्य मेनू", "Main Menu") },
    ],
  };
}

/**
 * The plan the customer picked from the list: discount, yearly and monthly price with GST (pricing document 9),
 * the plan page, and the same buttons as the flow's plan card, so the existing close step (pending
 * flow:close:0) handles Activate Yearly / Activate Monthly / Add Family Member.
 */
export function pickedPlanCard(
  plan: PlanName,
  price: { yearly: number | null; monthly: number | null },
  l?: Lg,
): OutboundMessage {
  const block = (label: string, cost: number) => [label, ...firstPlanLines(cost, l)];
  const lines = [
    tr(
      l,
      `${PLAN_LABEL[plan]}: up to ${PLAN_PCT[plan]}% off eligible medical bills.`,
      `${PLAN_LABEL[plan]}: योग्य मेडिकल बिल पर ${PLAN_PCT[plan]}% तक छूट।`,
      `${PLAN_LABEL[plan]}: eligible medical bills par ${PLAN_PCT[plan]}% tak discount.`,
    ),
    "",
    ...(price.yearly ? block(tr(l, "*Yearly*", "*सालाना*", "*Yearly*"), price.yearly) : []),
    ...(price.yearly && price.monthly ? [""] : []),
    ...(price.monthly ? block(tr(l, "*Monthly*", "*मासिक*", "*Monthly*"), price.monthly) : []),
    "",
    tr(
      l,
      `Plan details: ${PLAN_DETAILS_URL[plan]}`,
      `प्लान विवरण: ${PLAN_DETAILS_URL[plan]}`,
      `Plan details: ${PLAN_DETAILS_URL[plan]}`,
    ),
    "",
    tr(
      l,
      "Would you like to activate it?",
      "क्या आप इसे एक्टिवेट करना चाहेंगे?",
      "Kya aap ise activate karna chahenge?",
    ),
  ];
  return {
    kind: "buttons",
    header: { type: "text", text: PLAN_LABEL[plan] },
    body: lines.join("\n"),
    buttons: [
      {
        id: "act_yearly",
        title: tr(l, "Activate Yearly", "सालाना एक्टिवेट करें", "Yearly Activate"),
      },
      {
        id: "act_monthly",
        title: tr(l, "Activate Monthly", "मासिक एक्टिवेट करें", "Monthly Activate"),
      },
      { id: "flow_family", title: tr(l, "Add Family Member", "परिवार जोड़ें", "Family jodein") },
    ],
  };
}
