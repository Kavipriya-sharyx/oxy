// Client, 17 Nov: the Q&A knowledge base and bridges reach the LLM; the button flow in Hindi / Hinglish
import { knowledgeFor, relevantAnswers, relevantBridge } from "./KnowledgeBase";
import { KB_BRIDGES, KB_QA } from "./KnowledgeBaseData";
import {
  familyCard,
  familyQuestion,
  planCard,
  savingsCard,
  stepMessage,
  termsCard,
} from "@Service/Oxxy/GuidedFlow";
import { validateMessage } from "@Service/Oxxy/WhatsappPayload";

describe("Q&A knowledge base", () => {
  it("all 330 answers and the bridges are loaded", () => {
    expect(KB_QA).toHaveLength(330);
    expect(KB_QA.every((e) => e.q && e.a)).toBe(true);
    expect(KB_BRIDGES.length).toBeGreaterThanOrEqual(20);
  });

  it.each([
    ["Can I buy for my parents?", "Q129"],
    ["Does it support dialysis or kidney disease?", "Q147"],
    ["Can I get a refund?", "Q272"],
    ["Is Oxxy health insurance?", "Q223"],
    ["Can an NRI buy for parents in India?", "Q134"],
    ["Can I upgrade later?", "Q089"],
    ["Does it support IVF?", "Q158"],
    ["Does it work in government hospitals?", "Q180"],
  ])("%s -> %s among the closest answers", (text, id) => {
    expect(relevantAnswers(text).map((e) => e.id)).toContain(id);
  });

  it("small talk finds nothing (no random answer in the context)", () => {
    expect(relevantAnswers("hmm")).toEqual([]);
  });

  it("stalling gets one bridge situation", () => {
    expect(relevantBridge("ok")?.situation).toMatch(/One-Word/i);
    expect(relevantBridge("I don't know")?.situation).toMatch(/Don'?t Know/i);
    expect(relevantBridge("let me think")?.situation).toMatch(/Think/i);
    expect(relevantBridge("what is the plan price for parents and kids")).not.toBeNull();
  });

  it("the LLM context carries the answers and their next question", () => {
    const k = knowledgeFor("Which plan for my elderly parent?") as { approved_answers: { answer: string }[] };
    expect(k.approved_answers[0].answer).toMatch(/Infinity/);
  });
});

describe("the button flow in every language fits WhatsApp's limits", () => {
  const steps = ["savings", "who", "when", "decision", "need", "condition", "age", "city", "insurance", "spend"] as const;
  for (const l of ["en", "hi", "hinglish"]) {
    it(`${l}: questions, savings, plan, family, terms`, () => {
      for (const st of steps) expect(() => validateMessage(stepMessage(st, undefined, l))).not.toThrow();
      for (const m of [
        savingsCard(50000, l),
        planCard("infinity", { monthly: 3999, yearly: 40000 }, { who: "parents" }, l),
        familyQuestion("vital", l),
        familyCard("vital", { monthly: 1999, yearly: 20000 }, 2, l),
        termsCard(l),
      ])
        expect(() => validateMessage(m)).not.toThrow();
    });
  }
  it("Hindi texts are Hindi", () => {
    expect((stepMessage("who", undefined, "hi") as { body: string }).body).toMatch(/किसके लिए/);
    expect((savingsCard(50000, "hi") as { body: string }).body).toContain("₹15,000 तक");
  });
});
