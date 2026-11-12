import { ConversationState as S } from "@Helper/Enum/ConversationState";
import {
  InvalidTransitionError,
  assertTransition,
  canTransition,
} from "./ConversationStateMachine";

const LEGACY = [S.Consent, S.Needs, S.Recommend, S.Booking, S.Human];
const ALL = Object.values(S) as S[];

// ---- the plan (12.2), written out again here on purpose, independent of the implementation ----
const NORMAL = [
  S.New,
  S.IntentMenu,
  S.NeedDiscovery,
  S.OxxyExplain,
  S.ServiceOrEscalation,
  S.FollowUpTime,
  S.Discovery,
  S.Routing,
  S.PlanFit,
  S.CutMediBillsFit,
  S.CentreSearch,
  S.BookingCapture,
  S.BookingRecorded,
  S.Activation,
  S.AwaitingPayment,
];
const GLOBAL = [S.FollowUp, S.Escalated, S.Pause, S.OptedOut];

const DIAGRAM: [S, S][] = [
  [S.New, S.Discovery],
  [S.New, S.IntentMenu],
  [S.New, S.NeedDiscovery],
  [S.IntentMenu, S.Discovery],
  [S.IntentMenu, S.NeedDiscovery],
  [S.IntentMenu, S.OxxyExplain],
  [S.IntentMenu, S.ServiceOrEscalation],
  [S.IntentMenu, S.FollowUpTime],
  [S.NeedDiscovery, S.Discovery],
  [S.OxxyExplain, S.Discovery],
  [S.ServiceOrEscalation, S.Escalated],
  [S.FollowUpTime, S.FollowUp],
  [S.Discovery, S.Routing],
  [S.Discovery, S.CentreSearch],
  [S.Routing, S.PlanFit],
  [S.Routing, S.CutMediBillsFit],
  [S.PlanFit, S.Activation],
  [S.CutMediBillsFit, S.Activation],
  [S.CentreSearch, S.BookingCapture],
  [S.BookingCapture, S.BookingRecorded],
  [S.BookingRecorded, S.Activation],
  [S.BookingRecorded, S.Closed],
  [S.Activation, S.AwaitingPayment],
  [S.AwaitingPayment, S.Closed],
];

function expectedPairs(): Set<string> {
  const set = new Set<string>();
  const add = (a: S, b: S) => set.add(`${a}>${b}`);
  DIAGRAM.forEach(([a, b]) => add(a, b));
  for (const from of [...NORMAL, S.FollowUp]) {
    add(from, S.CentreSearch);
    add(from, S.BookingCapture);
    GLOBAL.forEach((g) => add(from, g));
  }
  add(S.FollowUp, S.Closed);
  NORMAL.forEach((n) => add(S.FollowUp, n));
  add(S.Escalated, S.Pause); // emergency while escalated
  add(S.Escalated, S.OptedOut); // STOP while escalated
  add(S.Pause, S.OptedOut); // STOP while paused
  return set;
}

describe("allowed transitions", () => {
  it.each(DIAGRAM)("%s -> %s is allowed", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("OXXY (PLAN_FIT) and CUT_MEDI_BILLS_FIT are both reached from ROUTING", () => {
    expect(canTransition(S.Routing, S.PlanFit)).toBe(true);
    expect(canTransition(S.Routing, S.CutMediBillsFit)).toBe(true);
  });

  it("BOOKING_RECORDED -> ACTIVATION (accepts) and -> CLOSED (declines)", () => {
    expect(canTransition(S.BookingRecorded, S.Activation)).toBe(true);
    expect(canTransition(S.BookingRecorded, S.Closed)).toBe(true);
  });
});

describe("blocked transitions", () => {
  const blocked: [S, S][] = [
    [S.Closed, S.BookingCapture],
    [S.Closed, S.New],
    [S.OptedOut, S.Discovery],
    [S.New, S.Activation],
    [S.Discovery, S.AwaitingPayment],
    [S.PlanFit, S.BookingRecorded],
    [S.Activation, S.Discovery],
  ];
  it.each(blocked)("%s -> %s throws InvalidTransitionError", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
    try {
      assertTransition(from, to);
    } catch (e) {
      expect(e).toMatchObject({ from, to });
    }
  });
});

