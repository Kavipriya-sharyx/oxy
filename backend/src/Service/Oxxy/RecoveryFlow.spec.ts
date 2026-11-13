// Trigger layer 9 M / N, Playbook 14 / 15: objections, follow-up times, summary, medicines
import {
  asksMedicine,
  detectObjection,
  followUpOptions,
  followUpProblem,
  parseFollowUpTime,
  showWhen,
  summaryLines,
} from "./RecoveryFlow";

const now = new Date("2026-11-14T06:00:00Z"); // 14 Nov 2026, 11:30 IST

describe("detectObjection (Playbook 14)", () => {
  it.each([
    ["It is too expensive", "price"],
    ["bahut mehenga hai", "price"],
    ["I need to think", "think"],
    ["let me think about it", "think"],
    ["I need to ask my family first", "family"],
    ["will discuss with my wife", "family"],
    ["I'm busy right now", "busy"],
    ["call me later", "busy"],
    ["not now", "busy"],
    ["not interested", "not_interested"],
    ["no hospital near my place", "no_provider"],
  ])("%s -> %s", (t, k) => expect(detectObjection(t)).toBe(k));
  it.each(["what is the price?", "I think Vital is good", "book for my family"])("no objection: %s", (t) =>
    expect(detectObjection(t)).toBeNull(),
  );
});

describe("follow-up times (Trigger N)", () => {
  const options = followUpOptions(now);
  it("two concrete options tomorrow, inside 09:00-21:00 IST", () => {
    expect(showWhen(options[0])).toBe("15 Nov at 11 am");
    expect(showWhen(options[1])).toBe("15 Nov at 5 pm");
  });
  it.each([
    ["1", "15 Nov at 11 am"],
    ["second", "15 Nov at 5 pm"],
    ["tomorrow 6 pm", "15 Nov at 6 pm"],
    ["20 Nov morning", "20 Nov at 10 am"],
    ["4 pm", "14 Nov at 4 pm"], // still ahead today
    ["10 am", "15 Nov at 10 am"], // already past today -> tomorrow
    ["kal shaam 6 baje", "15 Nov at 6 pm"],
  ])("%s -> %s", (t, w) => expect(showWhen(parseFollowUpTime(t, options, now)!)).toBe(w));
  it("no time in the reply -> null", () => expect(parseFollowUpTime("ok thanks", options, now)).toBeNull());
  it("quiet hours, the past and > 90 days are refused", () => {
    expect(followUpProblem(parseFollowUpTime("tomorrow 11 pm", options, now)!, now)).toBe("quiet_hours");
    expect(followUpProblem(new Date(now.getTime() - 1000), now)).toBe("past");
    expect(followUpProblem(new Date(now.getTime() + 100 * 86400000), now)).toBe("too_far");
    expect(followUpProblem(options[0], now)).toBeNull();
  });
});

describe("summary (3 lines)", () => {
  it("need, one product, next step", () => {
    expect(summaryLines({ need: "knee pain", plan: "vital", reason: "it covers OPD and possible hospitalisation" })).toBe(
      "Your need: knee pain.\nSuggested: the Oxxy Vital plan, because it covers OPD and possible hospitalisation.\n" +
        "Next step: choose a centre, take a booking request, or review the plan details before any payment.",
    );
  });
  it("Cut Medi Bills route names only Cut Medi Bills; no health detail when none is given", () => {
    const t = summaryLines({ product: "cut_medi_bills", booking: true });
    expect(t).toContain("Suggested: Cut Medi Bills");
    expect(t).not.toMatch(/Oxxy (\w+ )?plan/);
    expect(t).toContain("Your need: support with your healthcare expenses.");
  });
});

describe("Trigger K phrases", () => {
  it.each(["do you deliver medicines?", "I need cheaper tablets for my mother", "dawai home delivery"])("%s", (t) =>
    expect(asksMedicine(t)).toBe(true),
  );
  it("a medicine mentioned in passing is not K", () => expect(asksMedicine("my father takes bp tablets")).toBe(false));
});
