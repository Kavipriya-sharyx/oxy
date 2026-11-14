import { buildDataset } from "./EvalDataset";
import { score } from "./run-eval";

describe("LLM eval set", () => {
  const cases = buildDataset();

  it("has 300+ cases in all three languages, unique ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(300);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const l of ["en", "hinglish", "hi"]) expect(cases.some((c) => c.lang === l)).toBe(true);
  });

  it("scores a good reply as a pass", () => {
    const c = cases.find((x) => x.category === "trust")!;
    expect(score(c, { reply_text: "That is a fair question. Who is the care for?", intent: "trust_doubt" }).ok).toBe(true);
  });

  it("fails a reply that promises savings, asks two questions or has the wrong intent", () => {
    const c = cases.find((x) => x.category === "trust")!;
    const r = score(c, { reply_text: "You will save 30% guaranteed! Ready? Shall we start?", intent: "other" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/validator/);
    expect(r.problems).toContain("more than one question");
    expect(r.problems.join(" ")).toMatch(/intent other/);
  });

  it("checks required fields", () => {
    const c = cases.find((x) => x.category === "single_expense")!;
    expect(score(c, { reply_text: "Thank you. When is it planned?", intent: "collect_needs", extracted_fields: {} }).problems.join(" ")).toMatch(
      /field need_pattern/,
    );
  });
});
