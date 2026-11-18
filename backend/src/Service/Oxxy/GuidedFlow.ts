// The voice-aligned button flow (client, 17 Nov 2026: "first message like our current bot", "as per the voice bot
// call flow", "a chat bot flow where the customer can select buttons"). Pure texts, readers and calculations;
// the pipeline (handleGuidedFlow) stores the answers and moves the step.
//
// Order (client, 17 Nov: "this flow, as in our current bot, then the existing flow after it"):
//   the client's bot, card for card: welcome card -> who -> (health-data notice) -> service -> verify card
//   (Customer Testimonial / News Articles) + calculator card (Calculate Now) -> yearly spend list -> savings card;
//   then ours: age -> city -> appointment offer for a visit -> one plan with price + GST -> activate / add family.
//   Known answers are skipped. No condition and no insurance question (client, 17 Nov).
// Prices come from plan_catalog; GST and the family discount follow the client's pricing document
// (first plan full price, each additional member 30% off the plan cost, GST 18% on the discounted cost).
import { InteractiveHeader, ListRow, OutboundMessage, ReplyButton } from "@Helper/WhatsappMessage";
import { OXXY_LINKS, VERIFY_CARD_TEXT, WELCOME_CARD_TEXT } from "@Helper/TemplateDefinitions";
import { say } from "@Helper/Lang";
import { familyTotal, firstPlan, firstPlanLines, per, subsequentPlan, subsequentPlanLines } from "@Helper/PlanPricing";

type Lg = string | null | undefined;
/** en / hi / hinglish (Hindi and Hinglish are drafts for a native-speaker review, like the other texts) */
const tr = (l: Lg, en: string, hi: string, hinglish: string) => say({ en, hi, hinglish }, l);

export type FlowStep =
  | "start"
  | "savings"
  | "who"
  | "when"
  | "need"
  // the calculator card's "Calculate Now", then the yearly spend list (the client's bot)
  | "calc"
  | "condition"
  | "age"
  | "city"
  | "insurance"
  | "spend"
  | "close"
  | "family"
  // "Yearly or monthly?" for the family breakdown (pricing document 13: plan -> billing -> first / subsequent)
  | "fambill"
  // "Shall I book the appointment?" (client, 17 Nov: hospital, date and time were never asked)
  | "book"
  // medicines: "Shall I check home delivery?" (Trigger K)
  | "med";
export const FLOW_PREFIX = "flow:";
/** pending_action while the health-data notice waits, before the service question */
export const FLOW_AFTER_CONSENT = "after_consent:flow";

export const flowStep = (pending: string | null | undefined): FlowStep | null =>
  pending?.startsWith(FLOW_PREFIX) ? (pending.slice(FLOW_PREFIX.length).split(":")[0] as FlowStep) : null;
/** the family members added at the close step ("flow:close:2" -> 2) */
export const flowFamily = (pending: string | null | undefined): number =>
  Number((pending ?? "").split(":")[2] ?? 0) || 0;

const title = (l: Lg): { type: "text"; text: string } => ({
  type: "text",
  text: tr(l, "Get in Touch with Oxxy To Reduce Your Medical Expenses", "मेडिकल खर्च कम करने के लिए Oxxy से जुड़ें", "Medical kharch kam karne ke liye Oxxy se judein"),
});

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

export const contactText = (l?: Lg): string => {
  const phone = process.env.OXXY_SUPPORT_PHONE || "8800855340";
  const mail = process.env.OXXY_SUPPORT_EMAIL || "info@oxxy.in";
  return tr(
    l,
    `You can reach Oxxy on ${phone} or ${mail}. I can also help you right here.`,
    `आप Oxxy से ${phone} या ${mail} पर संपर्क कर सकते हैं। मैं यहीं भी आपकी मदद कर सकता हूँ।`,
    `Aap Oxxy se ${phone} ya ${mail} par sampark kar sakte hain. Main yahin bhi aapki madad kar sakta hoon.`,
  );
};

export function advisorContactCard(l?: Lg): OutboundMessage {
  const phone = process.env.OXXY_SUPPORT_PHONE || "8800855340";
  const mail = process.env.OXXY_SUPPORT_EMAIL || "info@oxxy.in";
  return {
    kind: "buttons",
    header: { type: "text", text: tr(l, "Oxxy Health Advisor", "Oxxy स्वास्थ्य सलाहकार", "Oxxy Health Advisor") },
    body: tr(
      l,
      `Our health advisors are ready to assist you:\n\n📞 Call/WhatsApp: ${phone}\n✉️ Email: ${mail}\n⏰ Hours: 9 AM – 7 PM (Mon–Sat)\n\nAn advisor has also been notified and will reach out to you shortly for guidance, plan options, and hospital assistance.`,
      `हमारे स्वास्थ्य सलाहकार आपकी सहायता के लिए तैयार हैं:\n\n📞 कॉल/WhatsApp: ${phone}\n✉️ ईमेल: ${mail}\n⏰ समय: सुबह 9 बजे से शाम 7 बजे (सोम-शनि)\n\nसलाहकार को सूचित कर दिया गया है और वे मार्गदर्शन, प्लान और अस्पताल सहायता के लिए शीघ्र ही आपसे संपर्क करेंगे।`,
      `Hamare health advisors aapki help ke liye ready hain:\n\n📞 Call/WhatsApp: ${phone}\n✉️ Email: ${mail}\n⏰ Timing: 9 AM – 7 PM (Mon–Sat)\n\nAdvisor ko notify kar diya gaya hai aur woh guidance, plan aur hospital assistance ke liye jaldi hi aapse contact karenge.`,
    ),
    buttons: [
      { id: "flow_menu", title: tr(l, "Main Menu", "मुख्य मेनू", "Main Menu") },
      { id: "flow_start", title: tr(l, "Explore Plans", "प्लान देखें", "Explore Plans") },
    ],
  };
}

export const verifyCard = (): OutboundMessage => ({
  kind: "buttons",
  header: logoHeader(),
  body: VERIFY_CARD_TEXT,
  footer: "Oxxy Healthcare",
  buttons: [
    { id: "verify_stories", title: "Customer Testimonial" },
    { id: "verify_news", title: "News Articles" },
  ],
});

