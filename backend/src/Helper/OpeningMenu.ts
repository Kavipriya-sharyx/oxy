import { ConversationState } from "@Helper/Enum/ConversationState";
import { ListRow } from "@Helper/WhatsappMessage";
import type { ReplyLanguage } from "@Helper/FixedReplies";

// The welcome + 4-row opening list (Playbook 4.2, plan 12.2: INTENT_MENU). WhatsApp limits: row title 24
// characters, list button 20 characters. No prices, no links, no health question here: the health-data
// notice comes after the customer picks a row, before the first health question (Playbook 16.3).

export const MENU_BUTTON: Record<ReplyLanguage, string> = {
  en: "Choose an option", // [CONFIRM]
  hi: "विकल्प चुनें", // [CONFIRM]
  hinglish: "Option chunein", // [CONFIRM]
};

// Playbook 4.2 (approved English). Hindi / Hinglish are drafts [CONFIRM].
export const WELCOME: Record<ReplyLanguage, string> = {
  en:
    "Hello! Welcome to Oxxy Health. I can help with medical-bill savings, healthcare-centre options, booking " +
    "requests and plan activation. What would you like help with today?",
  hi:
    "नमस्ते! Oxxy Health में आपका स्वागत है। मैं मेडिकल बिल की बचत, हेल्थकेयर सेंटर के विकल्प, बुकिंग रिक्वेस्ट और प्लान " +
    "एक्टिवेशन में मदद कर सकता हूँ। आज मैं आपकी किस चीज़ में मदद करूँ?",
  hinglish:
    "Namaste! Oxxy Health mein aapka swagat hai. Main medical-bill savings, healthcare-centre options, booking " +
    "requests aur plan activation mein madad kar sakta hoon. Aaj aapko kis cheez mein madad chahiye?",
};

export interface MenuRow {
  id: string;
  state: ConversationState; // where this row goes
  title: Record<ReplyLanguage, string>; // max 24 characters each
  // the fixed reply after the row is picked
  reply: Record<ReplyLanguage, string>;
}

// Playbook 4.2: the four rows and where each goes (state machine, section 3)
export const MENU_ROWS: MenuRow[] = [
  {
    id: "menu_need",
    state: ConversationState.NeedDiscovery,
    title: {
      en: "Reduce a medical bill",
      hi: "मेडिकल बिल कम करें",
      hinglish: "Medical bill kam karein",
    },
    // NEED_DISCOVERY: what service is needed and when, then discovery from question 2 (Playbook 3, 5)
    reply: {
      en: "Happy to help. What consultation, test, medicine, treatment or surgery is needed, and when?",
      hi: "ज़रूर मदद करूँगा। कौन सा कंसल्टेशन, टेस्ट, दवा, इलाज या सर्जरी चाहिए, और कब?",
      hinglish:
        "Zaroor madad karunga. Kaunsa consultation, test, medicine, treatment ya surgery chahiye, aur kab?",
    },
  },
  {
    id: "menu_centre",
    state: ConversationState.CentreSearch,
    title: {
      en: "Find or book a centre",
      hi: "सेंटर ढूँढें या बुक करें",
      hinglish: "Centre dhoondhein/book",
    },
    // CENTRE_SEARCH: location first (Playbook 5 question 4, 10.1)
    reply: {
      en: "Certainly. Which city and locality does the patient live in?",
      hi: "ज़रूर। मरीज़ किस शहर और इलाके में रहते हैं?",
      hinglish: "Zaroor. Patient kis city aur locality mein rehte hain?",
    },
  },
  {
    id: "menu_explain",
    state: ConversationState.OxxyExplain,
    title: { en: "Understand Oxxy", hi: "Oxxy को समझें", hinglish: "Oxxy ko samjhein" },
    // OXXY_EXPLAIN: the 7.1 one-line explanation, then back to discovery
    reply: {
      en:
        "Oxxy is your lifelong healthcare savings and support partner. It helps you avoid overpaying eligible " +
        "private-healthcare bills when you contact Oxxy before taking the service. What type of expense do you need help with?",
      hi:
        "Oxxy आपका जीवनभर का हेल्थकेयर सेविंग्स और सपोर्ट पार्टनर है। सेवा लेने से पहले Oxxy से संपर्क करने पर यह योग्य " +
        "प्राइवेट हेल्थकेयर बिलों पर ज़्यादा भुगतान से बचाने में मदद करता है। आपको किस तरह के खर्च में मदद चाहिए?",
      hinglish:
        "Oxxy aapka lifelong healthcare savings aur support partner hai. Service lene se pehle Oxxy se contact karne par " +
        "yeh eligible private-healthcare bills par zyada payment se bachane mein madad karta hai. Aapko kis tarah ke kharche mein madad chahiye?",
    },
  },
  {
    id: "menu_service",
    state: ConversationState.ServiceOrEscalation,
    title: {
      en: "Existing customer help",
      hi: "मौजूदा ग्राहक सहायता",
      hinglish: "Existing customer help",
    },
    // SERVICE_OR_ESCALATION: the pipeline looks the customer up and answers (or escalates); this is the fallback
    reply: {
      en: "Sure. Please tell me what you need help with.",
      hi: "ज़रूर। कृपया बताइए कि आपको किस चीज़ में मदद चाहिए।",
      hinglish: "Zaroor. Kripya bataiye ki aapko kis cheez mein madad chahiye.",
    },
  },
];

