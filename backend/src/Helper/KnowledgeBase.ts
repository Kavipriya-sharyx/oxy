// The client's Q&A knowledge base (330 approved answers) and engagement bridges, for the LLM (client, 17 Nov:
// the voice agent answers from them; the chat must too). Voice manual 50: "retrieve only the smallest relevant
// knowledge passages for each turn" -> the closest few answers go into the LLM context as approved_answers,
// never the whole book. Hard rules, prices from plan_catalog and the validator still win.
import { KB_BRIDGES, KB_QA, KbBridge, KbEntry } from "./KnowledgeBaseData";

const STOP = new Set(
  ("a an the is are am was were be been i me my we our you your it its this that these those to of in on at for " +
    "with and or but if so do does did can could will would should shall may might have has had not no yes please " +
    "tell about what which who whom how why when where there here oxxy any some just also than then them they he " +
    "she his her us get got give want need know ok okay sir madam ji hai kya").split(" "),
);

const words = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/o p d/g, "opd")
    .replace(/i p d/g, "ipd")
    .replace(/i v f/g, "ivf")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/(ies)$/, "y").replace(/(?<=[a-z]{3})s$/, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));

// inverse document frequency over questions + answers: rare words ("dialysis", "nri") count more than common
// ones ("support", "plan"). A word in the question counts fully, a word only in the answer counts half.
const DOCS = KB_QA.map((e) => new Set(words(e.q)));
const ANS = KB_QA.map((e) => new Set(words(e.a)));
const DF = new Map<string, number>();
for (let i = 0; i < KB_QA.length; i++) for (const w of new Set([...DOCS[i], ...ANS[i]])) DF.set(w, (DF.get(w) ?? 0) + 1);
const idf = (w: string) => Math.log(1 + KB_QA.length / (1 + (DF.get(w) ?? 0)));

/** The closest approved answers to the customer's message (best first); empty when nothing is close */
export function relevantAnswers(text: string, limit = 3): KbEntry[] {
  const said = new Set(words(text));
  if (!said.size) return [];
  const scored = KB_QA.map((e, i) => {
    let score = 0;
    for (const w of said) score += DOCS[i].has(w) ? idf(w) : ANS[i].has(w) ? idf(w) / 2 : 0;
    // a short question that is almost the whole message wins over a long one that shares one word
    return { e, score: score / Math.pow(DOCS[i].size || 1, 0.35) };
  })
    .filter((x) => x.score >= 1.2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.e);
}

// When a bridge helps (Bridges PDF 1-22): the customer's words -> the situation
const BRIDGE_WHEN: [string, RegExp][] = [
  ["B02", /^(ok|okay|k|yes|no|maybe|fine|hmm+|hm|sure|achha|theek|sari|seri|aama)[\s.!]*$/i],
  ["B04", /\b(i )?(don'?t|do not) know\b|\bno idea\b|\bnot sure\b|\bpata nahi\b|\btheriyala\b/i],
  // "later" alone or "call me later", never "can I upgrade later?"
  ["B03", /\b(busy|driving|in a meeting|at work|not now)\b|\b(call|talk|message|text|ping) (me )?later\b|^later[\s.!]*$/i],
  ["B05", /\b(no (current |immediate )?need|nobody is (sick|ill)|we are healthy|no one is sick|healthy)\b/i],
  ["B07", /\b(need|let me|i will|i'?ll) (to )?think\b|\bthink about it\b/i],
  ["B09", /\b(expensive|costly|too much|price is high|can'?t afford|budget)\b/i],
  ["B10", /\b(trust|scam|fraud|fake|genuine|legit\w*)\b/i],
  ["B11", /\b(will i (even )?use|won'?t use|not use it|rarely (go|visit))\b/i],
  ["B12", /\b(main point|in short|short answer|summary|tl;?dr)\b/i],
  ["B14", /\b(parents?|mother|father|family)\b/i],
  ["B16", /\b(repeat\w*|same thing|again and again|already (told|said))\b/i],
  ["B19", /\b(ask|discuss|talk|speak|check) (with |to )?(my )?(family|wife|husband|spouse|son|daughter|parents)\b/i],
  ["B20", /\b(send (me )?the link|how (do|can) i (pay|activate|buy)|ready|go ahead|proceed)\b/i],
];

/** The engagement bridge for this message, if the customer seems to stall (one situation, its lines) */
export function relevantBridge(text: string): KbBridge | null {
  const t = (text || "").trim();
  for (const [id, re] of BRIDGE_WHEN) if (re.test(t)) return KB_BRIDGES.find((b) => b.id === id) ?? null;
  return null;
}

/** For the LLM context: the approved answers and (if any) the bridge lines, compact */
export function knowledgeFor(text: string): Record<string, unknown> {
  const qa = relevantAnswers(text);
  const bridge = relevantBridge(text);
  return {
    ...(qa.length
      ? { approved_answers: qa.map((e) => ({ question: e.q, mode: e.mode, answer: e.a, ...(e.next ? { next_question: e.next } : {}) })) }
      : {}),
    ...(bridge ? { engagement_bridge: { situation: bridge.situation, examples: bridge.lines.slice(0, 3) } } : {}),
  };
}
