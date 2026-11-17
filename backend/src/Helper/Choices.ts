// Multiple-choice answers for the bot's questions (client request 16 Nov 2026: "more multiple choice options").
// Playbook 1.1: "Buttons may show mutually exclusive answers to that one question"; up to 3 reply buttons
// (titles <= 20 characters), 4 or more = one list message (<= 10 rows, titles <= 24, descriptions <= 72).
// The customer can still type anything. A tapped option sends its id as the message text, so every id is
// written the way the existing answer readers already understand it ("10 km", "about 17500 a year", "2" ...).
import { ListRow, OutboundMessage, ReplyButton } from "./WhatsappMessage";
import { validateMessage } from "@Service/Oxxy/WhatsappPayload";

type Opt = { id: string; en: string; hi?: string; desc?: string };
interface ChoiceSet {
  name: string;
  /** the question (the last sentence of the message) */
  when: RegExp;
  options: Opt[];
  /** list button label */
  label?: { en: string; hi: string };
}

const SETS: ChoiceSet[] = [
  {
    name: "beneficiary",
    when: /\b(for )?(you|yourself)\b[^?]{0,25}\bor\b[^?]{0,25}\b(a |your )?(family member|someone (else )?in your family|someone else|family)\b|\bwho is (this|the care|it) for\b|aapke liye ya (parivar|family)|आपके लिए या परिवार/i,
    options: [
      { id: "it is for me", en: "For myself", hi: "मेरे लिए" },
      { id: "it is for a family member", en: "Family member", hi: "परिवार के सदस्य" },
    ],
  },
  {
    name: "need_pattern",
    when: /\b(one )?(specific )?(upcoming )?(expense|surgery|procedure)\b[^?]{0,60}\bor\b[^?]{0,40}\bongoing\b|\bongoing\b[^?]{0,40}\bor\b[^?]{0,40}\b(one|single|specific)\b/i,
    options: [
      { id: "one specific upcoming expense", en: "One upcoming expense", hi: "एक आने वाला खर्च" },
      { id: "ongoing support for regular care", en: "Ongoing support", hi: "लगातार मदद" },
    ],
  },
  {
    name: "need_type",
    // (not the booking step "Which doctor specialisation, test or …": that one has its own list)
    when: /^(?!.*specialisation)(?=.*\b(what|which)\b[^?]{0,40}\b(consultation|test|medicine|treatment|surgery)s?\b[^?]*\?)/i,
    label: { en: "Choose one", hi: "चुनें" },
    options: [
      { id: "doctor consultation", en: "Doctor consultation", hi: "डॉक्टर से परामर्श" },
      { id: "tests or scans", en: "Tests / scans", hi: "जाँच / स्कैन" },
      { id: "medicines", en: "Medicines", hi: "दवाइयाँ" },
      { id: "treatment", en: "Treatment", hi: "इलाज" },
      { id: "surgery or procedure", en: "Surgery / procedure", hi: "सर्जरी / प्रक्रिया" },
    ],
  },
  {
    name: "yearly_spend",
    when: /\b(how much|roughly how much|approximately how much)\b[^?]{0,80}\b(spend|spends|spending|spent)\b[^?]{0,60}\b(year|yearly|annual)|\byearly (medical|healthcare) (spend|expenditure)\b|saal mein[^?]{0,40}kharch|साल में[^?]{0,40}खर्च/i,
    label: { en: "Choose a range", hi: "रेंज चुनें" },
    options: [
      { id: "about 7500 a year", en: "Below ₹10,000", hi: "₹10,000 से कम" },
      { id: "about 17500 a year", en: "₹10,000 – ₹25,000" },
      { id: "about 37500 a year", en: "₹25,000 – ₹50,000" },
      { id: "about 75000 a year", en: "₹50,000 – ₹1 lakh" },
      { id: "about 2 lakh a year", en: "₹1 – 3 lakh" },
      { id: "about 4 lakh a year", en: "₹3 – 5 lakh" },
      { id: "about 6 lakh a year", en: "Above ₹5 lakh", hi: "₹5 लाख से ज़्यादा" },
    ],
  },
  {
    name: "radius",
    when: /\bhow far can the patient travel\b|kitni door tak|कितनी दूर तक/i,
    options: [
      { id: "5 km", en: "Up to 5 km", hi: "5 km तक" },
      { id: "10 km", en: "Up to 10 km", hi: "10 km तक" },
      { id: "20 km", en: "Up to 20 km", hi: "20 km तक" },
    ],
  },
  {
    name: "insurance",
    when: /\b(do you|does the patient|does your family) have (any )?(health )?insurance\b|\binsurance\b[^?]{0,40}\bfor this\b[^?]*\?|bima hai|बीमा है/i,
    options: [
      { id: "yes, I have health insurance", en: "Yes, I have it", hi: "हाँ, है" },
      { id: "no, I do not have health insurance", en: "No insurance", hi: "नहीं है" },
    ],
  },
  {
    name: "specialisation",
    when: /\bwhich doctor specialisation\b|\bkaunsi doctor specialisation\b|कौन-सी डॉक्टर विशेषज्ञता/i,
    label: { en: "Choose one", hi: "चुनें" },
    options: [
      { id: "general physician", en: "General physician", hi: "सामान्य चिकित्सक" },
      { id: "cardiology", en: "Heart (cardiology)", hi: "हृदय रोग" },
      { id: "orthopaedics", en: "Bones (orthopaedics)", hi: "हड्डी रोग" },
      { id: "gynaecology", en: "Gynaecology", hi: "स्त्री रोग" },
      { id: "paediatrics", en: "Child (paediatrics)", hi: "बाल रोग" },
      { id: "dermatology", en: "Skin (dermatology)", hi: "त्वचा रोग" },
      { id: "ophthalmology", en: "Eye care", hi: "आँखें" },
      { id: "dental", en: "Dental", hi: "दाँत" },
      { id: "ent", en: "ENT", hi: "नाक-कान-गला" },
      { id: "diagnostic tests", en: "Tests / scans", hi: "जाँच / स्कैन" },
    ],
  },
  {
    name: "booking_time",
    when: /\bwhat time or time window would suit you\b|kaunsa time ya time window|कौन-सा समय या समय-सीमा/i,
    options: [
      { id: "morning (9 am to 12 pm)", en: "Morning", hi: "सुबह" },
      { id: "afternoon (12 pm to 4 pm)", en: "Afternoon", hi: "दोपहर" },
      { id: "evening (4 pm to 8 pm)", en: "Evening", hi: "शाम" },
    ],
  },
  {
    // Trigger M answers: a clear next step as buttons (client, 17 Nov)
    name: "details_or_later",
    when: /plan details, or should I follow up later\?\s*$|plan details chahenge, ya main baad mein follow-up karun\?\s*$|प्लान की जानकारी चाहेंगे, या मैं बाद में फ़ॉलो-अप करूँ\?\s*$/i,
    options: [
      { id: "please share the plan details", en: "Plan details", hi: "प्लान की जानकारी" },
      { id: "follow up later", en: "Follow up later", hi: "बाद में" },
    ],
  },
  {
    name: "monthly_or_later",
    when: /monthly option, or should I follow up later\?\s*$|monthly option chahenge, ya main baad mein follow-up karun\?\s*$|मासिक विकल्प चाहेंगे, या मैं बाद में फ़ॉलो-अप करूँ\?\s*$/i,
    options: [
      { id: "activate monthly", en: "Monthly plan", hi: "मासिक प्लान" },
      { id: "follow up later", en: "Follow up later", hi: "बाद में" },
    ],
  },
  {
    // the booking's centre question: a typed name, or one tap for centres near the patient
    name: "booking_centre",
    when: /Please share the centre and branch first\.?\s*$|centre aur branch bataiye\.?\s*$|केंद्र और शाखा बताइए।?\s*$/i,
    options: [{ id: "suggest a centre near me", en: "Suggest nearby", hi: "पास के सुझाएँ" }],
  },
  {
    name: "plan_next",
    when: /\b(official )?plan details or help activating it\b|\bplan details ya activate\b|आधिकारिक जानकारी चाहेंगे या इसे एक्टिवेट|\bofficial details or the secure activation link\b|official details chahenge ya secure activation link|आधिकारिक जानकारी चाहेंगे या सुरक्षित एक्टिवेशन लिंक/i,
    options: [
      { id: "please share the plan details", en: "Plan details", hi: "प्लान की जानकारी" },
      { id: "I want to activate", en: "Activate", hi: "एक्टिवेट करें" },
      { id: "not now", en: "Not now", hi: "अभी नहीं" },
    ],
  },
  {
    name: "plan_or_centre",
    when: /\bplan details or help finding a centre\b|plan details chahenge ya centre|प्लान की जानकारी चाहेंगे या केंद्र/i,
    options: [
      { id: "please share the plan details", en: "Plan details", hi: "प्लान की जानकारी" },
      { id: "help me find a centre", en: "Find a centre", hi: "केंद्र खोजें" },
    ],
  },
  {
    name: "would_you_like_plan_details",
    when: /\bwould you like the plan details\?\s*$|kya aap plan details chahenge\?\s*$/i,
    options: [
      { id: "yes", en: "Yes, details", hi: "हाँ" },
      { id: "no", en: "No, thanks", hi: "नहीं" },
    ],
  },
  {
    name: "benefit_or_price",
    when: /\bmain benefit or the price first\b|main benefit jaanna chahenge ya price|मुख्य फ़ायदा जानना चाहेंगे या कीमत/i,
    options: [
      { id: "tell me the main benefit", en: "Main benefit", hi: "मुख्य फ़ायदा" },
      { id: "what is the price", en: "Price", hi: "कीमत" },
    ],
  },
  {
    name: "cmb_billing",
    when: /\bwhich option would you prefer\?\s*$|aap kaunsa option chahenge\?\s*$|आप कौन-सा विकल्प चाहेंगे\?\s*$/i,
    options: [
      { id: "monthly", en: "Monthly", hi: "मासिक" },
      { id: "annual", en: "Annual", hi: "वार्षिक" },
    ],
  },
  {
    name: "trust_mix",
    when: /\btrust, price or whether you will use it\b/i,
    options: [
      { id: "my concern is trust", en: "Trust", hi: "भरोसा" },
      { id: "my concern is the price", en: "Price", hi: "कीमत" },
      { id: "not sure I will use it", en: "Will I use it?", hi: "इस्तेमाल" },
    ],
  },
];