const lang = (l?: string | null): ReplyLanguage => (l === "hi" || l === "hinglish" ? l : "en");

// The WhatsApp list message. `prefix` goes before the welcome (e.g. "Thank you, your consent is saved.")
export function openingList(language?: string | null, prefix?: string) {
  const l = lang(language);
  const rows: ListRow[] = MENU_ROWS.map((r) => ({ id: r.id, title: r.title[l] }));
  return {
    kind: "list" as const,
    body: prefix ? `${prefix} ${WELCOME[l]}` : WELCOME[l],
    buttonLabel: MENU_BUTTON[l],
    rows,
  };
}

const clean = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// Which row did the customer pick? The row id (what WhatsApp sends for a tap), or the row title in
// any language typed back, or the row number 1-4. Anything else: null (normal conversation).
export function matchMenuRow(text: string): MenuRow | null {
  const raw = (text || "").trim().toLowerCase();
  const byId = MENU_ROWS.find((r) => r.id === raw);
  if (byId) return byId;
  const t = clean(text);
  if (!t) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= MENU_ROWS.length) return MENU_ROWS[n - 1];
  return MENU_ROWS.find((r) => Object.values(r.title).some((title) => clean(title) === t)) ?? null;
}

export const menuReply = (row: MenuRow, language?: string | null): string =>
  row.reply[lang(language)];

// The lead_intro wording as a normal message, for StartConversation inside the 24-hour window (the
// customer wrote recently, so no template is needed). Same three buttons. {name} = first name. [CONFIRM]
export const LEAD_INTRO_TEXT: Record<ReplyLanguage, string> = {
  en: "Hello {name} ji, thank you for speaking with us. I am Oxxy Health's automated assistant. May I ask one quick question to understand what you need?",
  hi: "नमस्ते {name} जी, हमसे बात करने के लिए धन्यवाद। मैं Oxxy Health की automated assistant हूँ। आपकी ज़रूरत समझने के लिए क्या मैं एक छोटा सा सवाल पूछ सकती हूँ?",
  hinglish:
    "Namaste {name} ji, humse baat karne ke liye dhanyavaad. Main Oxxy Health ki automated assistant hoon. Aapki zaroorat samajhne ke liye kya main ek chhota sa sawaal pooch sakti hoon?",
};

// ---- Playbook 4.1: the consented outbound lead (template "lead_intro" with three quick-reply buttons) ----
// The rows below are the three buttons. The tapped button arrives as its text.
export const LEAD_ROWS: MenuRow[] = [
  {
    id: "lead_yes",
    state: ConversationState.Discovery,
    title: { en: "Yes, please", hi: "हाँ, ज़रूर", hinglish: "Haan, zaroor" },
    // DISCOVERY from question 1 (Playbook 5)
    reply: {
      en: "Thank you. Is the healthcare need for you or someone in your family?",
      hi: "धन्यवाद। यह स्वास्थ्य ज़रूरत आपके लिए है या परिवार के किसी सदस्य के लिए?",
      hinglish: "Dhanyavaad. Yeh healthcare need aapke liye hai ya family mein kisi ke liye?",
    },
  },
  {
    id: "lead_details",
    state: ConversationState.IntentMenu,
    title: { en: "Just send details", hi: "बस जानकारी भेजें", hinglish: "Bas details bhejein" },
    // INTENT_MENU: the 4.5 priority question, then only the matching short summary
    reply: {
      en:
        "Certainly. To send only the relevant information, is your priority broader ongoing healthcare support or " +
        "one specific upcoming medical expense?",
      hi: "ज़रूर। सिर्फ़ ज़रूरी जानकारी भेजने के लिए बताइए, आपकी प्राथमिकता लगातार व्यापक हेल्थकेयर सहायता है या किसी एक आने वाले मेडिकल खर्च में मदद?",
      hinglish:
        "Zaroor. Sirf relevant information bhejne ke liye bataiye, aapki priority broader ongoing healthcare support hai " +
        "ya kisi ek upcoming medical expense mein help?",
    },
  },
  {
    id: "lead_not_now",
    state: ConversationState.FollowUpTime,
    title: { en: "Not now", hi: "अभी नहीं", hinglish: "Abhi nahi" },
    // FOLLOW_UP_TIME: ask for a convenient date and time
    reply: {
      en: "No problem. When would be a convenient day and time for a quick follow-up? For example, tomorrow 5 pm.",
      hi: "कोई बात नहीं। जल्दी फ़ॉलो-अप के लिए कौन सा दिन और समय ठीक रहेगा? जैसे, कल शाम 5 बजे।",
      hinglish:
        "Koi baat nahi. Quick follow-up ke liye kaunsa din aur samay theek rahega? Jaise, kal shaam 5 baje.",
    },
  },
];

