// Playbook 15 conversation rescue inside a live chat: "rescue the relevance, not merely the conversation".
// At most two attempts per signal, then a summary / follow-up / closure offer. English is the approved text
// (Playbook 15 table); Hindi / Hinglish are drafts [CONFIRM]. ("Busy" and "need to think" are the objection
// replies in RecoveryFlow; "no response" is the scheduled conversation_rescue_1 / _2 templates.)
import { L, say } from "./Lang";

export type RescueSignal = "one_word" | "dont_know" | "repetitive";

const norm = (t: string) =>
  (t || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// low-engagement fillers (never yes / no: those answer a question)
const FILLERS = new Set([
  "ok", "okay", "okk", "k", "kk", "hmm", "hmmm", "hm", "fine", "acha", "achha", "accha", "theek", "theek hai",
  "thik hai", "ok ji", "sure", "alright", "right", "cool", "oh", "i see", "oic", "hmm ok", "ok ok", "ठीक है", "अच्छा",
]);

export function detectRescueSignal(text: string): RescueSignal | null {
  const raw = (text || "").trim();
  if (/^(👍|👌|🙏|🙂)+$/u.test(raw)) return "one_word";
  const t = norm(raw);
  if (!t) return null;
  if (FILLERS.has(t)) return "one_word";
  // the whole message is "I don't know" (with fillers): "not sure about you people" is a trust doubt, not this
  const core = t.replace(/\b(hmm+|ok|okay|really|actually|honestly|ji|yaar|sir|madam|bhai|abhi|exactly|right now|am|i'm|im)\b/g, " ").replace(/\s+/g, " ").trim();
  if (/^(i )?(really )?(don'?t|dont|do not) know( yet)?$|^(i )?(am )?not sure( yet)?$|^no idea$|^(mujhe )?(pata nahi|pata nahin|maloom nahi|nahi pata)( hai)?$|^(मुझे )?(पता नहीं|मालूम नहीं)( है)?$/u.test(core))
    return "dont_know";
  if (
    /\byou (already|just) (said|told|asked)\b|\bsame (thing|question|message) again\b|\b(you are|you're|youre) repeating\b|\byou keep (asking|saying)\b|\balready (told|answered|said) (you|that)\b|\bbaar baar (puch|pooch|bol)/u.test(
      t,
    )
  )
    return "repetitive";
  return null;
}

const LINES: Record<RescueSignal, [L, L]> = {
  one_word: [
    {
      en: "Would you prefer the main benefit or the price first?",
      hi: "आप पहले मुख्य फ़ायदा जानना चाहेंगे या कीमत?",
      hinglish: "Aap pehle main benefit jaanna chahenge ya price?",
    },
    {
      en: "Is your concern mainly trust, price or whether you will use it?",
      hi: "आपकी चिंता मुख्य रूप से भरोसे, कीमत या इस्तेमाल को लेकर है?",
      hinglish: "Aapki chinta mainly trust, price ya iske use ko lekar hai?",
    },
  ],
  dont_know: [
    {
      en: "That is fine. Does your family spend more on routine care or occasional major treatment?",
      hi: "कोई बात नहीं। आपका परिवार नियमित इलाज पर ज़्यादा खर्च करता है या कभी-कभार बड़े इलाज पर?",
      hinglish: "Koi baat nahi. Aapka parivar routine care par zyada kharch karta hai ya kabhi-kabhi bade treatment par?",
    },
    {
      en: "Would your annual spending be closer to ₹50,000, ₹1 lakh, ₹3 lakh or more?",
      hi: "आपका सालाना खर्च लगभग ₹50,000, ₹1 लाख, ₹3 लाख या उससे ज़्यादा होगा?",
      hinglish: "Aapka saalana kharch lagbhag ₹50,000, ₹1 lakh, ₹3 lakh ya usse zyada hoga?",
    },
  ],
  repetitive: [
    {
      en: "I do not want to repeat myself. Is there one concern I have not answered clearly?",
      hi: "मैं बात दोहराना नहीं चाहता। क्या कोई एक सवाल है जिसका मैंने साफ़ जवाब नहीं दिया?",
      hinglish: "Main baat dohrana nahi chahta. Kya koi ek concern hai jiska maine saaf jawab nahi diya?",
    },
    {
      en: "Would you like activation help, written information or to end the enquiry?",
      hi: "क्या आप एक्टिवेशन में मदद, लिखित जानकारी चाहेंगे, या पूछताछ यहीं समाप्त करें?",
      hinglish: "Kya aap activation mein help, written information chahenge, ya enquiry yahin band karein?",
    },
  ],
};

/** The line for attempt 1 or 2 (attempt 3+ = the close offer, handled by the caller) */
export function rescueLine(signal: RescueSignal, attempt: 1 | 2, l?: string | null): string {
  return say(LINES[signal][attempt - 1], l);
}

/** objection marker on the conversation: "rescue:<signal>:<attempts>" */
export function readRescue(objection?: string | null): { signal: RescueSignal; attempts: number } | null {
  const m = (objection || "").match(/^rescue:(one_word|dont_know|repetitive):(\d+)$/);
  return m ? { signal: m[1] as RescueSignal, attempts: Number(m[2]) } : null;
}
