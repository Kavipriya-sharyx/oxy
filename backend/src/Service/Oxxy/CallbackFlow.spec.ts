// Trigger O senior callback: windows inside team hours, the customer's pick, texts
import {
  callbackOptions,
  callbackQuestion,
  callbackSavedText,
  caseRef,
  packWindows,
  parseCallbackChoice,
  showWindow,
  teamHours,
  unpackWindows,
} from "./CallbackFlow";

const H = { start: 10, end: 19, days: [1, 2, 3, 4, 5, 6] }; // Mon-Sat 10 am - 7 pm IST
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("team hours from env", () => {
  it("defaults to 10-19 Mon-Sat; reads TEAM_HOURS / TEAM_DAYS; a broken value falls back", () => {
    expect(teamHours({})).toEqual(H);
    expect(teamHours({ TEAM_HOURS: "9-18", TEAM_DAYS: "1-5" })).toEqual({
      start: 9,
      end: 18,
      days: [1, 2, 3, 4, 5],
    });
    expect(teamHours({ TEAM_HOURS: "09:00-17:00" })).toMatchObject({ start: 9, end: 17 });
    expect(teamHours({ TEAM_HOURS: "18-9", TEAM_DAYS: "x" })).toEqual(H);
  });
});

describe("callbackOptions", () => {
  it("Saturday 11:30: the next three 2-hour windows, at least an hour away, cut at the end hour", () => {
    const o = callbackOptions(ist("2026-11-14T11:30:00"), H); // Sat
    expect(o.map((w) => [w.from.toISOString(), w.to.toISOString()])).toEqual([
      [ist("2026-11-14T14:00:00").toISOString(), ist("2026-11-14T16:00:00").toISOString()],
      [ist("2026-11-14T16:00:00").toISOString(), ist("2026-11-14T18:00:00").toISOString()],
      [ist("2026-11-14T18:00:00").toISOString(), ist("2026-11-14T19:00:00").toISOString()],
    ]);
  });

  it("Saturday evening: skips Sunday, offers Monday", () => {
    const o = callbackOptions(ist("2026-11-14T20:00:00"), H);
    expect(o).toHaveLength(3);
    expect(o[0].from.toISOString()).toBe(ist("2026-11-16T10:00:00").toISOString());
  });

  it("every window lies inside team hours", () => {
    for (const w of callbackOptions(ist("2026-11-17T08:00:00"), H)) {
      const from = new Date(w.from.getTime() + 5.5 * 3600e3).getUTCHours();
      const to = new Date(w.to.getTime() + 5.5 * 3600e3).getUTCHours();
      expect(from).toBeGreaterThanOrEqual(10);
      expect(to).toBeLessThanOrEqual(19);
    }
  });
});

describe("texts", () => {
  const now = ist("2026-11-14T11:30:00");
  const o = callbackOptions(now, H);
  it("question lists three numbered windows", () => {
    const q = callbackQuestion(o, "en", now);
    expect(q).toContain("1) Today, 2-4 pm");
    expect(q).toContain("3) Today, 6-7 pm");
    expect(q).toContain("Reply 1, 2 or 3");
    expect(callbackQuestion(o, "hi", now)).toContain("1) आज, 2-4 pm");
  });
  it("window across noon and tomorrow", () => {
    const w = { from: ist("2026-11-15T10:00:00"), to: ist("2026-11-15T12:00:00") };
    expect(showWindow(w, "en", now)).toBe("Tomorrow, 10 am-12 pm");
  });
  it("saved text carries the window and the reference", () => {
    expect(caseRef("1a2b3c4d-5e6f-0000-0000-000000000000")).toBe("CB-1A2B3C4D");
    expect(callbackSavedText(o[0], "CB-1A2B3C4D", "en", now)).toBe(
      "I have requested a callback for Today, 2-4 pm. Reference: CB-1A2B3C4D.",
    );
  });
  it("pack / unpack round trip", () => {
    expect(unpackWindows(packWindows(o))).toEqual(o);
    expect(unpackWindows("garbage")).toEqual([]);
  });
});

describe("parseCallbackChoice", () => {
  const now = ist("2026-11-14T11:30:00");
  const o = callbackOptions(now, H);
  it.each([
    ["1", 0],
    ["2", 1],
    ["3.", 2],
    ["second", 1],
    ["option 3", 2],
    ["२", 1],
    ["any time", 0],
  ])("'%s' -> option %d", (t, i) =>
    expect(parseCallbackChoice(t, o, now, H)).toEqual({ window: o[i as number] }),
  );

  it("a free time inside team hours -> one-hour window", () => {
    expect(parseCallbackChoice("tomorrow 11 am", o, ist("2026-11-16T09:00:00"), H)).toEqual({
      window: { from: ist("2026-11-17T11:00:00"), to: ist("2026-11-17T12:00:00") },
    });
  });
  it.each(["9 pm", "tomorrow 11 am" /* Sunday */, "7 am"])("'%s' outside team hours", (t) =>
    expect(parseCallbackChoice(t, o, now, H)).toEqual({ outside: true }),
  );
  it.each(["what is the price", "ok thanks", ""])("'%s' -> null (not a time)", (t) =>
    expect(parseCallbackChoice(t, o, now, H)).toBeNull(),
  );
});
