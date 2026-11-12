import { ConversationState as S } from "@Helper/Enum/ConversationState";

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Conversation state change not allowed: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

// States a conversation moves through normally (not CLOSED, not the global exits)
export const NORMAL_STATES: readonly S[] = [
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

// Can be entered from (almost) any state: the customer pauses, needs a human, opts out, ...
export const GLOBAL_EXITS: readonly S[] = [S.FollowUp, S.Escalated, S.Pause, S.OptedOut];

// The forward edges of the diagram (plan 12.2)
const FLOW: [S, S[]][] = [
  [S.New, [S.Discovery, S.IntentMenu, S.NeedDiscovery]],
  // the opening list: each row goes to its own state (plan 12.2)
  [S.IntentMenu, [S.Discovery, S.NeedDiscovery, S.OxxyExplain, S.ServiceOrEscalation, S.FollowUpTime]],
  [S.NeedDiscovery, [S.Discovery]],
  [S.OxxyExplain, [S.Discovery]],
  [S.ServiceOrEscalation, [S.Escalated]],
  [S.FollowUpTime, [S.FollowUp]],
  [S.Discovery, [S.Routing, S.CentreSearch]],
  [S.Routing, [S.PlanFit, S.CutMediBillsFit]], // PLAN_FIT = Oxxy
  [S.PlanFit, [S.Activation]],
  [S.CutMediBillsFit, [S.Activation]],
  [S.CentreSearch, [S.BookingCapture]],
  [S.BookingCapture, [S.BookingRecorded]],
  [S.BookingRecorded, [S.Activation, S.Closed]], // accepts activation / declines it
  [S.Activation, [S.AwaitingPayment]],
  [S.AwaitingPayment, [S.Closed]], // payment verified
];

function build(): Map<S, Set<S>> {
  const table = new Map<S, Set<S>>();
  const add = (from: S, to: S) => {
    if (!table.has(from)) table.set(from, new Set());
    table.get(from)!.add(to);
  };

  for (const [from, tos] of FLOW) tos.forEach((to) => add(from, to));

  const open = [...NORMAL_STATES, S.FollowUp]; // every state that is not terminal / parked
  for (const from of open) {
    add(from, S.CentreSearch); // a centre or a booking can be asked at any time
    add(from, S.BookingCapture); //   (the selected product stays unchanged)
    GLOBAL_EXITS.forEach((to) => add(from, to));
  }

  // FOLLOW_UP: closed after two failed rescues or by the sales team, or the customer comes back
  add(S.FollowUp, S.Closed);
  NORMAL_STATES.forEach((to) => add(S.FollowUp, to));

  // Safety first. The plan says every global exit is reachable from any state except CLOSED, but
  // it also says PAUSE / ESCALATED can only be left by the sales team (resolve*) and OPTED_OUT is
  // final. These three are the ones that must still work while parked: an emergency while
  // ESCALATED, and STOP while ESCALATED or PAUSE.
  add(S.Escalated, S.Pause);
  add(S.Escalated, S.OptedOut);
  add(S.Pause, S.OptedOut);

  // Nothing leaves CLOSED. OPTED_OUT, PAUSE and ESCALATED have no other way out here:
  // use optIn() / resolveSafetyEvent() / resolveEscalation() on ConversationRepository.
  return table;
}

const TABLE = build();

// Staying in the same state is always fine (a question interrupts a state: answer it, stay)
export function canTransition(from: S | string, to: S | string): boolean {
  if (from === to) return true;
  return TABLE.get(from as S)?.has(to as S) ?? false;
}

export function assertTransition(from: S | string, to: S | string): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
