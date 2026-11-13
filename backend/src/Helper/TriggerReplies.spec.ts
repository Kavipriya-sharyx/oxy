// Trigger & Conversion Layer 3, 5, 7, 8, 9 and 14.1: approved texts and the phrases that fire them
import {
  asksComparePlans,
  asksTrust,
  asksWhyActivate,
  illustrationText,
  planComparisonText,
  proofText,
  trustPackAssets,
  trustPackText,
  whyActivateText,
  whyActivateVariant,
} from "./TriggerReplies";

describe("phrases (14.1)", () => {
  it.each(["Is Oxxy genuine?", "is this legit", "how do I know this is not fake", "can I trust you?", "prove it", "share company details", "kya yeh asli hai"])(
    "A: %s",
    (t) => expect(asksTrust(t)).toBe(true),
  );
  it.each(["ok send the link", "I trust the doctor", "book a dental check-up"])("not A: %s", (t) =>
    expect(asksTrust(t)).toBe(false),
  );
  it.each(["why should I activate?", "nobody is sick", "no one is ill", "will I even use it?", "why do i need it"])(
    "C: %s",
    (t) => expect(asksWhyActivate(t)).toBe(true),
  );
  it.each(["compare plans", "what plans do you have?", "show me all plans with prices", "difference between the plans", "price list"])(
    "E comparison: %s",
    (t) => expect(asksComparePlans(t)).toBe(true),
  );
  it.each(["compare hospitals near me", "send me the link", "which plan is best for me"])("not a comparison: %s", (t) =>
    expect(asksComparePlans(t)).toBe(false),
  );
});

describe("Trigger A trust pack (3)", () => {
  it("website, policy and support first, then at most 2 approved proof items, never a repeat of the website", () => {
    const text = trustPackText([
      { title: "Website copy", url: "https://www.oxxy.in/" },
      { title: "News", url: "https://news.example/oxxy" },
      { title: "Testimonial", url: "https://t.example/1" },
      { title: "Third", url: "https://t.example/2" },
    ]);
    expect(text).toMatch(/^It is sensible to verify any healthcare service before paying/);
    const lines = text.split("\n").filter((l) => /https?:|Support:/.test(l));
    expect(lines).toEqual([
      "Official website: https://www.oxxy.in",
      "Official policies: https://www.oxxy.in/policies",
      "Support: 8800855340, info@oxxy.in",
      "News: https://news.example/oxxy",
      "Testimonial: https://t.example/1",
    ]);
    expect(text).toMatch(/What would you like to verify first\?$/);
  });
  it("a repeat sends only the official links", () => {
    expect(trustPackText([], false)).toMatch(/^Here is Oxxy's official information/);
  });
  it("trustPackAssets lists exactly what the text shows", () => {
    const extras = [
      { title: "W", url: "https://www.oxxy.in" },
      { title: "N", url: "https://n.example" },
    ];
    expect(trustPackAssets(extras).map((x) => x.title)).toEqual(["N"]);
  });
});

describe("Trigger C variants (5.1)", () => {
  it.each([
    [{ beneficiary: "my mother" }, null, "elderly"],
    [{}, 67, "elderly"],
    [{ healthcare_need: "monthly diabetes medicines" }, 40, "recurring"],
    [{ healthcare_need: "knee surgery" }, 40, "major"],
    [null, 30, "no_need"],
  ])("%p age %p -> %s", (n, age, v) => expect(whyActivateVariant(n as never, age as never)).toBe(v));
  it("no fear, no urgency, one question", () => {
    const t = whyActivateText("no_need");
    expect(t).toContain("Oxxy works best when it is active before the next planned healthcare expense");
    expect(t).not.toMatch(/today|expire|hurry|limited/i);
    expect(t.match(/\?/g)).toHaveLength(1);
  });
});

describe("Trigger E comparison (7)", () => {
  const rows = [
    { plan: "everyday", monthly: 999, yearly: 10000, age_limit: 70 },
    { plan: "vital", monthly: 1999, yearly: 20000, age_limit: 75 },
    { plan: "thrive", monthly: 2999, yearly: 30000, age_limit: 80 },
    { plan: "infinity", monthly: 3999, yearly: 40000, age_limit: null },
  ];
  it("four plans, ONE marked, GST stated, no link", () => {
    const t = planComparisonText(rows, { plan: "vital", reason: "it covers OPD and possible hospitalisation" }, null);
    expect(t).toContain("1. Everyday: ₹999 monthly / ₹10,000 yearly, up to age 70.");
    expect(t).toContain("4. Infinity: ₹3,999 monthly / ₹40,000 yearly, no age limit.");
    expect(t.match(/recommended for you/g)).toHaveLength(1);
    expect(t).toContain("2. Vital (recommended for you)");
    expect(t).toContain("plus applicable GST");
    expect(t).not.toMatch(/https?:/);
  });
  it("no plan marked yet: asks the one question instead", () => {
    const t = planComparisonText(rows, null, "May I know the age?");
    expect(t).not.toContain("recommended for you");
    expect(t).toMatch(/May I know the age\?$/);
  });
});

describe("Trigger F and L", () => {
  it("F states the variability", () => {
    expect(illustrationText(30, 100000, 30000)).toBe(
      "For an easy illustration, approximately 30% of ₹1,00,000 is ₹30,000. Actual savings depend on the service, " +
        "provider and location and will be confirmed. Would you like me to check the most suitable plan or take a booking request?",
    );
  });
  it("L lists only the approved items given", () => {
    const t = proofText([{ title: "News", url: "https://n.example" }]);
    expect(t).toContain("News: https://n.example");
    expect(t).toMatch(/Which point would you like to verify/);
  });
});