/** "Customer Testimonial" / "News Articles" tapped on the verify card: the page with one link button */
export const proofLinkCard = (which: "stories" | "news"): OutboundMessage => ({
  kind: "cta_url",
  header: { type: "text", text: which === "stories" ? "Customer Testimonials" : "News Articles" },
  body:
    which === "stories"
      ? "Read what Oxxy customers say about their savings and support."
      : "Read what the news has written about Oxxy.",
  buttonText: which === "stories" ? "Customer Testimonial" : "News Articles",
  url: which === "stories" ? OXXY_LINKS.stories : OXXY_LINKS.media,
});

/** The client's calculator card after the verify card: "Calculator / See how much you can save" + Calculate Now */
export const calculatorCard = (l?: Lg): OutboundMessage => ({
  kind: "buttons",
  // the logo when it is set (the body already says "Calculator": no text title over it)
  ...(logoHeader() ? { header: logoHeader() } : {}),
  body: tr(l, "Calculator\nSee how much you can save", "कैलकुलेटर\nदेखें आप कितना बचा सकते हैं", "Calculator\nDekhiye aap kitna bacha sakte hain"),
  buttons: [{ id: "calc_start", title: tr(l, "Calculate Now", "अभी गणना करें", "Calculate Now") }],
});

export const termsCard = (l?: Lg): OutboundMessage => ({
  kind: "cta_url",
  body: tr(
    l,
    "Please view all our terms and conditions before proceeding with your Oxxy care plan.",
    "Oxxy केयर प्लान से आगे बढ़ने से पहले कृपया हमारी सभी नियम और शर्तें देखें।",
    "Oxxy care plan se aage badhne se pehle kripya hamari sabhi terms and conditions dekhein.",
  ),
  buttonText: tr(l, "Terms & Conditions", "नियम और शर्तें", "Terms & Conditions"),
  url: OXXY_LINKS.policies,
});

const list = (
  body: string,
  buttonLabel: string,
  rows: ListRow[],
  footer: string | undefined,
  header?: { type: "text"; text: string },
): OutboundMessage => ({
  kind: "list",
  ...(header ? { header } : {}),
  body,
  buttonLabel,
  rows,
  ...(footer ? { footer } : {}),
});

export const SAVINGS_ROWS = (l?: Lg): ListRow[] => [
  { id: "sav_consult", title: tr(l, "Consultations", "डॉक्टर परामर्श (Consultations)", "Consultations") },
  { id: "sav_tests", title: tr(l, "Tests", "जाँच व टेस्ट (Tests)", "Tests") },
  { id: "sav_surgery", title: tr(l, "Surgery", "सर्जरी व उपचार (Surgery)", "Surgery") },
  { id: "sav_family", title: tr(l, "Family", "पूरा परिवार (Family)", "Family") },
  { id: "sav_exploring", title: tr(l, "Exploring", "विकल्प देख रहे हैं (Exploring)", "Exploring") },
];

export const WHO_ROWS_V2 = (l?: Lg): ListRow[] => [
  { id: "who_self", title: tr(l, "Self", "खुद (Self)", "Self") },
  { id: "who_parents", title: tr(l, "Parents", "माता-पिता (Parents)", "Parents") },
  { id: "who_family", title: tr(l, "Family", "पूरा परिवार (Family)", "Family") },
  { id: "who_other", title: tr(l, "Someone else", "कोई और (Someone else)", "Someone else") },
];

export const WHEN_BUTTONS = (l?: Lg): ReplyButton[] => [
  { id: "when_soon", title: tr(l, "Soon", "जल्द ही", "Soon") },
  { id: "when_month", title: tr(l, "This month", "इस महीने", "This month") },
  { id: "when_future", title: tr(l, "Future protection", "भविष्य सुरक्षा", "Future protection") },
];

export const WHO_ROWS = (l?: Lg): ListRow[] => [
  { id: "who_self", title: tr(l, "For Self/Spouse", "खुद / जीवनसाथी", "Khud / Spouse") },
  { id: "who_parent", title: tr(l, "Father/Mother", "पिता / माता", "Papa / Mummy") },
  { id: "who_parents", title: tr(l, "Parents", "माता-पिता दोनों", "Parents") },
  { id: "who_family", title: tr(l, "For Entire Family", "पूरा परिवार", "Poora Parivaar") },
  { id: "who_child", title: tr(l, "Daughter/Son", "बेटी / बेटा", "Beti / Beta") },
];
export const NEED_ROWS = (l?: Lg): ListRow[] => [
  { id: "need_consult", title: tr(l, "Doctor Consultations", "डॉक्टर परामर्श", "Doctor Consultation") },
  { id: "need_medicines", title: tr(l, "Medicines", "दवाइयाँ", "Dawaiyan") },
  { id: "need_pathlab", title: tr(l, "Pathlab", "लैब जाँच", "Pathlab") },
  { id: "need_diagnostic", title: tr(l, "Diagnostic Center", "डायग्नोस्टिक सेंटर", "Diagnostic Center") },
  { id: "need_hospital", title: tr(l, "Hospital/Clinics", "अस्पताल / क्लिनिक", "Hospital / Clinic") },
  { id: "need_future", title: tr(l, "Reduce Medical Expenses", "मेडिकल खर्च कम करें", "Kharch kam karein") },
  { id: "need_all", title: tr(l, "All Of The Above", "ऊपर के सभी", "Upar ke sabhi") },
];
export const CONDITION_ROWS = (l?: Lg): ListRow[] => [
  { id: "cond_none", title: tr(l, "No condition", "कोई बीमारी नहीं", "Koi bimari nahi") },
  { id: "cond_sugar", title: tr(l, "Diabetes / BP / Thyroid", "शुगर / BP / थायरॉइड", "Sugar / BP / Thyroid") },
  { id: "cond_heart", title: tr(l, "Heart condition", "हृदय रोग", "Heart ki bimari") },
  { id: "cond_kidney", title: tr(l, "Kidney / Liver", "किडनी / लिवर", "Kidney / Liver") },
  { id: "cond_cancer", title: tr(l, "Cancer", "कैंसर", "Cancer") },
  { id: "cond_bone", title: tr(l, "Bone / Joint", "हड्डी / जोड़", "Haddi / Jod") },
  { id: "cond_other", title: tr(l, "Other condition", "कोई और बीमारी", "Koi aur bimari") },
];
export const AGE_ROWS = (l?: Lg): ListRow[] => [
  { id: "age_35", title: tr(l, "Below 40", "40 से कम", "40 se kam") },
  { id: "age_50", title: tr(l, "40 – 60", "40 – 60", "40 – 60") },
  { id: "age_65", title: tr(l, "61 – 70", "61 – 70", "61 – 70") },
  { id: "age_73", title: tr(l, "71 – 75", "71 – 75", "71 – 75") },
  { id: "age_78", title: tr(l, "76 – 80", "76 – 80", "76 – 80") },
  { id: "age_85", title: tr(l, "Above 80", "80 से ज़्यादा", "80 se zyada") },
];
// The client's ranges (Voice manual 20: "use the lower end for a conservative illustration"); below 5,000 counts as 4,000.
const SPEND: [number, string][] = [
  [4000, "Below 5000"],
  [10000, "10,000-20,000"],
  [20000, "20,000-30,000"],
  [30000, "30,000-50,000"],
  [50000, "50,000-1,00,000"],
  [100000, "1,00,000-5,00,000"],
  [500000, "5,00,000-10,00,000"],
  [1000000, "Above 10,00,000"],
];
export const SPEND_ROWS = (l?: Lg): ListRow[] =>
  SPEND.map(([v, title]) => ({
    id: `spend_${v}`,
    title,
  }));

