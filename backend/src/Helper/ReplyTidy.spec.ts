// Cases taken from a real chat (14 Nov): repeated thanks, two questions in one message, "please hold on".
import { hasQuestion, isStalling, statedYearlySpend, tidyDraft } from "./ReplyTidy";
import { isNoCentreText, noCentreText } from "./PlanReplies";

describe("one question per message", () => {
  it("the system asks its own question: the draft's question goes, its statement stays", () => {
    const draft = "Great choice! I can help you with an Oxxy plan for ongoing support. Please let me know your preferred date for activation?";
    expect(tidyDraft(draft, { systemAsks: true })).toBe("Great choice! I can help you with an Oxxy plan for ongoing support.");
  });

  it("a draft that is only a question is dropped when the system asks one", () => {
    expect(tidyDraft("Is there a specific healthcare centre you prefer, or should I suggest options?", { systemAsks: true })).toBe("");
  });

  it("two questions in the draft: the last one is kept", () => {
    const out = tidyDraft("Do you need help with consultations? What medicines are required?");
    expect(out).toBe("What medicines are required?");
    expect(out.match(/\?/g)).toHaveLength(1);
  });

  it("one question, nothing else to fix: unchanged", () => {
    const d = "Oxxy helps with consultations, tests and medicines. What specific healthcare need do you have in mind?";
    expect(tidyDraft(d)).toBe(d);
  });

  it("never returns an empty reply when the system adds nothing", () => {
    expect(tidyDraft("Please hold on for a moment.")).toBe("Please hold on for a moment.");
  });
});

describe("no stalling: the bot never comes back by itself", () => {
  it.each([
    "Please hold on for a moment while I gather the information.",
    "I will check for healthcare centres in Coimbatore within a 10 km radius.",
    "I will share the activation timeline and details for the Oxxy plan shortly.",
    "Let me check that for you.",
    "One moment please.",
  ])("stalling: %s", (x) => expect(isStalling(x)).toBe(true));

  it.each([
    "A team member will contact you shortly.",
    "I have asked our team to check the options there, and they will contact you.",
    "Oxxy helps with consultations, tests and medicines.",
    "I can help you find a centre.",
  ])("not stalling: %s", (x) => expect(isStalling(x)).toBe(false));

  it("the real reply: only the acknowledgement is left before the system's answer", () => {
    const draft =
      "Thank you for specifying Peelamedu. I will check for healthcare centres in that area. Please hold on for a moment while I gather the information.";
    expect(tidyDraft(draft, { systemAsks: true })).toBe("Thank you for specifying Peelamedu.");
  });
});

describe("no 'Thank you for ...' in two replies in a row", () => {
  const prev = "Thank you for sharing your city, Tiruppur. Which need is this for?";
  it("the second opener goes", () => {
    expect(tidyDraft("Thank you for clarifying that. Would you like to see a plan?", { previousBotText: prev })).toBe("Would you like to see a plan?");
  });
  it("the first one stays", () => {
    const d = "Thank you for sharing your city. Which need is this for?";
    expect(tidyDraft(d, { previousBotText: "Which city do you live in?" })).toBe(d);
  });
});

describe("the yearly spend the customer stated", () => {
  it.each([
    ["Monthly 20,000", 240000],
    ["Monthly we are spending 20,000", 240000],
    ["around 15k per month", 180000],
    ["we spend 2 lakh a year", 200000],
    ["Rs. 50000 yearly", 50000],
    ["mahine ka 8000 lagta hai", 96000],
  ])("%s -> %d", (t, n) => expect(statedYearlySpend(t)).toBe(n));

  it.each([
    "is it 999 monthly?", // a question about the price
    "20000", // no period
    "surgery will cost 2 lakh", // one bill, not a yearly spend
    "for 2 months", // not money
    "monthly 5000 and yearly 60000", // two amounts
    "Activation 2026-12-01",
    "hello",
  ])("%s -> null", (t) => expect(statedYearlySpend(t)).toBeNull());
});

describe("no verified centre: never the same sentence in a loop", () => {
  it("first time: names the place and asks for another centre and branch", () => {
    const t = noCentreText("Peelamedu, Coimbatore", false);
    expect(t).toBe(
      "I do not have a verified centre in Peelamedu, Coimbatore yet. Please share the healthcare centre's name and location, in this or another area. Oxxy can help take your booking request there.",
    );
    expect(isNoCentreText(t)).toBe(true);
    expect(hasQuestion(t)).toBe(true); // it asks for the centre: the draft's own question is dropped
  });
  it("again: the team checks, no question repeated", () => {
    const t = noCentreText("Tiruppur", true);
    expect(t).toContain("I have asked our team to check the options there");
    expect(t).not.toContain("?");
    expect(isNoCentreText(t)).toBe(true);
  });
  it("other replies are not mistaken for it", () => expect(isNoCentreText("Which city and area should I search in?")).toBe(false));
});
