// The 13 bot workflows of Full Development Plan section 12, as shown in the approved prototype.
// sim = the WhatsApp messages that walk through the flow (used in the prototype simulator).
/* eslint-disable */
export interface FlowStep {
  a: string; // actor key
  k?: "q" | "end";
  t: string;
  d?: string;
  data?: string;
  crm?: string;
  msg?: string;
  br?: { l: string; t: string; go?: string };
  n?: string;
  go?: string;
}
export interface Flow {
  id: string;
  ref: string;
  title: string;
  sub: string;
  sim?: string[];
  try?: [string, string];
  steps: FlowStep[];
}
export const ACTORS: Record<string, [string, string]> = {
  cust: ["Customer", "var(--info)"],
  code: ["Bot (code)", "var(--accent)"],
  claude: ["Claude", "var(--warn)"],
  crm: ["CRM", "var(--ok)"],
  sales: ["Sales team", "var(--crit)"],
  wa: ["WhatsApp", "var(--muted)"],
};
const PLAN_PATH: string[] = [
  "Hi",
  "1",
  "Yes, that is okay",
  "For my family",
  "Knee check-up",
  "Ongoing support",
  "68",
  "60000",
];
const BOOK_PATH: string[] = [
  "2",
  "Yes, that is okay",
  "Adyar, Chennai",
  "Orthopaedics",
  "1",
  "Yes, please",
  "11 Nov",
  "14 Nov",
  "Morning",
  "No, thanks",
];
export const FLOWS: Flow[] = [
  {
    id: "pipeline",
    ref: "12.1",
    title: "Every inbound message",
    sub: "The same ordered turn runs for every message. Guardrails act before Claude; the validator acts after it.",
    sim: ["Hi", "Is Oxxy insurance?"],
    steps: [
      {
        a: "cust",
        t: "Customer sends a message",
        d: "Any WhatsApp message to the Oxxy number: text, button tap or list choice.",
      },
      {
        a: "wa",
        t: "Webhook received",
        d: "Check X-Hub-Signature-256, reply 200 within 1 second, ignore a repeated wa_message_id, put the message on this customer’s own queue so two turns never overlap.",
        data: "messages (inbound)",
      },
      {
        a: "code",
        k: "q",
        t: "Guardrail hit?",
        d: "Keyword match plus a fast classifier for emergency, self-harm, STOP, privacy, complaint and payment problems.",
        br: {
          l: "yes",
          t: "Fixed approved reply, flags set, CRM task if needed. The turn ends here.",
        },
        n: "no",
      },
      {
        a: "code",
        t: "Load state and context",
        d: "Conversation state, needs, consent, product lock, open booking, last unfinished question and the last 20 messages.",
      },
      {
        a: "claude",
        t: "Claude drafts the reply",
        d: "Cached system prompt + state summary + recent turns. Returns JSON: reply_text, intent, extracted_fields, barrier, proposed_action, needs_human.",
      },
      {
        a: "code",
        k: "q",
        t: "Validator passes?",
        d: "Prices and plan names only from the database, never “insurance”, one product, one call to action, button and list limits, neutral savings line.",
        br: {
          l: "no",
          t: "Retry once with the broken rule named. A second failure sends a holding reply and creates a human task.",
        },
        n: "yes",
      },
      {
        a: "code",
        t: "Run actions in code",
        d: "Save extracted fields, then routing, booking, activation and at most one trigger. Prices, links and disclosures come from fixed templates.",
        data: "needs, booking_requests, trigger_events",
      },
      {
        a: "code",
        k: "end",
        t: "Compose and send",
        d: "Inside 24 hours of the customer’s last message: a session message. Outside: an approved template only. Every message and event is logged.",
        msg: "No. Oxxy is not insurance and does not pay or reimburse claims. It is a healthcare-savings and support service…",
      },
    ],
  },
  {
    id: "plan",
    ref: "12.3",
    title: "New customer to a plan",
    sub: "Discovery asks one question per turn, routing picks exactly one product, and the value check decides whether to show a saving.",
    sim: PLAN_PATH,
    steps: [
      {
        a: "cust",
        t: "Picks “Reduce a medical bill”",
        d: "From the 4-row opening list (rows ≤ 24 characters).",
        msg: "Hello! Welcome to Oxxy Health. I can help with medical-bill savings, healthcare-centre options, booking requests and plan activation…",
      },
      {
        a: "code",
        k: "q",
        t: "Agrees to the health-data notice?",
        d: "DPDP: the notice is shown before the first health question. Only a clear yes is stored; an unclear reply asks again.",
        data: "consents (notice v1)",
        br: { l: "no", t: "No health questions are asked. The chat closes politely." },
        n: "yes",
      },
      {
        a: "claude",
        t: "Discovery, one question per turn",
        d: "Order: who it is for, need, need pattern, city, centre, service status, date, insurance, annual spend. Fields already given in free text are skipped.",
        data: "needs",
      },
      {
        a: "code",
        k: "q",
        t: "One specific upcoming expense?",
        d: "Routing rules: an active product blocks the other; one known expense whose 30% saving beats the Cut Medi Bills price goes to Cut Medi Bills; everything else is Oxxy.",
        br: { l: "yes", t: "Cut Medi Bills flow.", go: "cmb" },
        n: "ongoing support",
      },
      {
        a: "code",
        t: "Ask age, then yearly spend",
        d: "Age only when choosing between Oxxy plans; spend only when a saving figure is needed.",
      },
      {
        a: "code",
        t: "Pick the plan by need, then age",
        d: "Routine OPD = Everyday · OPD + hospital = Vital · pre-existing or larger expense = Thrive · above age limits or major expense = Infinity. Move up if the age limit rules a plan out (70 / 75 / 80 / none).",
      },
      {
        a: "code",
        k: "q",
        t: "Value check passes?",
        d: "Saving = floor(spend × rate ÷ 500) × 500. It must be more than the yearly price × 1.18 (GST).",
        br: {
          l: "no",
          t: "Try the next cheaper plan; if none passes, give the honest answer.",
          go: "honest",
        },
        n: "yes",
      },
      {
        a: "code",
        t: "Recommend one plan with a saving",
        d: "Triggers E and F. One plan only; all four are shown only if the customer asks to compare.",
        crm: "upsert_customer (recommended_plan, value_check_passed)",
        msg: "You mentioned that your family spends approximately ₹60,000 on healthcare each year. As an easy illustration, the Everyday plan could help you save about ₹12,000 a year…",
      },
      {
        a: "cust",
        k: "end",
        t: "Chooses the next step",
        d: "Official details, the activation link, or booking a centre.",
      },
    ],
  },
  {
    id: "honest",
    ref: "12.3",
    title: "Honest answer when a plan does not pay off",
    sub: "If no plan’s illustrated saving beats its price plus GST, the bot says so and still helps.",
    sim: [
      "Reduce a medical bill",
      "ok",
      "Myself",
      "Fever check-ups",
      "Ongoing support",
      "40",
      "15000",
    ],
    steps: [
      {
        a: "cust",
        t: "Shares a small yearly spend",
        d: "Example: age 40, fever check-ups, about ₹15,000 a year.",
      },
      {
        a: "code",
        k: "q",
        t: "Everyday passes the value check?",
        d: "20% of ₹15,000 = ₹3,000, rounded down to ₹3,000. Price with GST = ₹11,800.",
        br: { l: "yes", t: "Recommend Everyday with the saving." },
        n: "no",
      },
      {
        a: "code",
        t: "No savings close",
        d: "The bot must not show a saving that does not beat the price. Break-even for Everyday is ₹59,000 a year.",
      },
      {
        a: "code",
        k: "end",
        t: "Honest message, then help",
        d: "Shows the plan and price, says it may not pay for itself, and offers centre search or a booking at no cost.",
        msg: "At about ₹15,000 a year, it may not pay for itself in savings alone. I can still help you find a centre or take a booking request at no cost.",
      },
    ],
  },
  {
    id: "booking",
    ref: "12.4",
    title: "Centre search and booking request",
    sub: "Any verified private centre, with or without activation. Every request stays pending until the sales team confirms it.",
    sim: BOOK_PATH,
    steps: [
      {
        a: "cust",
        t: "Asks for a centre",
        d: "“Find or book a centre”, from the menu or from any state.",
      },
      {
        a: "claude",
        t: "Ask city, then specialisation",
        d: "One missing detail per turn. Health-data consent first if not yet given.",
      },
      {
        a: "code",
        t: "Search the approved directory",
        d: "PostGIS radius search; active, verified, private centres only; up to 5, ranked by relevance and distance. Tie-ups are never mentioned (Trigger D).",
        msg: "Based on Adyar, Chennai and your need for Orthopaedics, here are suitable private healthcare-centre options: 1. Adyar Ortho Care…",
      },
      {
        a: "cust",
        k: "q",
        t: "Picks one of the list?",
        d: "Reply 1–5 or the name of another centre.",
        br: {
          l: "other centre",
          t: "Check the directory; if not found, ask for an address and create a verification task. Never refuse a centre just because it was not suggested.",
        },
        n: "yes",
      },
      {
        a: "code",
        t: "Offer the booking",
        d: "“May I do your booking at the healthcare centre of your choice?” (Trigger G). Then date and time window, one per turn.",
      },
      {
        a: "code",
        k: "q",
        t: "Date inside the window?",
        d: "Today + 3 days to the same date + 6 months, in Asia/Kolkata.",
        br: { l: "no", t: "Reply with the allowed range and ask again." },
        n: "yes",
      },
      {
        a: "code",
        t: "Save as pending",
        d: "booking_requests with status pending_confirmation, in the same transaction as an outbox row.",
        data: "booking_requests, crm_outbox",
        crm: "create_booking_request",
      },
      {
        a: "code",
        t: "Tell the customer it is pending",
        d: "Trigger H, then one soft activation suggestion with the neutral savings line. Never sent twice.",
        msg: "Your booking request has been made for 14 Nov 2026 at Morning at Adyar Ortho Care, Adyar… It is pending confirmation.",
      },
      {
        a: "sales",
        k: "end",
        t: "Sales team confirms in the CRM",
        d: "See the next flow.",
        go: "confirm",
      },
    ],
  },
  {
    id: "confirm",
    ref: "12.9 · 3.3",
    title: "Booking confirmation by the sales team",
    sub: "Only a person confirms a booking, in the CRM. The CRM webhook tells the bot, and the bot messages the customer.",
    try: ["/bookings", "Open Booking requests; the CRM webhook confirms them"],
    steps: [
      {
        a: "crm",
        t: "CRM creates a “confirm booking” task",
        d: "For the customer’s sales owner, from the create_booking_request call.",
      },
      { a: "sales", t: "Calls the centre", d: "Confirms the slot or agrees an alternative." },
      {
        a: "sales",
        k: "q",
        t: "Slot available?",
        br: {
          l: "no",
          t: "Marks it changed or not possible. The CRM sends booking.rescheduled or booking.cancelled, and the customer gets that template.",
        },
        n: "yes",
      },
      {
        a: "sales",
        t: "Marks it confirmed in the CRM",
        d: "The console never confirms a booking.",
      },
      {
        a: "crm",
        t: "Sends booking.confirmed",
        d: "Signed with HMAC-SHA256, with a timestamp and an event_id.",
      },
      {
        a: "code",
        t: "Check and store the event",
        d: "Bad signature = 401. A repeated event_id is ignored. Then the booking mirror is set to confirmed.",
        data: "crm_webhook_events, booking_requests",
      },
      {
        a: "code",
        k: "end",
        t: "Send the confirmation template",
        d: "Approved Utility template, allowed outside the 24-hour window.",
        msg: "Your visit to Adyar Ortho Care, Adyar is confirmed for 14 Nov 2026, 10:00–12:00. Reply here if you need to change it.",
      },
    ],
  },
  {
    id: "activation",
    ref: "12.5",
    title: "Activation and payment",
    sub: "One product, one official link, with price, GST and renewal shown first. The bot never handles payment details.",
    sim: [...PLAN_PATH, "Activation link", "DONE"],
    steps: [
      {
        a: "cust",
        t: "Asks for the activation link",
        d: "After the recommendation, or at any point once a product is selected.",
      },
      {
        a: "code",
        k: "q",
        t: "Only one product?",
        d: "selected_product is set and no other product is pending or active.",
        br: { l: "no", t: "Block it and open a servicing task." },
        n: "yes",
      },
      {
        a: "code",
        k: "q",
        t: "Plan catalogue current?",
        d: "Fetch price, GST, renewal terms, activation time, link and version.",
        br: { l: "no", t: "Do not guess: send the callback message and open a task." },
        n: "yes",
      },
      {
        a: "code",
        t: "Disclosure, then the link",
        d: "Approved disclosure for that product, then only that product’s official link. Monthly Cut Medi Bills adds auto-renewal, cancel-anytime and the pre-debit notice.",
        data: "activations (pending), link_sent_at",
        crm: "create_activation",
        msg: "Selected plan: Everyday. Price: ₹10,000 yearly (or ₹999 monthly) plus applicable GST… Reply DONE after completing it.",
      },
      {
        a: "cust",
        k: "q",
        t: "Replies DONE?",
        d: "State AWAITING_PAYMENT.",
        br: {
          l: "other",
          t: "Payment failed or charged twice → escalate to payment support (never ask for OTP or PIN). No reply → Trigger Q reminder once, inside quiet hours.",
        },
        n: "yes",
      },
      {
        a: "code",
        t: "Thank and record",
        d: "Trigger P message. The sales team verifies the payment.",
        crm: "log_event (DONE)",
        msg: "Thank you. Your payment update for Oxxy Everyday has been recorded for verification…",
      },
      {
        a: "crm",
        k: "end",
        t: "activation.paid webhook",
        d: "activation_status = active; the product lock is on, so the other product is never offered.",
      },
    ],
  },
  {
    id: "cmb",
    ref: "12.3 · 12.5",
    title: "Cut Medi Bills",
    sub: "For one specific upcoming expense where nothing has been done at the centre yet.",
    sim: [
      "Reduce a medical bill",
      "yes",
      "Myself",
      "Knee surgery",
      "One upcoming expense",
      "Nothing done yet",
      "1.8 lakh",
      "Annual option",
      "Send the link",
      "DONE",
    ],
    steps: [
      { a: "cust", t: "One upcoming expense", d: "Chosen at the routing question (Trigger I)." },
      {
        a: "code",
        k: "q",
        t: "Nothing done at the centre yet?",
        d: "No appointment, registration, treatment or payment at that centre.",
        br: { l: "already done", t: "Cannot be applied at that centre. Offer another centre." },
        n: "yes",
      },
      {
        a: "cust",
        t: "Shares the estimated bill",
        d: "A rough figure is fine, for example 1.8 lakh.",
      },
      {
        a: "code",
        k: "q",
        t: "30% beats ₹4,999 + GST?",
        d: "30% of the bill must be more than the monthly price with GST (₹5,899).",
        br: { l: "no", t: "Do not suggest it; offer centre or booking help instead." },
        n: "yes",
      },
      {
        a: "code",
        t: "Illustration and options",
        d: "Trigger F at 30%. Monthly ₹4,999 (renews until cancelled) or annual ₹19,999 (one-time).",
        msg: "For an easy illustration, approximately 30% of ₹1,80,000 is ₹54,000…",
      },
      {
        a: "code",
        t: "Disclosure and the Cut Medi Bills link only",
        d: "Oxxy plan links are suppressed: one product per customer. Activation takes 5 to 10 working days.",
        crm: "create_activation",
      },
      {
        a: "cust",
        k: "end",
        t: "Replies DONE",
        d: "Recorded for verification, as in the activation flow.",
        go: "activation",
      },
    ],
  },
  {
    id: "safety",
    ref: "12.7",
    title: "Emergency and self-harm",
    sub: "Runs before Claude and before any sales logic. The reply is fixed approved text.",
    sim: ["I have chest pain", "book a centre"],
    steps: [
      {
        a: "cust",
        t: "Message with an emergency signal",
        d: "Chest pain, difficulty breathing, stroke signs, severe bleeding, seizure, poisoning, or saying it is an emergency.",
      },
      {
        a: "code",
        t: "Guardrail matches first",
        d: "Keyword list plus a classifier. Claude is not called for the reply.",
      },
      {
        a: "code",
        k: "q",
        t: "Self-harm?",
        br: { l: "yes", t: "Reply with Tele-MANAS 14416 (free, 24x7) and 112 if in danger now." },
        n: "no",
      },
      {
        a: "code",
        t: "Emergency reply",
        msg: "This may need immediate medical attention. Please call 112 (or 108 for an ambulance) or go to the nearest emergency department now…",
      },
      {
        a: "code",
        t: "Pause everything commercial",
        d: "State PAUSED; every sales trigger and follow-up is suppressed.",
        crm: "create_task (urgent safety event)",
        data: "safety event (minimum data)",
      },
      {
        a: "sales",
        k: "end",
        t: "A person checks on the customer",
        d: "Only they can close the safety event; until then the bot only repeats the emergency numbers.",
      },
    ],
  },
  {
    id: "optout",
    ref: "12.7",
    title: "Opt-out (STOP)",
    sub: "STOP always wins, even during a human takeover.",
    sim: [...BOOK_PATH, "STOP", "hello"],
    steps: [
      {
        a: "cust",
        t: "Sends STOP",
        d: "Or unsubscribe, do not contact, or a paraphrase that Claude recognises.",
      },
      {
        a: "code",
        k: "q",
        t: "Open booking request?",
        br: {
          l: "yes",
          t: "Booking variant: the request stays recorded and the team contacts the customer only about it.",
        },
        n: "no",
      },
      {
        a: "code",
        t: "Confirm and stop",
        d: "No question in the reply.",
        msg: "Certainly. I have recorded that you do not want further WhatsApp communication…",
        data: "opt_out_at; marketing and follow-up flags off; pending jobs cancelled",
        crm: "set_opt_out",
      },
      {
        a: "code",
        k: "end",
        t: "Later messages get no automated reply",
        d: "Until the customer opts back in.",
      },
    ],
  },
  {
    id: "human",
    ref: "12.9",
    title: "Human takeover and escalation",
    sub: "The sales team chats in the console because the CRM has no WhatsApp inbox.",
    sim: ["talk to a person", "Tomorrow morning"],
    try: ["/live-chat", "Open Conversations → “Take over” on a chat"],
    steps: [
      {
        a: "cust",
        t: "Asks for a person, or the bot is unsure",
        d: "Also complaints, payment problems and facts the bot cannot confirm (Trigger O).",
      },
      {
        a: "code",
        t: "Escalation message and callback time",
        msg: "I want to give you a precise answer rather than guess. I will arrange an authorised callback. What time would be convenient?",
        crm: "create_task",
        data: "state ESCALATED",
      },
      {
        a: "sales",
        t: "Takes over in the console",
        d: "Bot replies stop for this chat; the customer sees the same number.",
      },
      {
        a: "sales",
        t: "Replies from the console",
        d: "Only inside the 24-hour window; logged as human_agent.",
      },
      {
        a: "sales",
        k: "q",
        t: "Resolved?",
        br: { l: "no", t: "Keeps the chat; the CRM task stays open." },
        n: "yes",
      },
      {
        a: "sales",
        t: "Hands back with a note",
        d: "The bot resumes from the stored state; the note goes into the next prompt.",
      },
      { a: "crm", k: "end", t: "task.completed webhook", d: "Lifts the escalation suppression." },
    ],
  },
  {
    id: "followup",
    ref: "12.8",
    title: "Follow-ups and rescue messages",
    sub: "One scheduler checks consent, the 24-hour window, quiet hours and caps at send time.",
    sim: [
      "Reduce a medical bill",
      "ok",
      "Myself",
      "Knee check-up",
      "Ongoing support",
      "40",
      "60000",
      "I am busy",
      "Tomorrow 11:00",
    ],
    try: ["/live-chat", "Follow-ups are sent by the scheduler; replies show in Conversations"],
    steps: [
      {
        a: "code",
        t: "Job scheduled",
        d: "Agreed time (Trigger N), rescue nudge, Trigger Q reminder, or a sales-requested message.",
        data: "follow_ups",
      },
      {
        a: "code",
        k: "q",
        t: "Still allowed to send?",
        d: "Reload consent and suppression at send time.",
        br: {
          l: "no",
          t: "Opted out, privacy request, emergency, complaint or product already active → cancel or skip.",
        },
        n: "yes",
      },
      {
        a: "code",
        k: "q",
        t: "Inside quiet hours (09:00–21:00)?",
        br: { l: "no", t: "Move to 09:00 next morning." },
        n: "yes",
      },
      {
        a: "code",
        k: "q",
        t: "Under the caps?",
        d: "At most 2 rescue attempts in a row and 1 Trigger Q reminder; no duplicate content.",
        br: { l: "no", t: "Skip; wait for the customer to write." },
        n: "yes",
      },
      {
        a: "code",
        t: "Session message or template",
        d: "Inside 24 hours of the customer’s last message: session message. Outside: approved template only.",
      },
      {
        a: "wa",
        k: "end",
        t: "Send",
        d: "If Meta blocks it for a marketing limit, log frequency_cap and do not retry the same day.",
      },
    ],
  },
  {
    id: "crmsync",
    ref: "3.2 – 3.4",
    title: "CRM sync",
    sub: "The CRM keeps the records; the bot never loses a change when the CRM is down.",
    try: ["/crm-sync", "Open CRM sync → “Retry now” on a failed call"],
    steps: [
      {
        a: "code",
        t: "Bot change + outbox row",
        d: "Written in one Postgres transaction. The outbox id is the Idempotency-Key.",
        data: "crm_outbox",
      },
      {
        a: "code",
        t: "Worker sends the call",
        d: "Service token; one of lookup_customer, upsert_customer, create_booking_request, create_task, create_activation, log_event, set_opt_out.",
      },
      {
        a: "crm",
        k: "q",
        t: "CRM accepted?",
        br: {
          l: "no",
          t: "Timeout or 5xx: retry at 1, 5, 15, 60 min, then hourly for 24 h, then dead letter and alert. A 4xx goes straight to dead letter.",
        },
        n: "yes",
      },
      {
        a: "code",
        t: "Store the CRM record id",
        data: "crm_customer_id, crm_booking_id, crm_task_id, crm_activation_id",
      },
      {
        a: "crm",
        t: "Sales change → signed webhook",
        d: "booking.confirmed / rescheduled / cancelled, activation.paid / failed / refunded, task.completed, customer.opted_out, customer.owner_changed.",
      },
      {
        a: "code",
        t: "Verify, dedupe, process",
        d: "HMAC check, store by event_id, process, set processed_at.",
        data: "crm_webhook_events",
      },
      {
        a: "code",
        k: "end",
        t: "Nightly reconciliation 02:00",
        d: "Compares open bookings, activations and opt-outs; mismatches are corrected from the CRM and logged.",
      },
    ],
  },
  {
    id: "errors",
    ref: "12.10",
    title: "Errors and fallbacks",
    sub: "The customer gets a short honest message and a person follows up. The bot never guesses a fact.",
    try: ["/settings", "Open Configuration"],
    steps: [
      {
        a: "claude",
        k: "q",
        t: "Claude answered?",
        br: {
          l: "timeout / 429 / 5xx",
          t: "Retry twice with backoff; then “Give me a moment, a team member will reply shortly” + human task.",
        },
        n: "yes",
      },
      {
        a: "claude",
        k: "q",
        t: "Not a refusal?",
        br: {
          l: "refusal",
          t: "Server-side fallback model; if still refused, holding reply + human task.",
        },
        n: "yes",
      },
      {
        a: "code",
        k: "q",
        t: "Output matches the schema?",
        br: { l: "no", t: "Retry once; holding reply if it repeats." },
        n: "yes",
      },
      {
        a: "code",
        k: "q",
        t: "Validator passes?",
        br: { l: "no, twice", t: "Holding reply + human task; violation logged." },
        n: "yes",
      },
      {
        a: "code",
        k: "q",
        t: "Centre search found something?",
        br: {
          l: "no",
          t: "“I could not find a verified option in that area” and ask to widen the radius.",
        },
        n: "yes",
      },
      {
        a: "wa",
        k: "end",
        t: "Send",
        d: "Temporary WhatsApp errors are retried; outside 24 h a template is used; permanent errors are logged. Every fallback writes an event for the daily audit.",
      },
    ],
  },
];
