import { faqAnswer, FaqKey, faqNeedsPerson, matchFaq, withoutClosingQuestion } from "./FaqReplies";

describe("Playbook 13 FAQ: which question is it", () => {
  it.each<[string, FaqKey]>([
    ["What is Oxxy?", "what_is_oxxy"],
    ["oxxy kya hai", "what_is_oxxy"],
    ["Who pays the bill?", "who_pays"],
    ["Does Oxxy pay the hospital?", "who_pays"],
    ["Can I use it again and again? how many times", "repeat_use"],
    ["Kitni baar use kar sakte hain?", "repeat_use"],
    ["Does it include pre-existing diseases?", "pre_existing"],
    ["How long does activation take?", "activation_time"],
    ["I already paid the bill, can I still use it?", "after_paying"],
    ["Is there an age limit for Cut Medi Bills?", "cmb_age"],
    ["Can I take both Oxxy and Cut Medi Bills?", "both_products"],
    ["I want both products", "both_products"],
    ["Is 30% guaranteed?", "guarantee"],
    ["Will my appointment definitely be confirmed?", "booking_confirmed"],
    ["Where are your policies?", "policies"],
    ["What medicine should I take for fever?", "medical_advice"],
    ["Are you a bot?", "identity"],
    ["am I talking to a human", "identity"],
    ["I don't remember enquiring", "dont_remember"],
  ])("%s -> %s", (text, key) => expect(matchFaq(text)).toBe(key));

  it.each([
    "I need a plan for my mother",
    "my insurance policy covers this",
    "hi",
    "Vital plan price for 45 years",
    "x".repeat(300) + " what is oxxy",
  ])("not an FAQ: %s", (text) => expect(matchFaq(text)).toBeNull());
});

describe("answers follow the selected product (Playbook 22.1)", () => {
  it("the Oxxy route never mentions Cut Medi Bills", () => {
    for (const k of ["pre_existing", "activation_time", "after_paying"] as FaqKey[])
      expect(faqAnswer(k, { product: "oxxy" }, "en")).not.toMatch(/cut medi bills/i);
  });
  it("the Cut Medi Bills route gets its own lines", () => {
    expect(faqAnswer("pre_existing", { product: "cut_medi_bills" }, "en")).toBe(
      "Cut Medi Bills includes all pre-existing medical conditions.",
    );
    expect(faqAnswer("activation_time", { product: "cut_medi_bills" }, "en")).toMatch(/5 to 10 working days/);
  });
  it("no health question after a refusal", () => {
    expect(faqAnswer("pre_existing", { product: "oxxy", noHealth: true }, "en")).not.toMatch(/\?/);
  });
  it("approved wording, word for word", () => {
    expect(faqAnswer("who_pays", {}, "en")).toBe(
      "You pay the healthcare provider directly after the applicable saving is coordinated. Oxxy does not pay or reimburse the bill.",
    );
    expect(faqAnswer("identity", {}, "en")).toMatch(/^I am Oxxy Health's automated WhatsApp assistant\./);
  });
  it("every answer exists in all three languages", () => {
    for (const l of ["en", "hi", "hinglish"]) expect(faqAnswer("what_is_oxxy", {}, l).length).toBeGreaterThan(40);
  });
});

it("drops only a closing question", () => {
  expect(withoutClosingQuestion("Oxxy helps. What do you need?")).toBe("Oxxy helps.");
  expect(withoutClosingQuestion("No. Cut Medi Bills has no age limit.")).toBe("No. Cut Medi Bills has no age limit.");
});

describe("Playbook 8: Cut Medi Bills facts and family pricing", () => {
  it.each([
    ["What is the price for my family members?", "member_pricing"],
    ["Is there a discount for an additional member?", "member_pricing"],
    ["How do I cancel Cut Medi Bills?", "cmb_cancel"],
    ["can I stop the auto renewal", "cmb_cancel"],
    ["Can activation be done faster?", "early_activation"],
    ["I need it activated urgently", "early_activation"],
  ])("%s -> %s", (t, k) => expect(matchFaq(t)).toBe(k));

  it.each(["My family spends about 1 lakh a year", "Should I cancel my insurance?", "Can I cancel my booking?"])(
    "%s is not one of them",
    (t) => expect(["member_pricing", "cmb_cancel"]).not.toContain(matchFaq(t)),
  );

  it("member pricing on the Cut Medi Bills route; Oxxy family pricing goes to a person", () => {
    expect(faqAnswer("member_pricing", { product: "cut_medi_bills" }, "en")).toMatch(/30% off the listed price/);
    expect(faqNeedsPerson("member_pricing", "oxxy")).toMatch(/family/);
    expect(faqNeedsPerson("member_pricing", "cut_medi_bills")).toBeNull();
  });

  it("cancellation uses CMB_CANCELLATION_METHOD, and is escalated while it is not set", () => {
    delete process.env.CMB_CANCELLATION_METHOD;
    expect(faqNeedsPerson("cmb_cancel", "cut_medi_bills")).toMatch(/not configured/);
    process.env.CMB_CANCELLATION_METHOD = "the link in your mandate SMS";
    expect(faqNeedsPerson("cmb_cancel", "cut_medi_bills")).toBeNull();
    expect(faqAnswer("cmb_cancel", {}, "en")).toMatch(/through the link in your mandate SMS; successful cancellation stops future charges/);
    delete process.env.CMB_CANCELLATION_METHOD;
  });

  it("early activation: a review is offered, never promised", () => {
    const a = faqAnswer("early_activation", { product: "cut_medi_bills" }, "en");
    expect(a).toMatch(/5 to 10 working days/);
    expect(a).toMatch(/cannot promise it/);
  });
});