describe("rules from the text", () => {
  const open = [...NORMAL, S.FollowUp];

  it("FOLLOW_UP, ESCALATED, PAUSE, OPTED_OUT are reachable from every open state", () => {
    for (const from of open) for (const g of GLOBAL) expect(canTransition(from, g)).toBe(true);
  });

  it("... and never from CLOSED", () => {
    for (const g of GLOBAL) expect(canTransition(S.Closed, g)).toBe(false);
  });

  it("CENTRE_SEARCH and BOOKING_CAPTURE are reachable from any non-terminal state", () => {
    for (const from of open) {
      expect(canTransition(from, S.CentreSearch)).toBe(true);
      expect(canTransition(from, S.BookingCapture)).toBe(true);
    }
    expect(canTransition(S.Closed, S.CentreSearch)).toBe(false);
    expect(canTransition(S.OptedOut, S.BookingCapture)).toBe(false);
  });

  it("CLOSED is terminal: nothing leaves it", () => {
    for (const to of ALL) if (to !== S.Closed) expect(canTransition(S.Closed, to)).toBe(false);
  });

  it("OPTED_OUT is final: no normal transition leaves it", () => {
    for (const to of ALL) if (to !== S.OptedOut) expect(canTransition(S.OptedOut, to)).toBe(false);
  });

  it("PAUSE and ESCALATED can only be left by resolve*(), except the safety exits", () => {
    for (const to of ALL) {
      if (to === S.Pause || to === S.OptedOut) continue; // same state / STOP
      expect(canTransition(S.Pause, to)).toBe(false);
      if (to !== S.Escalated) expect(canTransition(S.Escalated, to)).toBe(false);
    }
    expect(canTransition(S.Pause, S.OptedOut)).toBe(true); // STOP always works
    expect(canTransition(S.Escalated, S.Pause)).toBe(true); // an emergency always works
    expect(canTransition(S.Escalated, S.OptedOut)).toBe(true);
    expect(canTransition(S.Escalated, S.Discovery)).toBe(false);
    expect(canTransition(S.Pause, S.Discovery)).toBe(false);
  });

  it("FOLLOW_UP -> CLOSED, and back to any normal state", () => {
    expect(canTransition(S.FollowUp, S.Closed)).toBe(true);
    for (const n of NORMAL) expect(canTransition(S.FollowUp, n)).toBe(true);
  });

  it("staying in the same state is allowed (also for CLOSED and OPTED_OUT)", () => {
    for (const s of ALL) expect(canTransition(s, s)).toBe(true);
  });

  it("entry-menu states", () => {
    expect(canTransition(S.NeedDiscovery, S.Discovery)).toBe(true);
    expect(canTransition(S.IntentMenu, S.Discovery)).toBe(true);
    expect(canTransition(S.OxxyExplain, S.Discovery)).toBe(true);
    expect(canTransition(S.ServiceOrEscalation, S.Escalated)).toBe(true);
    expect(canTransition(S.FollowUpTime, S.FollowUp)).toBe(true);
    expect(canTransition(S.IntentMenu, S.Routing)).toBe(false);
  });
});

describe("nothing unexpected is allowed", () => {
  it("canTransition agrees with the plan for every pair of states", () => {
    const expected = expectedPairs();
    const wrong: string[] = [];
    for (const from of ALL)
      for (const to of ALL) {
        const want = from === to || expected.has(`${from}>${to}`);
        if (canTransition(from, to) !== want) wrong.push(`${from}>${to} should be ${want}`);
      }
    expect(wrong).toEqual([]);
  });

  it("legacy states take no part in the machine (the repository maps old rows first)", () => {
    for (const l of LEGACY)
      for (const to of ALL)
        if (to !== l) {
          expect(canTransition(l, to)).toBe(false);
          expect(canTransition(to, l)).toBe(false);
        }
  });
});
