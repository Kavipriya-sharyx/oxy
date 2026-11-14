// Playbook 1.1 / 2: one purposeful question per message. The LLM sometimes ends with two
// ("How can I help today? Are you looking for X or Y?"). Enforced here instead of trusting the prompt:
// an "Or ...?" continuation is joined to the question before it, then only the LAST question is kept
// (it is the specific one). Statements are never touched.
const SPLIT = /(?<=[.!?।])\s+/u;
const CONTINUATION = /^(or|and|ya|yaa|aur|या|और|अथवा)\b/iu;

export function oneQuestion(text: string): string {
  const raw = (text || "").trim();
  if ((raw.match(/\?/g) || []).length < 2) return raw;
  // keep paragraph breaks: work per paragraph, but count questions across the whole reply
  const paras = raw.split(/\n{2,}/).map((p) => p.split(SPLIT).filter(Boolean));
  for (const sents of paras) {
    for (let i = sents.length - 1; i > 0; i--) {
      if (/\?\s*$/.test(sents[i - 1]) && CONTINUATION.test(sents[i])) {
        sents[i - 1] = `${sents[i - 1].replace(/\?\s*$/, ",")} ${sents[i].charAt(0).toLowerCase()}${sents[i].slice(1)}`;
        sents.splice(i, 1);
      }
    }
  }
  const isQ = (s: string) => /\?\s*$/.test(s);
  let lastP = -1;
  let lastS = -1;
  paras.forEach((sents, p) => sents.forEach((s, i) => isQ(s) && ((lastP = p), (lastS = i))));
  const out = paras
    .map((sents, p) => sents.filter((s, i) => !isQ(s) || (p === lastP && i === lastS)).join(" "))
    .filter((p) => p.trim());
  return out.join("\n\n");
}
