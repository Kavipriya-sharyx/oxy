import { detectRescueSignal, readRescue } from "./RescueReplies";

describe("detectRescueSignal", () => {
  it.each([
    ["ok", "one_word"], ["Hmm", "one_word"], ["👍", "one_word"], ["theek hai", "one_word"],
    ["I don't know", "dont_know"], ["pata nahi", "dont_know"], ["hmm not sure", "dont_know"],
    ["you already told me that", "repetitive"], ["you keep asking the same thing", "repetitive"],
  ])("%s -> %s", (t, s) => expect(detectRescueSignal(t)).toBe(s));

  it.each(["yes", "no", "Chennai", "hmm not sure about you people", "I don't know which hospital is near Adyar, can you help me find one quickly please"])(
    "%s is not a rescue signal",
    (t) => expect(detectRescueSignal(t)).toBeNull(),
  );

  it("reads the marker", () => {
    expect(readRescue("rescue:dont_know:2")).toEqual({ signal: "dont_know", attempts: 2 });
    expect(readRescue("price")).toBeNull();
  });
});