export function stepMessage(step: FlowStep, prefix?: string, l?: Lg): OutboundMessage {
  const p = (t: string) => (prefix ? `${prefix}\n\n${t}` : t);
  switch (step) {
    case "savings":
      return list(
        p(tr(l, "What medical savings are you looking for?", "आप किस तरह की मेडिकल बचत देख रहे हैं?", "What medical savings are you looking for?")),
        tr(l, "Select Option", "विकल्प चुनें", "Select Option"),
        SAVINGS_ROWS(l),
        undefined,
        title(l),
      );
    case "who":
      return list(
        p(tr(l, "Who needs the plan?", "प्लान किसके लिए चाहिए?", "Who needs the plan?")),
        tr(l, "Select Member", "सदस्य चुनें", "Select Member"),
        WHO_ROWS_V2(l),
        undefined,
        title(l),
      );
    case "when":
      return {
        kind: "buttons",
        header: title(l),
        body: p(tr(l, "When do you expect to use it?", "आप इसे कब इस्तेमाल करने की उम्मीद करते हैं?", "When do you expect to use it?")),
        buttons: WHEN_BUTTONS(l),
      };
    case "need":
      return list(
        p(
          tr(
            l,
            "Regarding what are you looking for medical service?",
            "आप किस मेडिकल सेवा के बारे में देख रहे हैं?",
            "Aap kis medical service ke baare mein dekh rahe hain?",
          ),
        ),
        tr(l, "Choose the option:", "विकल्प चुनें:", "Option chunein:"),
        NEED_ROWS(l),
        undefined,
        title(l),
      );
    case "calc":
      return calculatorCard(l);
    case "condition":
      return list(
        p(tr(l, "Is there an ongoing or pre-existing condition we should consider?", "क्या कोई चल रही या पहले से मौजूद बीमारी है जिसे हमें ध्यान में रखना चाहिए?", "Kya koi chal rahi ya pehle se maujood bimari hai jise humein dhyaan mein rakhna chahiye?")),
        tr(l, "Choose one", "एक चुनें", "Ek chunein"),
        CONDITION_ROWS(l),
        tr(l, "Share only what you are comfortable with", "उतना ही बताइए जितना आप सहज हों", "Utna hi bataiye jitna aap comfortable hon"),
      );
    case "age":
      return list(
        p(tr(l, "May I know the patient's age? If several family members need care, the age of the oldest.", "क्या मैं मरीज़ की उम्र जान सकता हूँ? अगर परिवार के कई लोगों को देखभाल चाहिए, तो सबसे बड़े सदस्य की उम्र।", "Kya main patient ki age jaan sakta hoon? Agar family ke kai logon ko care chahiye, to sabse bade member ki age.")),
        tr(l, "Choose age", "उम्र चुनें", "Age chunein"),
        AGE_ROWS(l),
        undefined,
      );
    case "city":
      return {
        kind: "location_request",
        body: p(tr(l, "Which city and locality is the patient in? Type it, or share the location with the button below.", "मरीज़ किस शहर और इलाके में हैं? लिखिए, या नीचे दिए बटन से लोकेशन भेजिए।", "Patient kis city aur locality mein hain? Likhiye, ya neeche diye button se location bhejiye.")),
      };
    case "insurance":
      return {
        kind: "buttons",
        body: p(tr(l, "Do you currently have health insurance?", "क्या आपके पास अभी हेल्थ इंश्योरेंस है?", "Kya aapke paas abhi health insurance hai?")),
        buttons: [
          { id: "ins_yes", title: tr(l, "Yes", "हाँ", "Haan") },
          { id: "ins_no", title: tr(l, "No", "नहीं", "Nahi") },
          { id: "ins_corp", title: tr(l, "Through Employer", "कंपनी की तरफ़ से", "Company se") },
        ],
      };
    case "spend":
      return list(
        p(
          tr(
            l,
            "May I know the yearly medical expenditure to calculate the approximate savings?",
            "अनुमानित बचत निकालने के लिए क्या मैं आपका सालाना मेडिकल खर्च जान सकता हूँ?",
            "Approximate bachat nikalne ke liye kya main aapka saalana medical kharch jaan sakta hoon?",
          ),
        ),
        tr(l, "Calculate Now", "अभी गणना करें", "Calculate Now"),
        SPEND_ROWS(l),
        undefined,
        { type: "text", text: tr(l, "Calculator See how much you can save", "कैलकुलेटर: देखें आप कितना बचा सकते हैं", "Calculator: Dekhiye aap kitna bacha sakte hain") },
      );
    case "book":
      return bookOffer(l);
    case "med":
      return medOffer(l);
    default:
      return welcomeCard();
  }
}

// ---------- reading the answers (a tap sends the id; typed words work too) ----------

const t = (s: string) => (s || "").toLowerCase().trim();

