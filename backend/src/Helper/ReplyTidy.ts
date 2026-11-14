// Last step before a drafted reply goes out (after the validator). It only REMOVES sentences from the
// LLM's draft, never adds or rewrites one:
//  - one question per message (Playbook 5): when the system adds its own question, the draft's questions
//    go; a draft with several questions keeps the last one;
//  - no stalling ("please hold on while I check", "I will share it shortly"): the bot never comes back
//    by itself, so such a promise is false;
//  - no "Thank you for sharing ..." opener in two replies in a row.
// If nothing would be left, the draft is kept as it was (an empty reply is never sent).

const SENTENCE_RE = /[^.!?।\n]+[.!?।]+(?:["')\]]+)?|[^.!?।\n]+$/g;

export function splitSentences(text: string): string[] {
  return ((text || "").match(SENTENCE_RE) ?? []).map((x) => x.trim()).filter(Boolean);
}

export const isQuestion = (sentence: string) => /\?["')\]]*\s*$/.test(sentence.trim());
const ASKS_RE = /\b(please (share|choose|reply|tell|send|let me know)|reply (yes|no|with|1)|kripya [^.!?]*\b(bataiye|batayein|likhein|chunein|bhejein))\b|बताइए|बताएँ|लिखें|चुनें/i;
/** Does this text ask the customer for something: a question, or "Please share ..." / "Reply 1, 2 or 3" */
export const hasQuestion = (text: string | null | undefined) =>
  splitSentences(text || "").some(isQuestion) || ASKS_RE.test(text || "");

const STALL_RE =
  /\b(hold on|please wait|one moment|just a moment|a moment|give me a (moment|minute|second)|bear with me|stay with me)\b|\bwhile i (check|gather|look|find|search|get)\b|\b(i will|i'll|i shall|let me|i am going to|i'm going to)\b[^.!?]*\b(check|look|search|gather|find out|get back|come back|update you|share|send|confirm|let you know)\b|\b(main|mai|hum)\b[^.!?]*\b(check|dekh|pata) (kar|karke|karta|karti|leta|leti)\b|\bshortly\b|\bin a (moment|minute|while)\b|\bthodi der\b/i;

/** "Please hold on while I gather the information." / "I will share the timeline shortly." */
export function isStalling(sentence: string): boolean {
  // a human callback is a real next step, not stalling ("a team member will contact you shortly")
  if (/\b(team|team member|senior|agent|colleague|specialist|someone)\b/i.test(sentence)) return false;
  return STALL_RE.test(sentence);
}

const OPENER_RE = /^(thank you|thanks|thank u|great|got it|understood|noted|perfect|sure|okay|ok|dhanyavaad|shukriya|धन्यवाद)\b/i;
const startsWithOpener = (text: string | null | undefined) => OPENER_RE.test((text || "").trim());

export interface TidyOptions {
  /** the system adds a part of its own that asks a question (age, city, the booking step ...) */
  systemAsks?: boolean;
  /** the bot's previous message in this conversation */
  previousBotText?: string | null;
}

export function tidyDraft(draft: string, opts: TidyOptions = {}): string {
  const original = (draft || "").trim();
  let parts = splitSentences(original);
  if (!parts.length) return original;

  parts = parts.filter((x) => !isStalling(x));

  // the same polite opener twice in a row reads like a machine: the second one goes
  if (parts.length > 1 && startsWithOpener(parts[0]) && !isQuestion(parts[0]) && startsWithOpener(opts.previousBotText)) parts.shift();

  const questions = parts.filter(isQuestion);
  if (opts.systemAsks) parts = parts.filter((x) => !isQuestion(x));
  else if (questions.length > 1) {
    const keep = questions[questions.length - 1];
    parts = parts.filter((x) => !isQuestion(x) || x === keep);
  }

  const out = parts.join(" ").trim();
  if (out) return out;
  // everything went. With a system question following, nothing from the draft is needed.
  return opts.systemAsks ? "" : original;
}

// ---- "Monthly 20,000" / "we spend 2 lakh a year": the yearly medical spend, worked out in code ----

const MONTH_RE = /\b(monthly|per month|a month|every month|each month|month|\/\s*month|pm|mahine|mahina|maheene|har mahine)\b|महीने|महीना|मासिक/i;
const YEAR_RE = /\b(yearly|annually|annual|per year|a year|every year|each year|year|\/\s*year|pa|saal|salana|saalana)\b|साल|वार्षिक|सालाना/i;

/**
 * The yearly healthcare spend the customer stated, or null. Needs ONE amount and a period word
 * ("monthly 20,000" = 2,40,000 a year). A question ("is it 999 monthly?") is not a statement.
 */
export function statedYearlySpend(text: string): number | null {
  const t = (text || "").toLowerCase().replace(/,/g, "").replace(/₹|rs\.?|inr|rupees?/g, " ");
  if (/\?\s*$/.test(t.trim())) return null;
  const monthly = MONTH_RE.test(t);
  const yearly = YEAR_RE.test(t);
  if (monthly === yearly) return null; // no period, or both: not clear enough
  const amounts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|k\b|thousand|hazaar|hazar)?/g)].filter(
    (m) => !/^(19|20)\d{2}$/.test(m[1]) || !!m[2], // a year like 2026 is not an amount
  );
  if (amounts.length !== 1) return null;
  let n = Number(amounts[0][1]);
  const unit = amounts[0][2] || "";
  if (/lakh|lac/.test(unit)) n *= 100000;
  else if (/k|thousand|haz/.test(unit)) n *= 1000;
  if (!Number.isFinite(n) || n < 500) return null; // "2 months", "1 year": not money
  const total = Math.round(monthly ? n * 12 : n);
  return total <= 100_000_000 ? total : null;
}
