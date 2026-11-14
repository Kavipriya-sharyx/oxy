// Playbook 11 / 11.1 booking capture helpers
import { asksToBook, asksForSuggestion, looksLikeCentreName, bookingSavedText, dateProblemText, nextStep, parseCustomerDate, readDraft, showDate, writeDraft } from "./BookingFlow";

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
    // Hindi / Devanagari
    ["20 नवंबर", "2026-11-20"],
    ["२० नवम्बर २०२६", "2026-11-20"],
    ["5 जनवरी को", "2027-01-05"],
    ["12 फ़रवरी 2027", "2027-02-12"],
    ["3 सितंबर 2027", "2027-09-03"],
    ["कल", "2026-11-15"],
    ["परसों", "2026-11-16"],
    ["आज", "2026-11-14"],
    ["२०/११/२०२६", "2026-11-20"],
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

describe("the answer to 'share the centre and branch': a name or not", () => {
  it.each([
    "No give me at your suggestion.",
    "you suggest",
    "please recommend one",
    "any good hospital nearby",
    "I don't know, you choose",
    "not sure",
    "aap batao",
    "koi bhi",
  ])("'%s' asks for a suggestion, it is not a centre", (t) => {
    expect(asksForSuggestion(t)).toBe(true);
    expect(looksLikeCentreName(t)).toBe(false);
  });

  it.each(["Give it for villapuram area.", "I would require on tomorrow.", "ok book it for me please", "what do you mean"])(
    "'%s' is a sentence, not a centre name",
    (t) => expect(looksLikeCentreName(t)).toBe(false),
  );

  it.each(["Apollo, Greams Road", "Meenakshi Mission Hospital", "I want Apollo Hospital in Madurai", "Vadamalayan", "Dr Mohan's Diabetes Centre, Villapuram"])(
    "'%s' is a centre name",
    (t) => {
      expect(asksForSuggestion(t)).toBe(false);
      expect(looksLikeCentreName(t)).toBe(true);
    },
  );
});

describe("asked for a booking in so many words", () => {
  it.each(["please book an appointment at PSG hospital", "need a slot tomorrow", "booking chahiye", "appointment fix karo"])("yes: %s", (t) =>
    expect(asksToBook(t)).toBe(true),
  );
  it.each(["We are consulting in psg hosiptal", "my mother goes to Apollo", "PSG Hospital, Peelamedu"])("no: %s", (t) =>
    expect(asksToBook(t)).toBe(false),
  );
});
