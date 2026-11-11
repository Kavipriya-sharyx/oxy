export enum ConversationState {
  New = "new",
  // --- entry-menu states (plan 12.2) ---
  IntentMenu = "intent_menu",
  NeedDiscovery = "need_discovery",
  OxxyExplain = "oxxy_explain",
  ServiceOrEscalation = "service_or_escalation",
  FollowUpTime = "follow_up_time",
  // --- main flow (plan 12.2) ---
  Discovery = "discovery",
  Routing = "routing",
  PlanFit = "plan_fit",
  CutMediBillsFit = "cut_medi_bills_fit",
  CentreSearch = "centre_search",
  BookingCapture = "booking_capture",
  BookingRecorded = "booking_recorded",
  Activation = "activation",
  AwaitingPayment = "awaiting_payment",
  Closed = "closed",
  // --- global exits ---
  FollowUp = "follow_up",
  Escalated = "escalated",
  Pause = "pause",
  OptedOut = "opted_out",
  // --- legacy values from the first version of the bot. Not used by the state machine;
  // ConversationRepository maps them to the new states when it meets an old row. ---
  Consent = "consent",
  Needs = "needs",
  Recommend = "recommend",
  Booking = "booking",
  Human = "human",
}