const hindi = (t: string) => /[ऀ-ॿ]/.test(t);
const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join("") + "…");

/** A button title is 20 characters: "Tomorrow, 10 am-12 pm" (21) -> "Tomorrow 10am-12pm", not "Tomorrow, 10 am-12 …" */
const shortTime = (s: string) =>
  [...s].length <= 20 ? s : s.replace(/,\s*/, " ").replace(/\s+(am|pm)\b/gi, "$1");

/** The last sentence or line: where the question is */
function lastQuestion(text: string): string {
  const t = (text || "").trim();
  const lines = t.split(/\n+/);
  return lines[lines.length - 1] ?? "";
}

/** "1) Today, 10 am-12 pm" lines -> list rows "1", "2", "3" (callback windows) */
function numberedRows(text: string, re: RegExp): ListRow[] {
  const rows: ListRow[] = [];
  for (const line of text.split(/\n/)) {
    const m = line.trim().match(re);
    if (m) rows.push({ id: m[1], title: cut(m[2].trim(), 24), description: m[2].trim().length > 24 ? cut(m[2].trim(), 72) : undefined });
  }
  return rows;
}

/**
 * The interactive form of one bot message, or null when it has no known choice. The body stays the full text;
 * WhatsApp shows the options under it.
 */
export function interactiveFor(text: string): OutboundMessage | null {
  const m = build(text);
  if (!m) return null;
  try {
    validateMessage(m); // never a message WhatsApp would refuse: plain text instead
    return m;
  } catch {
    return null;
  }
}

