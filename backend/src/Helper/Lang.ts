// Reply languages (Playbook 1.1: English, Hindi or natural Hinglish; mirror the customer's script).
// System texts are maps { en, hi, hinglish }. English is the approved wording; Hindi and Hinglish follow
// Playbook 19 ("translate the approved meaning, keep price, GST, renewal, activation, pending-confirmation
// and no-guarantee facts exact") and are DRAFTS: [CONFIRM] with Oxxy before go-live.
// "Cut Medi Bills" is never translated or shortened.

export type Lang = "en" | "hi" | "hinglish";
export type L = Record<Lang, string>;

export const lang = (l?: string | null): Lang => (l === "hi" || l === "hinglish" ? l : "en");

/** The text in the customer's language (unknown -> English) */
export const say = (t: L, l?: string | null): string => t[lang(l)];

// Hinglish words that are rare in English sentences
const HINGLISH =
  /\b(hai|hain|kya|kyu|kyun|kaise|kitna|kitne|kitni|nahi|nahin|mujhe|mera|meri|mere|aap|aapka|aapke|hum|hamara|humara|chahiye|karna|karo|kar|haan|ji|bhai|wala|wali|liye|kaha|kahan|abhi|baad|thoda|bahut|accha|achha|theek|tha|thi|raha|rahi|batao|bataiye)\b/gi;

/**
 * The language of one message, when it is clear: Devanagari = Hindi, two or more Hinglish words =
 * Hinglish, four or more plain English words = English. Otherwise null (keep the stored language).
 */
export function detectLanguage(text: string): Lang | null {
  const t = (text || "").trim();
  if (!t) return null;
  if (/[ऀ-ॿ]/.test(t)) return "hi";
  const hinglish = (t.match(HINGLISH) || []).length;
  if (hinglish >= 2) return "hinglish";
  const words = t.split(/\s+/).filter((w) => /^[a-z'’,.?!]+$/i.test(w));
  if (hinglish === 0 && words.length >= 4) return "en";
  return null;
}
