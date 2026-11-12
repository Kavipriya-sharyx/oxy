import { GuardrailService } from "./Guardrail.service";

const g = new GuardrailService();
const kind = (t: string) => g.check(t)?.kind ?? null;

describe("Guardrail matching", () => {
  const cases: [string, string][] = [
    // emergency: English / Hinglish / Hindi
    ["I have chest pain", "emergency"],
    ["heart attack!", "emergency"],
    ["I cannot breathe", "emergency"],
    ["I can't breathe", "emergency"],
    ["difficulty breathing", "emergency"],
    ["he is breathless", "emergency"],
    ["stroke", "emergency"],
    ["her face drooping", "emergency"],
    ["he is unconscious", "emergency"],
    ["heavy bleeding", "emergency"],
    ["seizure", "emergency"],
    ["call an ambulance", "emergency"],
    ["seene mein dard ho raha hai", "emergency"],
    ["Saans nahi aa rahi", "emergency"],
    ["मुझे सीने में दर्द है", "emergency"],
    // self-harm
    ["I want to die", "self_harm"],
    ["I will kill myself", "self_harm"],
    ["suicide", "self_harm"],
    ["end my life", "self_harm"],
    ["I want to hurt myself", "self_harm"],
    ["main marna chahta hoon", "self_harm"],
    ["main marna chahti hoon", "self_harm"],
    ["jaan dena chahta hoon", "self_harm"],
    ["मैं मरना चाहता हूँ", "self_harm"],
    // STOP
    ["stop", "stop"],
    ["STOP.", "stop"],
    ["  Unsubscribe  ", "stop"],
    ["cancel messages", "stop"],
    ["please stop messaging me", "stop"],
    ["stop messages", "stop"],
    ["stop sending", "stop"],
    ["stop calling me", "stop"],
    ["do not contact me", "stop"],
    ["don't contact me", "stop"],
    ["dont contact me", "stop"],
    ["I want to opt out", "stop"],
    ["message mat bhejo", "stop"],
    ["band karo", "stop"],
    // talk to a person
    ["talk to a person", "person"],
    ["I want to speak to a human", "person"],
    ["talk to someone", "person"],
    ["connect me to an agent", "person"],
    ["customer care", "person"],
    ["I need a human", "person"],
    ["human please", "person"],
    ["insaan se baat karni hai", "person"],
    ["agent se baat karni hai", "person"],
  ];
  it.each(cases)("%s -> %s", (text, expected) => expect(kind(text)).toBe(expected));

  const notTriggers = ["bus stop", "I can't stop coughing", "stop by tomorrow", "hello", "what does the plan cost", ""];
  it.each(notTriggers)("does NOT trigger: %p", (text) => expect(kind(text)).toBeNull());

  it.each([
    "Does Oxxy cover accident treatment?",
    "Is emergency treatment included in the plan?",
    "is stroke covered",
    "what is the price if I have a stroke",
  ])("coverage question does NOT trigger: %p", (text) => expect(kind(text)).toBeNull());

  it.each(["he is having a stroke", "call an ambulance", "I have chest pain"])(
    "still triggers: %p",
    (text) => expect(kind(text)).toBe("emergency"),
  );

  it.each([
    "my dad is having a stroke, will my plan cover it",
    "he had a stroke, is it covered under the policy",
    "my mother is having a heart attack what does the plan include",
    "he just collapsed, is ambulance covered",
    "she has taken an overdose, any claim benefit",
    "please send an ambulance, is it included",
    "need an ambulance, what is the price",
    "papa ko stroke aaya hai, kya plan cover karta hai",
    "papa behosh ho gaya, plan mein kya include hai",
    "पापा बेहोश हो गए, क्या प्लान में शामिल है",
  ])("active event ALWAYS triggers: %p", (text) => expect(kind(text)).toBe("emergency"));

  it.each([
    "is stroke covered",
    "does the plan cover an ambulance",
    "is ambulance included in the plan",
    "does the policy cover overdose treatment",
    "what is the price of the plan for stroke patients",
  ])("coverage question still does NOT trigger: %p", (text) => expect(kind(text)).toBeNull());

  it("errs on the safe side: 'my chest pain medicine price' still triggers emergency", () => {
    expect(kind("my chest pain medicine price")).toBe("emergency");
  });

  it("order: emergency beats STOP, self-harm beats STOP, STOP beats talk-to-a-person", () => {
    expect(g.check("STOP chest pain")).toEqual({ kind: "emergency", also_stop: true });
    expect(g.check("STOP, I have chest pain")).toEqual({ kind: "emergency", also_stop: true });
    expect(g.check("I want to die, stop messaging")).toEqual({ kind: "self_harm", also_stop: true });
    expect(g.check("I have chest pain")).toEqual({ kind: "emergency", also_stop: false });
    expect(g.check("stop messaging, I need a human")?.kind).toBe("stop");
    expect(g.check("chest pain and I can't stop coughing")?.also_stop).toBe(false);
  });
});