function build(text: string): OutboundMessage | null {
  const body = (text || "").trim();
  if (!body || [...body].length > 1024) return null;
  const hi = hindi(body);

  // callback windows: "1) Today, 10 am-12 pm … Reply 1, 2 or 3"
  if (/Reply 1, 2 or 3|1, 2 या 3 लिखें|1, 2 ya 3 likhein/i.test(body)) {
    const rows = numberedRows(body, /^([1-9])\)\s+(.+)$/);
    if (rows.length >= 2)
      return rows.length <= 3
        ? { kind: "buttons", body, buttons: rows.map((r) => ({ id: r.id, title: cut(shortTime(r.title), 20) })) }
        : { kind: "list", body, buttonLabel: hi ? "समय चुनें" : "Choose a time", rows };
  }
  // the centre list: "1. NAME, BRANCH - AREA | type | about 3 km" … "Reply with 1 or 2". The names are shown
  // once, in the rows (client, 17 Nov: "it gives the hospital names in the text and again as options"): the
  // row title is the name, the description the branch, area, type and distance; the body keeps the lead-in
  // and the closing line. The chat history keeps the full text (`log`).
  if (/Reply with (1|1 or 2|1-\d)\b|(1|1 or 2|1-\d) (mein se|में से)/i.test(body)) {
    const CARD = /^([1-9])\.\s+(.+)$/;
    const rows: ListRow[] = [];
    for (const line of body.split(/\n/)) {
      const m = line.trim().match(CARD);
      if (!m) continue;
      const [place, ...rest] = m[2].split(/\s+\|\s+/);
      const at = place.search(/,\s|\s-\s/);
      const name = (at > 0 ? place.slice(0, at) : place).trim();
      const where = at > 0 ? place.slice(at).replace(/^,\s*|^\s-\s*/, "").trim() : "";
      // a name longer than the 24-character title is written in full in the description, when the area and
      // distance still fit next to it (they matter more)
      const plain = [where, ...rest].filter(Boolean).join(" | ");
      const withName = [name, plain].filter(Boolean).join(" | ");
      const desc = [...name].length > 24 && [...withName].length <= 72 ? withName : plain;
      rows.push({ id: m[1], title: cut(name, 24), description: desc ? cut(desc, 72) : undefined });
    }
    const short = body
      .split(/\n/)
      .filter((line) => !CARD.test(line.trim()))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (rows.length >= 1 && short)
      return {
        kind: "list",
        body: short,
        buttonLabel: hi ? "केंद्र चुनें" : "Choose a centre",
        rows,
        log: body,
      };
  }
  // booking date: "It can be from 19 Nov 2026 up to 16 May 2027." -> the next 7 dates from the earliest
  const dates = body.match(/from (\d{1,2} [A-Z][a-z]{2} \d{4}) up to (\d{1,2} [A-Z][a-z]{2} \d{4})\.?\s*$/);
  if (dates) {
    const start = new Date(`${dates[1]} 12:00 UTC`);
    if (!isNaN(start.getTime())) {
      const rows: ListRow[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getTime() + i * 86400000);
        const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
        const id = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        rows.push({ id, title: label });
      }
      rows.push({ id: "another date", title: "Another date", description: "Type the date you want" });
      return { kind: "list", body, buttonLabel: "Choose a date", rows };
    }
  }

  // Trigger N: "Would 18 Nov at 11 am or 18 Nov at 5 pm be better for a quick follow-up?" -> two buttons ("1" / "2")
  const fu =
    body.match(/Would (.+?) or (.+?) be better for a quick follow-up\?/) ??
    body.match(/Ek quick follow-up ke liye (.+?) ya (.+?) mein se kaunsa time better rahega\?/) ??
    body.match(/एक छोटे फ़ॉलो-अप के लिए (.+?) या (.+?) में से कौन-सा समय बेहतर रहेगा\?/u);
  if (fu)
    return {
      kind: "buttons",
      body,
      buttons: [
        { id: "1", title: cut(fu[1].trim(), 20) },
        { id: "2", title: cut(fu[2].trim(), 20) },
      ],
    };

  // a question that wants typed words (medicine names): no options under it
  if (/\btype the names\b|नाम लिखें|naam likhein/i.test(body)) return null;

  const q = lastQuestion(body);
  for (const set of SETS) {
    // the spend question followed by "An estimate is fine." still gets the ranges; a reply that only MENTIONS
    // the spend ("You mentioned a yearly healthcare spend of about ₹5,00,000 … Would you like the plan
    // details?") never does (client chat, 17 Nov: the ranges came back after the spend was already given)
    const spendAskedAbove =
      set.name === "yearly_spend" &&
      !/\?\s*$/.test(q) &&
      /\b(how much|roughly how much|approximately how much)\b[^?]{0,80}\b(spend|spends|spending|spent)\b|saal mein[^?]{0,40}kharch|साल में[^?]{0,40}खर्च/i.test(body.slice(-300));
    if (!set.when.test(q) && !spendAskedAbove) continue;
    const title = (o: Opt) => (hi && o.hi ? o.hi : o.en);
    if (set.options.length <= 3) {
      const buttons: ReplyButton[] = set.options.map((o) => ({ id: o.id, title: cut(title(o), 20) }));
      return { kind: "buttons", body, buttons };
    }
    const rows: ListRow[] = set.options.slice(0, 10).map((o) => ({ id: o.id, title: cut(title(o), 24), description: o.desc }));
    return { kind: "list", body, buttonLabel: hi ? set.label?.hi ?? "चुनें" : set.label?.en ?? "Choose one", rows };
  }
  return null;
}