export type SavingsNeed = "consult" | "tests" | "surgery" | "family" | "exploring";
export function readSavingsNeed(text: string): SavingsNeed | null {
  const s = t(text);
  const id = s.match(/^(?:sav|need)_(consult|tests|test|pathlab|diagnostic|medicines|surgery|family|exploring|future|all)$/);
  if (id) {
    const k = id[1];
    if (k === "consult" || k === "medicines") return "consult";
    if (k === "tests" || k === "test" || k === "pathlab" || k === "diagnostic") return "tests";
    if (k === "surgery") return "surgery";
    if (k === "family") return "family";
    return "exploring";
  }
  if (/\b(surgery|operation|treatment|procedure|hospital|admission)\b/i.test(s)) return "surgery";
  if (/\b(test|tests|lab|scan|mri|ct|blood|pathlab|diagnostic)\b/i.test(s)) return "tests";
  if (/\b(consult\w*|doctor|opd|checkup|medicine|medicines)\b/i.test(s)) return "consult";
  if (/\b(family|entire family|family protection)\b/i.test(s)) return "family";
  if (/\b(explor\w*|future|savings?|reduce|general|just exploring|no need)\b/i.test(s)) return "exploring";
  return null;
}

export type WhenUrgency = "soon" | "month" | "future";
export function readWhen(text: string): WhenUrgency | null {
  const s = t(text);
  const id = s.match(/^when_(soon|month|future)$/);
  if (id) return id[1] as WhenUrgency;
  if (/\b(soon|immediately|urgent|right now|next week|jaldi|udane)\b/i.test(s)) return "soon";
  if (/\b(this month|month|in a month|few weeks|is mahine|intha maasam)\b/i.test(s)) return "month";
  if (/\b(future|future protection|protection|later|prevention|aage ke liye|ethirkalam)\b/i.test(s)) return "future";
  return null;
}

