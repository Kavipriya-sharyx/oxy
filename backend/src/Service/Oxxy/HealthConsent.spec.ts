import { NOTICE_VERSION, FIXED_REPLIES } from "@Helper/FixedReplies";
import { asksHealthQuestion, healthConsentStatus, parseConsentAnswer, withoutHealthFields } from "./HealthConsent";

describe("parseConsentAnswer: only the customer's own clear words count", () => {
  const yes = ["yes", "YES", "Yes.", "y", "I agree", "yes i agree", "I consent", "haan", "Haan ji", "हाँ", "हां", "जी हाँ", "सहमत"];
  const no = ["no", "No.", "n", "nope", "no thanks", "I do not agree", "I refuse", "nahi", "Nahin", "नहीं", "ना", "असहमत"];
  const unclear = [
    "",
    "   ",
    "maybe",
    "ok",
    "hi",
    "what is this?",
    "yes but only my name",
    "no wait yes",
    "I need a knee surgery",
    "tell me the plans",
    "👍",
  ];
  it.each(yes)("yes: %p", (t) => expect(parseConsentAnswer(t)).toBe("yes"));
  it.each(no)("no: %p", (t) => expect(parseConsentAnswer(t)).toBe("no"));
  it.each(unclear)("unclear: %p", (t) => expect(parseConsentAnswer(t)).toBe("unclear"));
});

describe("healthConsentStatus: validity is tied to the notice version", () => {
  const now = new Date();
  const granted = { health_data_consent: true, notice_version: NOTICE_VERSION, consent_timestamp: now };

  it("no row, or an empty row -> none (send the notice)", () => {
    expect(healthConsentStatus(null)).toBe("none");
    expect(healthConsentStatus({})).toBe("none");
  });
  it("YES for the current version -> granted", () => expect(healthConsentStatus(granted)).toBe("granted"));
  it("consent without a timestamp is not valid", () =>
    expect(healthConsentStatus({ ...granted, consent_timestamp: null })).toBe("none"));
  it("consent flag false is not valid", () =>
    expect(healthConsentStatus({ ...granted, health_data_consent: false })).toBe("none"));
  it("consent given under an OLD version is not valid: a new notice needs fresh consent", () => {
    expect(healthConsentStatus({ ...granted, notice_version: "dpdp-health-v0" })).toBe("none");
    expect(healthConsentStatus(granted, "dpdp-health-v9")).toBe("none");
  });
  it("NO for the current version -> refused; for an old version -> asked again", () => {
    const refused = { health_data_consent: false, health_refused_at: now, health_refused_version: NOTICE_VERSION };
    expect(healthConsentStatus(refused)).toBe("refused");
    expect(healthConsentStatus({ ...refused, health_refused_version: "old" })).toBe("none");
  });
  it("notice sent for the current version, no answer yet -> awaiting; old version -> none", () => {
    expect(healthConsentStatus({ notice_sent_at: now, notice_sent_version: NOTICE_VERSION })).toBe("awaiting");
    expect(healthConsentStatus({ notice_sent_at: now, notice_sent_version: "old" })).toBe("none");
  });
});

describe("asksHealthQuestion (used on a refusing customer's replies)", () => {
  it.each([
    "What medical condition do you have?",
    "Please tell me your symptoms.",
    "How much do you spend on medical bills in a year?",
    "Which specialisation do you need? We can help.",
    "आपको कौन सी बीमारी है?",
    "Aapko kya takleef hai?",
  ])("flags: %p", (t) => expect(asksHealthQuestion(t)).toBe(true));

  it.each([
    "I can help you find a centre. Which city are you in?",
    "Our team will contact you shortly.",
    "We have plans called Everyday and Vital. Would you like general information?",
    "",
  ])("does not flag: %p", (t) => expect(asksHealthQuestion(t)).toBe(false));
});

it("withoutHealthFields drops only the health fields", () => {
  expect(
    withoutHealthFields({ city: "Pune", healthcare_need: "knee", annual_medical_spend: 5, specialisation: "ortho" }),
  ).toEqual({ city: "Pune" });
});

it("the notice is drafted in all three languages and is optional-consent wording", () => {
  for (const lang of ["en", "hi", "hinglish"] as const) {
    expect(FIXED_REPLIES.health_notice[lang].length).toBeGreaterThan(100);
  }
  expect(FIXED_REPLIES.health_notice.en).toMatch(/your choice/i);
  expect(FIXED_REPLIES.health_notice.en).toMatch(/YES or NO/);
});
