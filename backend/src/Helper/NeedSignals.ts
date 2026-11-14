// Code-side reading of the need pattern (Playbook 5 Q3 / 12.3), so routing does not depend on the LLM
// remembering to fill need_pattern (the eval found it often does not). One planned surgery / operation /
// procedure = "single_expense"; a routine or repeated need is left to the LLM ("ongoing").
const PROCEDURE = /\b(surgery|surgeries|operation|procedure|transplant|replacement|bypass|angioplasty|cataract|hernia|appendix|gallbladder|c-?section|delivery)\b|ऑपरेशन|सर्जरी|प्रत्यारोपण/iu;
const ROUTINE = /\b(regular|routine|every (month|week)|monthly|ongoing|again and again|har (mahine|hafte)|baar baar|checkups?|medicines? every)\b|हर महीने|नियमित/iu;
const PAST = /\b(had|did|done|was|were|last (year|month)|ago|ho gay[ai]|ho chuk[ai])\b|हो गया|हो चुका/iu;

export function singleExpenseSignal(text: string): boolean {
  const t = text || "";
  return PROCEDURE.test(t) && !ROUTINE.test(t) && !PAST.test(t);
}
