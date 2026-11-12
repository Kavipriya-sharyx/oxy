import { ConversationState } from "@Helper/Enum/ConversationState";
import { ListRow } from "@Helper/WhatsappMessage";
import type { ReplyLanguage } from "@Helper/FixedReplies";

// The welcome + 4-row opening list (plan 12.2: INTENT_MENU). Every text below is a DRAFT: [CONFIRM] =
// Oxxy must approve it. WhatsApp limits: row title 24 characters, list button 20 characters.
// No prices, no links, no health question here (the health-data notice and consent come first).

export const MENU_BUTTON: Record<ReplyLanguage, string> = {
  en: "Choose an option", // [CONFIRM]
  hi: "विकल्प चुनें", // [CONFIRM]
  hinglish: "Option chunein", // [CONFIRM]
};

export const WELCOME: Record<ReplyLanguage, string> = {
  en: "Welcome to Oxxy! What would you like to do?", // [CONFIRM]
  hi: "Oxxy में आपका स्वागत है! आप क्या करना चाहेंगे?", // [CONFIRM]
  hinglish: "Oxxy mein aapka swagat hai! Aap kya karna chahenge?", // [CONFIRM]
};

export interface MenuRow {
  id: string;
  state: ConversationState; // where this row goes
  title: Record<ReplyLanguage, string>; // max 24 characters each
  // the fixed reply after the row is picked
  reply: Record<ReplyLanguage, string>;
}

export const MENU_ROWS: MenuRow[] = [
  {
    id: "menu_need",
    state: ConversationState.NeedDiscovery,
    title: { en: "Find the right plan", hi: "सही प्लान चुनें", hinglish: "Sahi plan chunein" }, // [CONFIRM]
    reply: {
      // [CONFIRM]
      en: "Happy to help you find the right plan. Who is it for: you, a family member, or someone else?",
      hi: "सही प्लान चुनने में मदद करके खुशी होगी। यह किसके लिए है: आपके लिए, परिवार के किसी सदस्य के लिए, या किसी और के लिए?",
      hinglish:
        "Sahi plan chunne mein madad karke khushi hogi. Yeh kiske liye hai: aapke liye, parivar ke kisi member ke liye, ya kisi aur ke liye?",
    },
  },
  {
    id: "menu_explain",
    state: ConversationState.OxxyExplain,
    title: { en: "What is Oxxy?", hi: "Oxxy क्या है?", hinglish: "Oxxy kya hai?" }, // [CONFIRM]
    reply: {
      // [CONFIRM]
      en: "Oxxy is a membership that helps you plan and manage everyday healthcare costs. What would you like to know about it?",
      hi: "Oxxy एक मेंबरशिप है जो रोज़मर्रा की स्वास्थ्य सेवाओं के खर्च की योजना बनाने और उन्हें संभालने में मदद करती है। आप इसके बारे में क्या जानना चाहेंगे?",
      hinglish:
        "Oxxy ek membership hai jo rozmarra ki healthcare ke kharche plan karne aur sambhalne mein madad karti hai. Aap ismein kya jaanna chahenge?",
    },
  },
  {
    id: "menu_service",
    state: ConversationState.ServiceOrEscalation,
    title: { en: "Help with my account", hi: "मेरे अकाउंट में मदद", hinglish: "Mere account mein madad" }, // [CONFIRM]
    reply: {
      // [CONFIRM]
      en: "Sure. Please tell me what you need help with, and I will connect you with our team if needed.",
      hi: "ज़रूर। कृपया बताइए कि आपको किस चीज़ में मदद चाहिए, और ज़रूरत पड़ने पर मैं आपको हमारी टीम से जोड़ दूँगा।",
      hinglish:
        "Zaroor. Kripya bataiye ki aapko kis cheez mein madad chahiye, aur zaroorat padne par main aapko hamari team se jod dunga.",
    },
  },
  {
    id: "menu_followup",
    state: ConversationState.FollowUpTime,
    title: { en: "Talk to me later", hi: "मुझसे बाद में बात करें", hinglish: "Baad mein baat karein" }, // [CONFIRM]
    reply: {
      // [CONFIRM]
      en: "No problem. When should we get back to you? Please share a day and time, for example tomorrow 5 pm.",
      hi: "कोई बात नहीं। हम आपसे कब संपर्क करें? कृपया दिन और समय बताइए, जैसे कल शाम 5 बजे।",
      hinglish:
        "Koi baat nahi. Hum aapse kab sampark karein? Kripya din aur samay bataiye, jaise kal shaam 5 baje.",
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
  return (
    MENU_ROWS.find((r) => Object.values(r.title).some((title) => clean(title) === t)) ?? null
  );
}

export const menuReply = (row: MenuRow, language?: string | null): string => row.reply[lang(language)];
