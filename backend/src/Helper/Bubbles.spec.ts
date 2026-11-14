import { splitText, toBubbles } from "./Bubbles";

describe("Playbook 1.1 bubbles", () => {
  it("a YES / NO question is one message with two reply buttons (ids yes / no)", () => {
    const [m] = toBubbles("Shall I send the official secure activation link? Reply YES or NO.");
    expect(m.kind).toBe("buttons");
    expect((m as { buttons: { id: string; title: string }[] }).buttons).toEqual([
      { id: "yes", title: "Yes" },
      { id: "no", title: "No" },
    ]);
  });
  it("Hindi buttons for a Hindi question", () => {
    const [m] = toBubbles("क्या यह ठीक है? कृपया YES या NO लिखें।");
    expect((m as { buttons: { title: string }[] }).buttons.map((b) => b.title)).toEqual(["हाँ", "नहीं"]);
  });
  it("short text is one bubble", () => {
    expect(splitText("Hello there.")).toEqual(["Hello there."]);
  });
  it("long text: paragraphs packed into bubbles of up to 350 characters, at most three", () => {
    const p = (n: number) => "x".repeat(n);
    const parts = splitText([p(200), p(200), p(200), p(200)].join("\n\n"));
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(p(200));
    expect(splitText([p(100), p(100)].join("\n\n"))).toHaveLength(1);
  });
});
