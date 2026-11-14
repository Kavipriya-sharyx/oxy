// Runs the red-team set (RedTeam.cases.ts) on every build: the guardrails and approved answers catch the
// inbound cases, and the reply validator blocks every unsafe draft while letting the safe ones through.
import { GuardrailService } from "@Service/Oxxy/Guardrail.service";
import { validateReply } from "@Service/Oxxy/ReplyValidator.service";
import { matchFaq } from "@Helper/FaqReplies";
import { DRAFTS, INBOUND } from "./RedTeam.cases";

const guard = new GuardrailService();

describe("red team: inbound", () => {
  it.each(INBOUND.map((c) => [c.text, c] as const))("%s", (_t, c) => {
    const hit = guard.check(c.text);
    if ("guardrail" in c.expect) {
      expect(hit?.kind).toBe(c.expect.guardrail);
    } else if ("faq" in c.expect) {
      expect(hit).toBeNull();
      expect(matchFaq(c.text)).toBe(c.expect.faq);
    } else {
      expect(hit).toBeNull();
      expect(matchFaq(c.text)).toBeNull();
    }
  });
});

describe("red team: drafts the validator must block (or allow)", () => {
  it.each(DRAFTS.map((c) => [c.why, c] as const))("%s", (_w, c) => {
    const r = validateReply(c.draft, [], { lockedProduct: c.lockedProduct ?? null });
    expect({ draft: c.draft, ok: r.ok }).toEqual({ draft: c.draft, ok: !c.reject });
  });
});