/** Which lead button was tapped (its text in any language, or the id). null = something else. */
export function matchLeadRow(text: string): MenuRow | null {
  const raw = (text || "").trim().toLowerCase();
  const byId = LEAD_ROWS.find((r) => r.id === raw);
  if (byId) return byId;
  const t = clean(text);
  if (!t) return null;
  const extra: Record<string, string[]> = {
    lead_yes: ["yes", "yes please", "haan", "ha", "ok", "okay", "sure"],
    lead_details: ["send details", "details", "just details", "details bhejo"],
    lead_not_now: ["not now", "later", "baad mein", "abhi nahi", "abhi nahin"],
  };
  return (
    LEAD_ROWS.find(
      (r) =>
        Object.values(r.title).some((title) => clean(title) === t) ||
        (extra[r.id] ?? []).includes(t),
    ) ?? null
  );
}

// Playbook 4.5 "send only the matching short summary". [CONFIRM] wording.
export const LEAD_SUMMARY: Record<"ongoing" | "single", Record<ReplyLanguage, string>> = {
  ongoing: {
    en:
      "Oxxy is your lifelong healthcare savings and support partner. It helps you avoid overpaying eligible " +
      "private-healthcare bills when you contact Oxxy before taking the service. Would you like a plan suggestion, " +
      "nearby centre options or a booking request?",
    hi:
      "Oxxy आपका जीवनभर का हेल्थकेयर सेविंग्स और सपोर्ट पार्टनर है। सेवा लेने से पहले Oxxy से संपर्क करने पर यह योग्य प्राइवेट " +
      "हेल्थकेयर बिलों पर ज़्यादा भुगतान से बचाने में मदद करता है। क्या आप प्लान का सुझाव, पास के सेंटर या बुकिंग रिक्वेस्ट चाहेंगे?",
    hinglish:
      "Oxxy aapka lifelong healthcare savings aur support partner hai. Service lene se pehle Oxxy se contact karne par " +
      "yeh eligible private-healthcare bills par zyada payment se bachata hai. Kya aap plan suggestion, nearby centres ya booking request chahenge?",
  },
  single: {
    en:
      "Cut Medi Bills is Oxxy's quick medical-savings service for an upcoming consultation, test, medicine, treatment, " +
      "surgery or hospital service, when you contact Oxxy before booking, registering, starting treatment or paying at " +
      "the centre. Would you like me to check whether it can be used for your expense?",
    hi:
      "Cut Medi Bills, Oxxy की तेज़ मेडिकल-सेविंग्स सेवा है, आने वाले कंसल्टेशन, टेस्ट, दवा, इलाज, सर्जरी या अस्पताल सेवा के लिए, " +
      "जब आप सेंटर पर बुकिंग, रजिस्ट्रेशन, इलाज शुरू करने या भुगतान से पहले Oxxy से संपर्क करते हैं। क्या मैं देखूँ कि यह आपके खर्च पर लागू हो सकता है?",
    hinglish:
      "Cut Medi Bills Oxxy ki quick medical-savings service hai, kisi upcoming consultation, test, medicine, treatment, " +
      "surgery ya hospital service ke liye, jab aap centre par booking, registration, treatment ya payment se pehle Oxxy " +
      "se contact karte hain. Kya main check karun ki yeh aapke kharche par use ho sakta hai?",
  },
};

/** The answer to the 4.5 priority question. null = unclear. */
export function leadPriority(text: string): "ongoing" | "single" | null {
  const t = (text || "").toLowerCase();
  if (/\b(one|single|specific|upcoming|surgery|operation|procedure|ek|1)\b|एक/u.test(t))
    return "single";
  if (
    /\b(broad|broader|ongoing|regular|family|long[- ]?term|overall|general|2)\b|लगातार|परिवार/u.test(
      t,
    )
  )
    return "ongoing";
  return null;
}
