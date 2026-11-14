// Booking request capture (Playbook 11 / 11.1, Trigger layer G and H). One question per turn:
// centre (and branch) -> landmark when the centre is not in the directory -> specialisation -> date -> time.
// The draft lives in conversation.pending_action as `booking:<json>`; the specialisation (health data) is
// never put there: it stays in need.specialisation (encrypted).
import { bookingWindow, todayIST } from "./DateWindow.service";
import { L, lang, say } from "@Helper/Lang";

export interface BookingDraft {
  step: BookingStep;
  c?: string | null; // verified centre id
  cn?: string | null; // centre name as shown / as the customer wrote it
  u?: boolean; // the centre is NOT in the directory: the team checks it (never rejected, plan 12.4)
  l?: string | null; // area / landmark for an unknown centre
  ok?: boolean; // the customer accepted the booking offer (needed after picking from the list)
  d?: string | null; // preferred date YYYY-MM-DD
  t?: string | null; // preferred time or window
  ns?: boolean; // no specialisation question (health consent refused)
}

export type BookingStep = "offer" | "centre" | "landmark" | "specialisation" | "date" | "time";

const PREFIX = "booking:";

export function isBookingPending(pending: string | null | undefined): boolean {
  return !!pending?.startsWith(PREFIX);
}

export function readDraft(pending: string | null | undefined): BookingDraft | null {
  if (!isBookingPending(pending)) return null;
  try {
    const d = JSON.parse(pending!.slice(PREFIX.length));
    return d && typeof d === "object" ? (d as BookingDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(d: BookingDraft): string {
  return PREFIX + JSON.stringify(d);
}

// ---- the answer to "Please share the centre and branch": a name, or something else? ----

const SUGGEST_RE =
  /\b(suggest\w*|recommend\w*|your (choice|pick|wish|suggestion|recommendation)|you (choose|decide|pick|tell|select)|(any|some|which|what|best|good|nearest|nearby|closest) (one|centre|center|hospital|clinic|lab|place|option)s?|any ?(one|where|thing)|near ?by|near (me|my)|no idea|not sure|do ?n[o']?t know|dont know|no preference|up to you|as you (like|wish|say)|aap (hi )?(bata|suggest|batai)\w*|koi bhi|kuch bhi|pata nahi|nahi pata)\b|सुझा|बताइए|बता दीजिए|कोई भी|पता नहीं/i;

/** "No, give me your suggestion" / "any good hospital nearby" / "aap batao": the customer has no centre in mind */
export function asksForSuggestion(text: string): boolean {
  return SUGGEST_RE.test((text || "").replace(/[’`]/g, "'"));
}

/** The customer asked for a booking or an appointment in so many words */
export function asksToBook(text: string): boolean {
  return /\b(book\w*|appointment\w*|appoinment\w*|slot|schedule\w*|reserve\w*|fix (a|an|the|my)? ?(visit|time|date)|visit (on|at|tomorrow|next)|booking|bukking|buk)\b|बुक|अपॉइंटमेंट/i.test(text || "");
}

const CENTRE_WORD_RE =
  /\b(hospitals?|clinics?|centres?|centers?|labs?|laborator\w+|diagnostics?|scans?|nursing home|polyclinic|medical|medicals|health ?care|care|pharmacy|dental|eye|dr\.?|doctor)\b|अस्पताल|क्लिनिक|हॉस्पिटल|लैब/i;
const SENTENCE_START_RE =
  /^(no|nope|yes|yeah|ok|okay|please|pls|give|show|tell|send|find|get|search|book|i|i'm|im|we|you|u|can|could|will|would|what|which|where|how|why|is|are|do|does|let|want|need|just|nahi|haan|mujhe|hume|kya|kaun|kahan)\b/i;

/**
 * Could this message be a centre name? A request or a sentence ("No give me at your suggestion", "give it
 * for villapuram area") is not: it must never be saved as a centre for the team to verify.
 * A message that names a centre ("... hospital", "... clinic") always counts, however it starts.
 */
export function looksLikeCentreName(text: string): boolean {
  const t = (text || "").trim();
  if (!t || asksForSuggestion(t)) return false;
  if (CENTRE_WORD_RE.test(t)) return true;
  if (SENTENCE_START_RE.test(t)) return false;
  return t.split(/\s+/).length <= 6; // "Apollo, Greams Road"; a long sentence is not a name
}

/** The next unanswered question, or null when the request can be recorded */
export function nextStep(d: BookingDraft, hasSpecialisation: boolean): BookingStep | null {
  if (!d.c && !d.cn) return "centre";
  if (!d.ok) return "offer";
  if (d.u && !d.l) return "landmark";
  if (!d.ns && !hasSpecialisation) return "specialisation";
  if (!d.d) return "date";
  if (!d.t) return "time";
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "20 Nov 2026" for a YYYY-MM-DD date */
export function showDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${title(MONTHS[m - 1])} ${y}`;
}
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function bookingQuestion(
  step: BookingStep,
  d: BookingDraft,
  l: string | null = "en",
  now: Date = new Date(),
): string {
  const w = bookingWindow(now);
  const g = lang(l);
  const q: Record<BookingStep, L> = {
    centre: {
      en: "May I do your booking at the healthcare centre of your choice? Please share the centre and branch first.",
      hi: "क्या मैं आपकी पसंद के स्वास्थ्य केंद्र पर आपकी बुकिंग करूँ? कृपया पहले केंद्र और शाखा बताइए।",
      hinglish: "Kya main aapki pasand ke healthcare centre par aapki booking karun? Kripya pehle centre aur branch bataiye.",
    },
    offer: {
      en: `May I do your booking at ${d.cn}? Reply YES or NO, or send the name of another centre you prefer.`,
      hi: `क्या मैं ${d.cn} पर आपकी बुकिंग करूँ? हाँ या नहीं लिखें, या अपनी पसंद के किसी दूसरे केंद्र का नाम भेजें।`,
      hinglish: `Kya main ${d.cn} par aapki booking karun? YES ya NO likhein, ya apni pasand ke kisi dusre centre ka naam bhejein.`,
    },
    landmark: {
      en:
        `Thank you. "${d.cn}" is not in our directory yet, so our team will check the centre and branch. ` +
        "Please share its area or a nearby landmark.",
      hi: `धन्यवाद। "${d.cn}" अभी हमारी डायरेक्टरी में नहीं है, इसलिए हमारी टीम केंद्र और शाखा की जाँच करेगी। कृपया उसका इलाका या पास का कोई लैंडमार्क बताइए।`,
      hinglish: `Dhanyavaad. "${d.cn}" abhi hamari directory mein nahi hai, isliye hamari team centre aur branch check karegi. Kripya uska area ya paas ka koi landmark bataiye.`,
    },
    specialisation: {
      en: "Which doctor specialisation, test or healthcare service should I include in the request?",
      hi: "अनुरोध में मैं कौन-सी डॉक्टर विशेषज्ञता, जाँच या स्वास्थ्य सेवा लिखूँ?",
      hinglish: "Request mein main kaunsi doctor specialisation, test ya healthcare service likhun?",
    },
    date: {
      en: `What date would you prefer? It can be from ${showDate(w.min)} up to ${showDate(w.max)}.`,
      hi: `आप कौन-सी तारीख चाहेंगे? यह ${showDate(w.min)} से ${showDate(w.max)} तक हो सकती है।`,
      hinglish: `Aap kaunsi date chahenge? Yeh ${showDate(w.min)} se ${showDate(w.max)} tak ho sakti hai.`,
    },
    time: {
      en: "What time or time window would suit you?",
      hi: "आपके लिए कौन-सा समय या समय-सीमा ठीक रहेगी?",
      hinglish: "Aapke liye kaunsa time ya time window theek rahega?",
    },
  };
  return q[step][g];
}

/** Playbook 11.1 invalid-date replies */
export function dateProblemText(reason: string, now: Date = new Date(), l: string | null = "en"): string {
  const w = bookingWindow(now);
  const min = showDate(w.min);
  const max = showDate(w.max);
  const t: L =
    reason === "too_soon"
      ? {
          en: `The booking request needs at least a 3-day gap. Please choose a date on or after ${min}.`,
          hi: `बुकिंग अनुरोध के लिए कम से कम 3 दिन का अंतर ज़रूरी है। कृपया ${min} या उसके बाद की तारीख चुनें।`,
          hinglish: `Booking request ke liye kam se kam 3 din ka gap zaroori hai. Kripya ${min} ya uske baad ki date chunein.`,
        }
      : reason === "too_far"
        ? {
            en: `I can record requests only up to 6 months ahead. Please choose a date on or before ${max}.`,
            hi: `मैं केवल 6 महीने आगे तक के अनुरोध दर्ज कर सकता हूँ। कृपया ${max} या उससे पहले की तारीख चुनें।`,
            hinglish: `Main sirf 6 mahine aage tak ki requests record kar sakta hoon. Kripya ${max} ya usse pehle ki date chunein.`,
          }
        : {
            en: `Please share the date, for example ${min}. It can be from ${min} up to ${max}.`,
            hi: `कृपया तारीख बताइए, जैसे ${min}। यह ${min} से ${max} तक हो सकती है।`,
            hinglish: `Kripya date bataiye, jaise ${min}. Yeh ${min} se ${max} tak ho sakti hai.`,
          };
  return say(t, l);
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * A date as customers write it: 2026-11-20, 20/11/2026, 20-11-26, 20 Nov, Nov 20 2026, 20th November,
 * today, tomorrow, and the Hindi forms (20 नवंबर, २० नवंबर २०२६, कल, परसों). Day before month (India). Without a year: this year, or next year if already past.
 * Returns YYYY-MM-DD (not yet checked against the booking window) or null.
 */
// Hindi words -> the English forms the parser below reads. Nukta is dropped first (फ़रवरी = फरवरी).
const HINDI_DATE_WORDS: [RegExp, string][] = [
  [/जनवरी/g, " jan "],
  [/फरवरी/g, " feb "],
  [/मार्च/g, " mar "],
  [/अप्रैल|अप्रेल/g, " apr "],
  [/मई/g, " may "],
  [/जून/g, " jun "],
  [/जुलाई/g, " jul "],
  [/अगस्त/g, " aug "],
  [/सितंबर|सितम्बर/g, " sep "],
  [/अक्टूबर|अक्तूबर/g, " oct "],
  [/नवंबर|नवम्बर/g, " nov "],
  [/दिसंबर|दिसम्बर/g, " dec "],
  [/परसों|परसो/g, " parso "],
  [/आज/g, " aaj "],
  [/कल/g, " kal "],
  [/तारीख|तारीख़|तिथि|को/g, " "],
];

/** Devanagari digits -> 0-9, Hindi month and day words -> English (so "20 नवंबर" = "20 nov") */
export function normaliseHindiDate(text: string): string {
  let t = (text || "").normalize("NFD").replace(/़/g, "").normalize("NFC");
  t = t.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966));
  for (const [re, en] of HINDI_DATE_WORDS) t = t.replace(re, en);
  return t.replace(/\s+/g, " ");
}

export function parseCustomerDate(text: string, now: Date = new Date()): string | null {
  const t = normaliseHindiDate(text).toLowerCase().trim();
  const today = todayIST(now);
  const [ty, tm, td] = today.split("-").map(Number);
  const plusDays = (n: number) => {
    const x = new Date(Date.UTC(ty, tm - 1, td + n));
    return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  };
  if (/\b(today|aaj)\b/.test(t)) return today;
  if (/\b(day after tomorrow|parso)\b/.test(t)) return plusDays(2);
  if (/\b(tomorrow|kal)\b/.test(t)) return plusDays(1);

  let y: number | null = null;
  let m: number | null = null;
  let d: number | null = null;
  let hit = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  if (!hit) {
    hit = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
    if (hit) [d, m, y] = [Number(hit[1]), Number(hit[2]), hit[3] ? Number(hit[3]) : null];
  }
  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  if (!hit) {
    hit = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon}(?:,?\\s+(\\d{4}))?`));
    if (hit) [d, m, y] = [Number(hit[1]), MONTHS.indexOf(hit[2].slice(0, 3)) + 1, hit[3] ? Number(hit[3]) : null];
  }
  if (!hit) {
    hit = t.match(new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`));
    if (hit) [m, d, y] = [MONTHS.indexOf(hit[1].slice(0, 3)) + 1, Number(hit[2]), hit[3] ? Number(hit[3]) : null];
  }
  if (!hit || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y != null && y < 100) y += 2000;
  if (y == null) {
    y = ty;
    if (iso(y, m, d) < today) y += 1;
  }
  const x = new Date(Date.UTC(y, m - 1, d));
  if (x.getUTCMonth() !== m - 1) return null; // 31 Feb
  return iso(y, m, d);
}

/** Trigger H / Playbook 11.1 confirmation: always a request, pending confirmation */
export function bookingSavedText(o: {
  date: string;
  time: string;
  centre: string;
  branch?: string | null;
  specialisation?: string | null;
  unverified?: boolean;
  lang?: string | null;
}): string {
  const where = o.branch ? `${o.centre}, ${o.branch}` : o.centre;
  const date = showDate(o.date);
  switch (lang(o.lang)) {
    case "hi":
      return (
        `आपका बुकिंग अनुरोध ${where} में ${date}, ${o.time} के लिए` +
        (o.specialisation ? ` (${o.specialisation})` : "") +
        " दर्ज कर लिया गया है। इसकी पुष्टि अभी बाकी है। " +
        (o.unverified ? "हमारी टीम पहले केंद्र और शाखा की जाँच करेगी, फिर " : "Oxxy टीम ") +
        "पुष्टि के बारे में जल्द ही आपसे संपर्क करेगी।"
      );
    case "hinglish":
      return (
        `Aapki booking request ${where} mein ${date}, ${o.time} ke liye` +
        (o.specialisation ? ` (${o.specialisation})` : "") +
        " record ho gayi hai. Iska confirmation abhi pending hai. " +
        (o.unverified ? "Hamari team pehle centre aur branch check karegi, phir " : "Oxxy team ") +
        "confirmation ke liye aapse jaldi contact karegi."
      );
    default:
      return (
        `Your booking request has been made for ${date} at ${o.time} at ${where}` +
        (o.specialisation ? `, for ${o.specialisation}` : "") +
        ". It is pending confirmation. " +
        (o.unverified ? "Our team will first check the centre and branch, then " : "The Oxxy team will ") +
        "get in touch with you soon regarding confirmation."
      );
  }
}

export const BOOKING_OFFER_DECLINED_T: L = {
  en: "No problem. If you would like a booking request later, just tell me the centre you prefer.",
  hi: "कोई बात नहीं। अगर आप बाद में बुकिंग अनुरोध चाहें, तो बस अपनी पसंद का केंद्र बताइए।",
  hinglish: "Koi baat nahi. Agar aap baad mein booking request chahein, to bas apni pasand ka centre bataiye.",
};
export const BOOKING_OFFER_DECLINED = BOOKING_OFFER_DECLINED_T.en;
