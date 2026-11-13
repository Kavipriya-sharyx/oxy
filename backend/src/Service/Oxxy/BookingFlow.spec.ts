// Playbook 11 / 11.1 booking capture helpers
import { bookingSavedText, dateProblemText, nextStep, parseCustomerDate, readDraft, showDate, writeDraft } from "./BookingFlow";

const now = new Date("2026-11-14T06:00:00Z"); // 14 Nov 2026, 11:30 IST

describe("parseCustomerDate (Asia/Kolkata, day before month)", () => {
  it.each([
    ["2026-11-20", "2026-11-20"],
    ["20/11/2026", "2026-11-20"],
    ["20-11-26", "2026-11-20"],
    ["20 Nov", "2026-11-20"],
    ["20th November 2026", "2026-11-20"],
    ["Nov 20", "2026-11-20"],
    ["on 5 jan", "2027-01-05"], // already past this year -> next year
    ["tomorrow", "2026-11-15"],
    ["today", "2026-11-14"],
  ])("%s -> %s", (t, iso) => expect(parseCustomerDate(t, now)).toBe(iso));
  it.each(["next week sometime", "31/02/2027", "hello"])("%s -> null", (t) => expect(parseCustomerDate(t, now)).toBeNull());
});

describe("steps: one question per turn", () => {
  it("centre -> offer (list pick) -> landmark (unknown) -> specialisation -> date -> time -> done", () => {
    expect(nextStep({ step: "centre", ok: true }, false)).toBe("centre");
    expect(nextStep({ step: "offer", c: "x", cn: "A", ok: false }, false)).toBe("offer");
    expect(nextStep({ step: "centre", cn: "Kumar", u: true, ok: true }, false)).toBe("landmark");
    expect(nextStep({ step: "centre", c: "x", cn: "A", ok: true }, false)).toBe("specialisation");
    expect(nextStep({ step: "centre", c: "x", cn: "A", ok: true }, true)).toBe("date");
    expect(nextStep({ step: "date", c: "x", cn: "A", ok: true, d: "2026-11-20" }, true)).toBe("time");
    expect(nextStep({ step: "time", c: "x", cn: "A", ok: true, d: "2026-11-20", t: "10 am" }, true)).toBeNull();
  });
  it("health consent refused: no specialisation question", () => {
    expect(nextStep({ step: "centre", c: "x", cn: "A", ok: true, ns: true }, false)).toBe("date");
  });
  it("the draft round-trips and never carries the specialisation", () => {
    const p = writeDraft({ step: "date", c: "x", cn: "A", ok: true });
    expect(readDraft(p)).toEqual({ step: "date", c: "x", cn: "A", ok: true });
    expect(readDraft("soft_activation")).toBeNull();
  });
});

describe("texts", () => {
  it("H: date, time, centre, branch, specialisation; pending, never confirmed", () => {
    expect(
      bookingSavedText({ date: "2026-11-20", time: "10 am", centre: "Apollo Eye", branch: "Adyar", specialisation: "eye check-up" }),
    ).toBe(
      "Your booking request has been made for 20 Nov 2026 at 10 am at Apollo Eye, Adyar, for eye check-up. " +
        "It is pending confirmation. The Oxxy team will get in touch with you soon regarding confirmation.",
    );
  });
  it("invalid dates (11.1)", () => {
    expect(dateProblemText("too_soon", now)).toBe(
      "The booking request needs at least a 3-day gap. Please choose a date on or after 17 Nov 2026.",
    );
    expect(dateProblemText("too_far", now)).toBe(
      "I can record requests only up to 6 months ahead. Please choose a date on or before 14 May 2027.",
    );
    expect(showDate("2027-02-28")).toBe("28 Feb 2027");
  });
});