export type Who = "self" | "parent" | "parents" | "family" | "child" | "other";
export function readWho(text: string): Who | null {
  const s = t(text);
  const id = s.match(/^who_(self|parent|parents|family|child|other)$/);
  if (id) return (id[1] === "other" ? "other" : id[1]) as Who;
  if (/\b(self|myself|me|spouse|wife|husband|for me)\b/.test(s)) return "self";
  if (/\bparents\b|amma appa|maa papa/.test(s)) return "parents";
  if (/\b(father|mother|dad|mom|mum|amma|appa|papa|maa)\b/.test(s)) return "parent";
  if (/\b(family|everyone|all of us|whole)\b/.test(s)) return "family";
  if (/\b(son|daughter|child|children|kid|kids)\b/.test(s)) return "child";
  if (/\b(someone else|other|relative|friend)\b/.test(s)) return "other";
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
export const gstOn = (cost: number) => firstPlan(cost).gst;
/** Pricing document 10 (Helper/PlanPricing): first plan cost + GST; each additional member cost × 70% + GST on that */
export function familyPrice(cost: number, extra: number) {
  const first = firstPlan(cost);
  const s = subsequentPlan(cost);
  const next = { cost: s.cost, discount: s.discount, gst: s.gst, total: s.total };
  return { first, next, extra, total: familyTotal(cost, extra) };
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
  savings?: SavingsNeed | null;
  when?: WhenUrgency | null;
}

export function pickPlan(f: FlowFacts): PlanName {
  const who = f.who;
  const need = f.need;
  const age = Number(f.age) || 0;
  const spend = Number(f.spend) || 0;
  const isParent = who === "parent" || who === "parents";
  const elderlyParent = isParent && age >= 60;
  const isSurgery = f.savings === "surgery" || need === "surgery";

  // Infinity: above other plans' ages, elderly parents, major condition, surgery, pregnancy, high spend, or parents + soon
  if (
    age > 80 ||
    elderlyParent ||
    (isParent && f.when === "soon") ||
    ["heart", "kidney", "cancer"].includes(String(f.condition)) ||
    isSurgery ||
    need === "pregnancy" ||
    spend >= 200000
  )
    return "infinity";

  if (isParent) return "thrive";
  if (f.savings === "family" || who === "family") return "thrive";
  if (f.when === "soon") return "vital";
  if (age <= 70 && (f.savings === "consult" || f.savings === "tests" || f.savings === "exploring") && f.when === "future") {
    return "everyday";
  }

  // another pre-existing condition: Thrive supports new and pre-existing needs (Voice manual 21)
  if (f.condition && f.condition !== "none") return age > 80 ? "infinity" : "thrive";
  // hospital care: Vital covers OPD and IPD
  if (need === "hospital" || need === "all") return age <= 75 ? "vital" : age <= 80 ? "thrive" : "infinity";
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
const PLAN_WHY_T: Record<PlanName, [string, string, string]> = {
  everyday: [
    "it suits routine consultations, tests and medicines, with eligible bills up to ₹10 lakh and savings of up to 20%",
    "यह नियमित परामर्श, जाँच और दवाइयों के लिए उपयुक्त है, ₹10 लाख तक के बिल और 20% तक की बचत के साथ",
    "yeh routine consultation, tests aur dawaiyon ke liye sahi hai, ₹10 lakh tak ke bills aur 20% tak ki bachat ke saath",
  ],
  vital: [
    "it supports OPD and hospitalisation (IPD), with eligible bills up to ₹20 lakh and savings of up to 25%",
    "यह OPD और अस्पताल में भर्ती (IPD) दोनों में मदद करता है, ₹20 लाख तक के बिल और 25% तक की बचत के साथ",
    "yeh OPD aur hospitalisation (IPD) dono mein madad karta hai, ₹20 lakh tak ke bills aur 25% tak ki bachat ke saath",
  ],
  thrive: [
    "it supports new and pre-existing conditions, with eligible bills up to ₹30 lakh and savings of up to 30%",
    "यह नई और पहले से मौजूद बीमारियों में मदद करता है, ₹30 लाख तक के बिल और 30% तक की बचत के साथ",
    "yeh nayi aur pehle se maujood bimariyon mein madad karta hai, ₹30 lakh tak ke bills aur 30% tak ki bachat ke saath",
  ],
  infinity: [
    "it has no age limit and no upper eligible bill limit, supports new and pre-existing needs, OPD and IPD, and offers savings of up to 40%",
    "इसमें कोई आयु सीमा नहीं और बिल की कोई ऊपरी सीमा नहीं है, यह नई और पुरानी बीमारियों, OPD और IPD में मदद करता है, और 40% तक की बचत देता है",
    "ismein koi age limit nahi aur bill ki koi upper limit nahi hai, yeh nayi aur purani bimariyon, OPD aur IPD mein madad karta hai, aur 40% tak ki bachat deta hai",
  ],
};
export const PLAN_WHY: Record<PlanName, string> = Object.fromEntries(
  Object.entries(PLAN_WHY_T).map(([k, v]) => [k, v[0]]),
) as Record<PlanName, string>;
const planWhy = (plan: PlanName, l: Lg) => tr(l, ...PLAN_WHY_T[plan]);

/** One line that connects the customer's own answers to the plan (Voice manual 7 / 21 value bridges) */
export function valueBridge(f: FlowFacts, l?: Lg): string {
  if (f.savings === "surgery" || f.need === "surgery")
    return tr(l, "A planned surgery or treatment can create a large bill, so broader support helps.", "सर्जरी या उपचार के लिए व्यापक अस्पताल सहायता और उच्च कवर की आवश्यकता होती है।", "Planned surgery ya ilaaj ka bill bada ho sakta hai, isliye broader support kaam aata hai.");
  if (f.who === "parent" || f.who === "parents")
    return tr(l, "Since this is for your parents, the plan should not run into age or bill limits later.", "क्योंकि यह आपके माता-पिता के लिए है, प्लान में आगे चलकर उम्र या बिल की सीमा आड़े नहीं आनी चाहिए।", "Kyunki yeh aapke parents ke liye hai, plan mein aage chalkar age ya bill ki limit beech mein nahi aani chahiye.");
  if (f.savings === "family" || f.who === "family")
    return tr(l, "For family healthcare, the plan covers consultations, tests, and hospitalization for everyone.", "पारिवारिक देखभाल के लिए, यह प्लान सभी के लिए परामर्श, जाँच और अस्पताल में भर्ती को कवर करता है।", "Family care ke liye, yeh plan sabhi ke liye consultation, tests aur hospital coverage provide karta hai.");
  if (f.when === "soon")
    return tr(l, "Because you need care soon, activation is swift and covers immediate healthcare needs.", "चूँकि आपको जल्द ही देखभाल की ज़रूरत है, एक्टिवेशन त्वरित है और तत्काल ज़रूरतों को पूरा करता है।", "Kyunki aapko jaldi care chahiye, activation fast hai aur immediate medical needs ko cover karta hai.");
  if (f.condition && f.condition !== "none")
    return tr(l, `Because you mentioned ${CONDITION_LABEL[f.condition]}, support for pre-existing needs matters most.`, "क्योंकि आपने एक चल रही बीमारी बताई है, पहले से मौजूद बीमारियों में मदद सबसे ज़रूरी है।", "Kyunki aapne ek chal rahi bimari batayi hai, pehle se maujood bimariyon mein madad sabse zaroori hai.");
  if (f.need === "pregnancy")
    return tr(l, "Pregnancy and IVF care are included under Infinity.", "प्रेग्नेंसी और IVF की देखभाल Infinity में शामिल है।", "Pregnancy aur IVF care Infinity mein shaamil hai.");
  if (f.insurance === "has_insurance" || f.insurance === "corporate_insurance")
    return tr(l, "Your insurance remains valuable; Oxxy works alongside it for OPD, exclusions, waiting periods and co-payments.", "आपका इंश्योरेंस ज़रूरी है; Oxxy उसके साथ OPD, बाहर रखे गए खर्च, वेटिंग पीरियड और को-पेमेंट में मदद करता है।", "Aapka insurance zaroori hai; Oxxy uske saath OPD, exclusions, waiting period aur co-payment mein madad karta hai.");
  return tr(l, "Oxxy can be used again and again during the plan, for routine care as well as larger needs, with no medical screening to activate.", "Oxxy को प्लान के दौरान बार-बार इस्तेमाल किया जा सकता है, नियमित और बड़ी दोनों ज़रूरतों के लिए, और एक्टिवेशन के लिए कोई मेडिकल जाँच नहीं।", "Oxxy ko plan ke dauraan baar-baar use kiya ja sakta hai, routine aur badi dono zaroorton ke liye, aur activation ke liye koi medical screening nahi.");
}

export interface PlanPrice {
  monthly: number | null;
  yearly: number | null;
}

/** The savings card: "You mentioned … Oxxy can help you save up to ₹X" + the website calculator */
export function savingsCard(spend: number, l?: Lg): OutboundMessage {
  // Voice manual 20 (the client's approved message): 30%, rounded down to ₹500; the plan price is not subtracted
  // unless the customer asks (KB Q093 explains why the illustration uses 30% when a plan's maximum is lower)
  const save = roundedSaving(spend);
  const body =
    save >= 500
      ? tr(
          l,
          `You mentioned a yearly medical expense of about ${inr(spend)}. Oxxy can help you save up to ${inr(save)}. The actual saving depends on the services and providers used.`,
          `आपने लगभग ${inr(spend)} का सालाना मेडिकल खर्च बताया। Oxxy आपको ${inr(save)} तक बचाने में मदद कर सकता है। असल बचत सेवाओं और प्रदाताओं पर निर्भर करती है।`,
          `Aapne lagbhag ${inr(spend)} ka saalana medical kharch bataya. Oxxy aapko ${inr(save)} tak bachane mein madad kar sakta hai. Asli bachat services aur providers par depend karti hai.`,
        )
      : tr(
          l,
          `You mentioned a yearly medical expense of about ${inr(spend)}. At this level the savings figure would be small, so I will suggest the plan by your healthcare need.`,
          `आपने लगभग ${inr(spend)} का सालाना मेडिकल खर्च बताया। इस स्तर पर बचत की रकम छोटी होगी, इसलिए मैं आपकी ज़रूरत के हिसाब से प्लान सुझाऊँगा।`,
          `Aapne lagbhag ${inr(spend)} ka saalana medical kharch bataya. Is level par bachat ki raqam chhoti hogi, isliye main aapki zaroorat ke hisaab se plan suggest karunga.`,
        );
  return {
    kind: "cta_url",
    ...(logoHeader() ? { header: logoHeader() } : {}),
    body: `${tr(l, "Calculator\nSee how much you can save", "कैलकुलेटर\nदेखें आप कितना बचा सकते हैं", "Calculator\nDekhiye aap kitna bacha sakte hain")}\n\n${body}`,
    buttonText: tr(l, "Calculate Now", "अभी गणना करें", "Calculate Now"),
    url: OXXY_LINKS.calculator,
  };
}

/** Pricing document 9: "Yearly" / Plan cost / + GST / = Final payable a year */
const priceBlock = (label: string, cost: number, billing: "yearly" | "monthly", l?: Lg): string[] => {
  const lines = firstPlanLines(cost, l);
  lines[lines.length - 1] += ` ${per(billing, l)}`;
  return [label, ...lines];
};
const yearlyLabel = (l: Lg) => tr(l, "Yearly", "सालाना", "Saalana");
const monthlyLabel = (l: Lg) => tr(l, "Monthly", "मासिक", "Monthly");
export const PLAN_DETAILS_URL: Record<PlanName, string> = {
  everyday: "https://www.oxxy.in/oxxy-everyday",
  vital: "https://www.oxxy.in/oxxy-vital",
  thrive: "https://www.oxxy.in/oxxy-thrive",
  infinity: "https://www.oxxy.in/oxxy-infinity",
};
export const PLAN_ACTIVATION_URL: Record<PlanName, string> = {
  everyday: "https://www.oxxy.in/healthplan?plan_name=oxxy_everyday",
  vital: "https://www.oxxy.in/healthplan?plan_name=oxxy_vital",
  thrive: "https://www.oxxy.in/healthplan?plan_name=oxxy_thrive",
  infinity: "https://www.oxxy.in/healthplan?plan_name=oxxy_infinity",
};

const activateButtons = (l: Lg) => [
  { id: "act_yearly", title: tr(l, "Activate Yearly", "सालाना एक्टिवेट करें", "Yearly Activate") },
  { id: "act_monthly", title: tr(l, "Activate Monthly", "मासिक एक्टिवेट करें", "Monthly Activate") },
];

/** The plan with its price and GST (pricing document 9), and the next step as buttons */
export function planCard(plan: PlanName, price: PlanPrice, f: FlowFacts, l?: Lg): OutboundMessage {
  const checkoutUrl = PLAN_ACTIVATION_URL[plan] || `https://www.oxxy.in/healthplan?plan_name=oxxy_${plan}`;
  const planUrl = PLAN_DETAILS_URL[plan] || `https://www.oxxy.in/oxxy-${plan}`;
  const lines = [
    valueBridge(f, l),
    tr(
      l,
      `Based on what you shared, the Oxxy ${PLAN_TITLE[plan]} plan fits best because ${planWhy(plan, l)}.`,
      `आपने जो बताया उसके आधार पर Oxxy ${PLAN_TITLE[plan]} प्लान सबसे उपयुक्त है, क्योंकि ${planWhy(plan, l)}।`,
      `Aapne jo bataya uske hisaab se Oxxy ${PLAN_TITLE[plan]} plan sabse sahi hai, kyunki ${planWhy(plan, l)}.`,
    ),
    "",
    ...(price.yearly ? priceBlock(yearlyLabel(l), price.yearly, "yearly", l) : []),
    ...(price.yearly && price.monthly ? [""] : []),
    ...(price.monthly ? priceBlock(monthlyLabel(l), price.monthly, "monthly", l) : []),
    "",
    tr(l, `Official Checkout Link: ${checkoutUrl}`, `आधिकारिक चेकआउट लिंक: ${checkoutUrl}`, `Official Checkout Link: ${checkoutUrl}`),
    tr(l, `Plan details: ${planUrl}`, `प्लान विवरण: ${planUrl}`, `Plan details: ${planUrl}`),
    "",
    tr(
      l,
      "PURCHASE CONFIRMED:\nWelcome kit → Activation in 3–5 working days → Usage guidance",
      "खरीद पुष्टि:\nवेलकम किट → 3–5 कार्यदिवसों में एक्टिवेशन → उपयोग मार्गदर्शन",
      "PURCHASE CONFIRMED:\nWelcome kit → Activation 3–5 working days mein → Usage guidance",
    ),
    "",
    tr(l, "Would you like to activate your Oxxy care plan?", "क्या आप अपना Oxxy केयर प्लान एक्टिवेट करना चाहेंगे?", "Kya aap apna Oxxy care plan activate karna chahenge?"),
  ];
  return {
    kind: "buttons",
    header: { type: "text", text: `Oxxy ${PLAN_TITLE[plan]} ${tr(l, "plan", "प्लान", "plan")}` },
    body: lines.join("\n"),
    buttons: [
      ...activateButtons(l),
      { id: "flow_advisor", title: tr(l, "Talk to Advisor", "सलाहकार से बात करें", "Talk to Advisor") },
    ],
  };
}

export const familyQuestion = (plan: PlanName, l?: Lg): OutboundMessage => ({
  kind: "buttons",
  body: tr(
    l,
    `How many more family members would you like to add to the ${PLAN_TITLE[plan]} plan? The first plan is at full price and each additional member gets 30% off the plan cost.`,
    `${PLAN_TITLE[plan]} प्लान में परिवार के और कितने सदस्य जोड़ना चाहेंगे? पहला प्लान पूरी कीमत पर है और हर अतिरिक्त सदस्य को प्लान की कीमत पर 30% छूट मिलती है।`,
    `${PLAN_TITLE[plan]} plan mein family ke aur kitne members jodna chahenge? Pehla plan poori keemat par hai aur har extra member ko plan ki keemat par 30% off milta hai.`,
  ),
  buttons: [
    { id: "fam_1", title: tr(l, "1 more", "1 और", "1 aur") },
    { id: "fam_2", title: tr(l, "2 more", "2 और", "2 aur") },
    { id: "fam_3", title: tr(l, "3 more", "3 और", "3 aur") },
  ],
});

export function readFamily(text: string): number | null {
  const s = t(text);
  const id = s.match(/^fam_([1-9])$/);
  if (id) return Number(id[1]);
  const n = s.match(/^(\d)\b/);
  return n && Number(n[1]) >= 1 && Number(n[1]) <= 9 ? Number(n[1]) : null;
}

/** Pricing document 13: the billing first ("yearly or monthly?"), then the breakdown for that billing */
export const familyBillingQuestion = (plan: PlanName, extra: number, l?: Lg): OutboundMessage => ({
  kind: "buttons",
  body: tr(
    l,
    `Oxxy ${PLAN_TITLE[plan]} for ${extra + 1} members: would you like the yearly or the monthly price?`,
    `${extra + 1} सदस्यों के लिए Oxxy ${PLAN_TITLE[plan]}: आप सालाना कीमत देखना चाहेंगे या मासिक?`,
    `${extra + 1} members ke liye Oxxy ${PLAN_TITLE[plan]}: aap yearly price dekhna chahenge ya monthly?`,
  ),
  buttons: [
    { id: "famb_yearly", title: tr(l, "Yearly", "सालाना", "Yearly") },
    { id: "famb_monthly", title: tr(l, "Monthly", "मासिक", "Monthly") },
  ],
});

export function readFamilyBilling(text: string): "yearly" | "monthly" | null {
  const s = t(text);
  if (/^famb_yearly$|\b(year|yearly|annual|annually|saal|saalana)\b|सालाना|वार्षिक/.test(s)) return "yearly";
  if (/^famb_monthly$|\b(month|monthly|mahina|mahine)\b|मासिक/.test(s)) return "monthly";
  return null;
}

/** Pricing document 9 for a family: member 1 at full price, each additional member 30% off, then the total */
export function familyLines(plan: PlanName, cost: number, extra: number, billing: "yearly" | "monthly", l?: Lg): string[] {
  const n = extra + 1;
  return [
    tr(l, `Oxxy ${PLAN_TITLE[plan]} for ${n} members (${billing})`, `${n} सदस्यों के लिए Oxxy ${PLAN_TITLE[plan]} (${billing === "yearly" ? "सालाना" : "मासिक"})`, `${n} members ke liye Oxxy ${PLAN_TITLE[plan]} (${billing})`),
    "",
    tr(l, "Member 1 (first plan)", "सदस्य 1 (पहला प्लान)", "Member 1 (pehla plan)"),
    ...firstPlanLines(cost, l),
    "",
    tr(
      l,
      `Each additional member (${extra})`,
      `हर अतिरिक्त सदस्य (${extra})`,
      `Har extra member (${extra})`,
    ),
    ...subsequentPlanLines(cost, l),
    "",
    tr(
      l,
      `Total for ${n} members: ${inr(familyTotal(cost, extra))} ${per(billing, l)}`,
      `${n} सदस्यों का कुल: ${inr(familyTotal(cost, extra))} ${per(billing, l)}`,
      `${n} members ka total: ${inr(familyTotal(cost, extra))} ${per(billing, l)}`,
    ),
  ];
}

export function familyCard(plan: PlanName, price: PlanPrice, extra: number, l?: Lg, billing: "yearly" | "monthly" = "yearly"): OutboundMessage {
  const cost = (billing === "monthly" ? price.monthly : price.yearly) ?? price.yearly ?? price.monthly ?? 0;
  const out = [
    ...familyLines(plan, cost, extra, billing, l),
    "",
    tr(l, "Would you like to activate it?", "क्या आप इसे एक्टिवेट करना चाहेंगे?", "Kya aap ise activate karna chahenge?"),
  ];
  return {
    kind: "buttons",
    body: out.join("\n"),
    buttons: [
      { id: billing === "monthly" ? "act_monthly" : "act_yearly", title: tr(l, "Activate", "एक्टिवेट करें", "Activate") },
      { id: "flow_family", title: tr(l, "Change members", "सदस्य बदलें", "Members badlein") },
      { id: "flow_menu", title: tr(l, "Main Menu", "मुख्य मेनू", "Main Menu") },
    ],
  };
}

/** Needs that are a visit somewhere: the appointment (hospital, date, time) is offered for them */
export const BOOKABLE_NEEDS = new Set(["consult", "pathlab", "diagnostic", "hospital", "surgery", "pregnancy", "all"]);

/** The appointment offer: the hospital and the visit's date and time, never confused with the team's call */
export const bookOffer = (l?: Lg): OutboundMessage => ({
  kind: "buttons",
  body: tr(
    l,
    "Would you like me to book the appointment too? I will ask the hospital or centre you prefer and the date and time of the visit. (This is separate from any call from the Oxxy team.)",
    "क्या मैं अपॉइंटमेंट भी बुक कर दूँ? मैं आपका पसंदीदा अस्पताल या सेंटर और विज़िट की तारीख और समय पूछूँगा। (यह Oxxy टीम की कॉल से अलग है।)",
    "Kya main appointment bhi book kar doon? Main aapka pasandida hospital ya centre aur visit ki date aur time poochunga. (Yeh Oxxy team ki call se alag hai.)",
  ),
  buttons: [
    { id: "book_yes", title: tr(l, "Book appointment", "अपॉइंटमेंट बुक करें", "Appointment book") },
    { id: "book_no", title: tr(l, "Not now", "अभी नहीं", "Abhi nahi") },
  ],
});

/** Medicines (Trigger K): home delivery with savings, checked by the team before anything is confirmed */
export const medOffer = (l?: Lg): OutboundMessage => ({
  kind: "buttons",
  body: tr(
    l,
    "Oxxy may provide savings on almost all medicines, with home delivery at no additional charge, subject to service availability. Shall I check home delivery for your medicines?",
    "Oxxy लगभग सभी दवाइयों पर बचत दे सकता है, बिना अतिरिक्त शुल्क के होम डिलीवरी के साथ, सेवा उपलब्धता के अनुसार। क्या मैं आपकी दवाइयों की होम डिलीवरी जाँच दूँ?",
    "Oxxy lagbhag sabhi medicines par bachat de sakta hai, bina extra charge ke home delivery ke saath, service availability ke hisaab se. Kya main aapki dawaiyon ki home delivery check karun?",
  ),
  buttons: [
    { id: "med_yes", title: tr(l, "Check delivery", "डिलीवरी जाँचें", "Delivery check") },
    { id: "med_no", title: tr(l, "Not now", "अभी नहीं", "Abhi nahi") },
  ],
});

export function readMedAnswer(text: string): "yes" | "no" | null {
  const s = t(text);
  if (/^med_yes$|^(yes|yeah|ok|okay|sure|haan|ha|check|check delivery|aama|seri)[.!]*$/.test(s)) return "yes";
  if (/^med_no$|^(no|not now|later|skip|nahi|abhi nahi|vendam|illa)[.!]*$/.test(s)) return "no";
  return null;
}

export function readBookAnswer(text: string): "yes" | "no" | null {
  const s = t(text);
  if (/^book_yes$|^(yes|yeah|yep|ok|okay|sure|haan|ha|book|book it|book appointment|aama|seri)[.!]*$/.test(s)) return "yes";
  if (/^book_no$|^(no|nope|not now|later|skip|nahi|nahin|abhi nahi|vendam|illa)[.!]*$/.test(s)) return "no";
  return null;
}

// ---------- acknowledgements (client, 17 Nov: "acknowledge every answer before the next question") ----------

/** The answer said back in a short, user-friendly line */
export function ackLine(
  kind: "who" | "need" | "savings" | "when" | "calc" | "age" | "city" | "spend" | "book_yes" | "book_no" | "family" | "billing" | "activate",
  value: string | number | null,
  l?: Lg,
): string {
  const v = value == null ? "" : String(value);
  switch (kind) {
    case "savings": {
      const S: Record<string, [string, string, string]> = {
        consult: ["Got it, doctor consultations savings.", "समझ गए, डॉक्टर परामर्श में बचत।", "Got it, doctor consultation savings."],
        tests: ["Got it, diagnostic tests and lab savings.", "समझ गए, जाँच और लैब टेस्ट में बचत।", "Got it, diagnostic tests aur lab savings."],
        surgery: ["Noted, savings on surgery and hospital treatment.", "नोट किया, सर्जरी और अस्पताल के इलाज में बचत।", "Noted, surgery aur hospital treatment par savings."],
        family: ["Got it, savings for family healthcare.", "समझ गए, पूरे परिवार के स्वास्थ्य खर्च में बचत।", "Got it, family healthcare par savings."],
        exploring: ["Understood, exploring medical savings with Oxxy.", "समझ गए, Oxxy के साथ मेडिकल बचत के विकल्प देख रहे हैं।", "Understood, Oxxy ke saath medical savings explore kar rahe hain."],
      };
      const s = S[v] ?? ["Got it, noted your healthcare savings preference.", "नोट कर लिया गया है।", "Got it, noted your preference."];
      return tr(l, s[0], s[1], s[2]);
    }
    case "when": {
      const T: Record<string, [string, string, string]> = {
        soon: ["Noted, you're planning to use this soon.", "नोट किया, आप इसे जल्द ही इस्तेमाल करने की योजना बना रहे हैं।", "Noted, aap ise jaldi use karne ki plan kar rahe hain."],
        month: ["Noted, planning to use this within this month.", "नोट किया, इस महीने में इस्तेमाल करने की योजना है।", "Noted, is mahine use karne ka plan hai."],
        future: ["Understood, setting up future healthcare protection.", "समझ गए, भविष्य की स्वास्थ्य सुरक्षा की तैयारी।", "Understood, future healthcare protection plan kar rahe hain."],
      };
      const t = T[v] ?? ["Noted your expected timeline.", "नोट कर लिया गया है।", "Noted your expected timeline."];
      return tr(l, t[0], t[1], t[2]);
    }
    case "who": {
      const W: Record<string, [string, string, string]> = {
        self: ["Got it, this is for you.", "ठीक है, यह आपके लिए है।", "Theek hai, yeh aapke liye hai."],
        parent: ["Got it, this is for your father or mother.", "ठीक है, यह आपके पिता या माता के लिए है।", "Theek hai, yeh aapke papa ya mummy ke liye hai."],
        parents: ["Got it, this is for your parents.", "ठीक है, यह आपके माता-पिता के लिए है।", "Theek hai, yeh aapke parents ke liye hai."],
        family: ["Got it, this is for your entire family.", "ठीक है, यह आपके पूरे परिवार के लिए है।", "Theek hai, yeh aapki poori family ke liye hai."],
        child: ["Got it, this is for your son or daughter.", "ठीक है, यह आपके बेटे या बेटी के लिए है।", "Theek hai, yeh aapke bete ya beti ke liye hai."],
        other: ["Got it, this is for someone else.", "ठीक है, यह किसी और के लिए है।", "Theek hai, yeh kisi aur ke liye hai."],
      };
      const w = W[v] ?? W.self;
      return tr(l, w[0], w[1], w[2]);
    }
    case "need":
      return tr(l, `Noted: ${v}.`, `नोट किया: ${v}।`, `Noted: ${v}.`);
    case "calc":
      return tr(l, "Sure, let us work out your savings.", "ज़रूर, आपकी बचत का अंदाज़ा लगाते हैं।", "Zaroor, aapki bachat ka andaaza lagate hain.");
    case "age":
      return tr(l, `Thank you, noted the age (${v}).`, `धन्यवाद, उम्र नोट कर ली (${v})।`, `Shukriya, age note kar li (${v}).`);
    case "city":
      return tr(l, `Thank you, noted the area: ${v}.`, `धन्यवाद, इलाका नोट कर लिया: ${v}।`, `Shukriya, area note kar liya: ${v}.`);
    case "spend":
      return tr(l, `Noted, yearly spend: ${v}.`, `नोट किया, सालाना खर्च: ${v}।`, `Noted, yearly spend: ${v}.`);
    case "book_yes":
      return tr(l, "Sure, let us book it.", "ज़रूर, बुक करते हैं।", "Zaroor, book karte hain.");
    case "book_no":
      return tr(l, "No problem, I can book the appointment any time later.", "कोई बात नहीं, अपॉइंटमेंट बाद में कभी भी बुक हो सकता है।", "Koi baat nahi, appointment baad mein kabhi bhi book ho sakta hai.");
    case "family":
      return tr(l, `Noted, ${v} more member${v === "1" ? "" : "s"}.`, `नोट किया, ${v} और सदस्य।`, `Noted, ${v} aur member.`);
    case "billing":
      return tr(l, `Noted: the ${v} price.`, `नोट किया: ${v === "monthly" ? "मासिक" : "सालाना"} कीमत।`, `Noted: ${v} price.`);
    case "activate":
      return tr(l, `Great choice: the ${v} plan.`, `बढ़िया: ${v === "monthly" ? "मासिक" : "सालाना"} प्लान।`, `Badhiya: ${v} plan.`);
  }
}

/** The spend label formatted from SPEND rows or currency */
export function spendLabel(spend: number): string {
  const row = SPEND.find(([v]) => v === spend);
  return row ? row[1] : inr(spend);
}

/** The acknowledgement on top of the next message (a card keeps its buttons; the body gets the line first) */
export function withAck(msg: OutboundMessage, ack: string | null | undefined): OutboundMessage {
  if (!ack) return msg;
  if ("body" in msg && typeof (msg as { body?: unknown }).body === "string" && msg.kind !== "location")
    return { ...msg, body: `${ack}\n\n${(msg as { body: string }).body}` } as OutboundMessage;
  return msg;
}

/** The age said back: the tapped range's title, else "62 years" */
export function ageLabel(text: string, age: number, l?: Lg): string {
  const row = AGE_ROWS(l).find((r) => r.id === t(text));
  return row ? row.title : tr(l, `${age} years`, `${age} वर्ष`, `${age} saal`);
}

export const asksMainMenu = (text: string) => /^(flow_menu|main menu|menu|start again|restart)\s*[.!]?$/i.test((text || "").trim());
