// Integration guide for the client's CRM / voice AI developers, shown on Admin > Developer and downloadable as
// one HTML file. Source of truth: the backend code (Controller/Crm/Actions.controller.ts, Service/Crm/*,
// Service/Crm/CrmPull.service.ts, Service/Crm/ChangeFeed.service.ts) and the client's documents: Playbook section 17 / 17.1 / 17.2,
// Full Development Plan 3.1 to 3.5 and Trigger layer section 13. {{BASE}} is replaced with this server's address.

export interface DocField {
  name: string;
  type: string;
  req?: "yes" | "no" | "one of";
  desc: string;
}

export interface DocEndpoint {
  id: string;
  action: string; // Playbook 17.1 name
  method: "GET" | "POST" | "PUT";
  path: string;
  summary: string;
  whatsapp: string; // does it message the customer
  params?: DocField[]; // query
  body?: DocField[];
  request: string; // curl
  response: string; // JSON
  errors: string;
  notes?: string[];
}

const KEY = '-H "X-Api-Key: $OXXY_API_KEY"';
const JSON_H = '-H "Content-Type: application/json"';

export const DOC_VERSION = "2.0 (14 Nov 2026, your CRM calls the bot only)";

// ---------------------------------------------------------------- 1. Actions API (CRM / voice AI -> bot)
export const ACTIONS: DocEndpoint[] = [
  {
    id: "lookup-customer",
    action: "lookup_customer",
    method: "GET",
    path: "/api/v1/Actions/LookupCustomer",
    summary:
      "Active product, consent, language and open cases of one customer. Call it at the start of every call or chat, before you offer anything.",
    whatsapp: "No",
    params: [
      {
        name: "wa_number",
        type: "string",
        req: "one of",
        desc: "WhatsApp number in any common Indian format: +91 98400 12345, 09840012345, 9840012345.",
      },
      {
        name: "customer_id",
        type: "uuid",
        req: "one of",
        desc: "The bot's customer id (returned by this call).",
      },
      {
        name: "full",
        type: "boolean",
        req: "no",
        desc: "true also returns the Playbook 17 record (see Customer record).",
      },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/LookupCustomer?wa_number=919840012345"`,
    response: `{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "crm_customer_id": "C-10023",
  "lead_id": "L-88812",
  "first_name": "Ravi",
  "wa_number": "919840012345",
  "language": "en",
  "timezone": "Asia/Kolkata",
  "active_product": null,
  "active_plan": null,
  "opted_out": false,
  "consent": {
    "whatsapp_consent": true, "marketing_consent": false, "health_data_consent": true,
    "consent_notice_version": "dpdp-health-v1", "opt_out_timestamp": null, "privacy_request": null
  },
  "conversation": { "id": "dbbfcbc1-…", "state": "booking_recorded", "selected_product": "oxxy", "recommended_plan": "vital" },
  "open_bookings": [
    { "booking_request_id": "a6967c0c-…", "centre": "Apollo Clinic", "branch": "Anna Nagar",
      "preferred_date": "2026-11-25", "preferred_time": "10:30", "status": "pending_confirmation" }
  ],
  "open_activations": [],
  "open_cases": [ { "task_id": "657196b5-…", "type": "booking_confirm", "priority": "normal", "status": "open" } ]
}`,
    errors: "400 customer_ref_required, invalid_id · 404 customer_not_found",
    notes: [
      "active_product is oxxy or cut_medi_bills only after a payment is verified. One product per customer: never offer the other one.",
      "opted_out = true: do not start any automated WhatsApp message.",
    ],
  },
  {
    id: "search-centres",
    action: "search_centres",
    method: "GET",
    path: "/api/v1/Actions/SearchCentres",
    summary:
      "Verified private centres from the approved directory, at most 5. Never show a centre name that did not come from here.",
    whatsapp: "No",
    params: [
      { name: "city", type: "string", req: "one of", desc: "City name, e.g. Chennai." },
      {
        name: "latitude, longitude",
        type: "number",
        req: "one of",
        desc: "Customer location; results are sorted nearest first.",
      },
      {
        name: "radius_km",
        type: "number",
        req: "no",
        desc: "1 to 200, default 10 (with latitude / longitude).",
      },
      {
        name: "specialisation",
        type: "string",
        req: "no",
        desc: "e.g. cardiology, dental, ophthalmology (case-insensitive).",
      },
      {
        name: "customer_id",
        type: "uuid",
        req: "no",
        desc: "Saves the list shown as the customer's suggested centres.",
      },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/SearchCentres?city=Chennai&specialisation=cardiology"`,
    response: `{
  "count": 2,
  "radius_km": 10,
  "note": "Only 2 verified option(s) found.",
  "centres": [
    { "centre_id": "2bea8038-6e63-42cf-be9f-8f1050286069", "name": "Apollo Clinic", "branch": "Anna Nagar",
      "locality": "Anna Nagar", "city": "Chennai", "type": "multispeciality",
      "specialisations": ["general", "cardiology"], "distance_km": null,
      "private_status_verified": true, "verified_at": "2026-11-10", "verification_source": "phone call, 10 Nov" }
  ]
}`,
    errors: "400 location_required, invalid_id",
    notes: [
      'note explains an empty or short list, e.g. "No verified option in that area. Ask to widen the radius or name a centre."',
    ],
  },
  {
    id: "create-booking-request",
    action: "create_booking_request",
    method: "POST",
    path: "/api/v1/Actions/BookingRequests",
    summary:
      "Records a booking request (Playbook 17.2). It is always pending_confirmation: only your sales team confirms it (Confirm call below), and the bot then tells the customer.",
    whatsapp: "No (the customer hears when the sales team confirms)",
    body: [
      {
        name: "customer_id or wa_number",
        type: "uuid / string",
        req: "yes",
        desc: "Which customer.",
      },
      { name: "centre.centre_id", type: "uuid", req: "one of", desc: "From SearchCentres." },
      {
        name: "centre.name (+ centre.branch)",
        type: "string",
        req: "one of",
        desc: "Any centre the customer names; matched against the directory.",
      },
      { name: "specialisation", type: "string", req: "yes", desc: "e.g. cardiology." },
      {
        name: "preferred_date",
        type: "YYYY-MM-DD",
        req: "yes",
        desc: "Today + 3 days up to the same date + 6 months, checked in Asia/Kolkata.",
      },
      { name: "preferred_time", type: "HH:MM or window", req: "no", desc: "10:30 or 10:00-12:00." },
      {
        name: "selected_product",
        type: "oxxy | cut_medi_bills",
        req: "no",
        desc: "The product discussed.",
      },
      { name: "source", type: "string", req: "no", desc: "voice_ai, human_agent, crm (default) …" },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/BookingRequests" -d '{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "centre": { "centre_id": "2bea8038-6e63-42cf-be9f-8f1050286069" },
  "specialisation": "cardiology",
  "preferred_date": "2026-11-25",
  "preferred_time": "10:30",
  "source": "voice_ai"
}'`,
    response: `HTTP 201
{
  "booking_request_id": "cd42ad49-5297-4035-aef0-15d7d6e0f5e1",
  "request_status": "pending_confirmation",
  "customer_id": "511f3b99-…",
  "centre": { "centre_id": "2bea8038-…", "name": "Apollo Clinic", "branch": "Anna Nagar" },
  "specialisation": "cardiology",
  "preferred_date": "2026-11-25",
  "preferred_time": "10:30",
  "timezone": "Asia/Kolkata",
  "selected_product": null,
  "source": "voice_ai"
}`,
    errors:
      "400 date_out_of_window (with reason too_soon | too_far | invalid_date, min, max), specialisation_required, centre_required, invalid_id · 404 customer_not_found · 422 centre_needs_verification (with task_id)",
    notes: [
      'A centre that is not in the verified directory is not refused outright: the bot opens a "check this centre" task and answers 422 centre_needs_verification. Ask the customer for the address or a landmark; book once the centre is verified.',
      "Not idempotent: a retry after a timeout can create a second request. Call LookupCustomer first and check open_bookings.",
    ],
  },
  {
    id: "create-follow-up",
    action: "create_follow_up",
    method: "POST",
    path: "/api/v1/Actions/FollowUps",
    summary:
      "A follow-up the customer agreed to, at an exact time. The bot sends the approved template then, after checking consent, open cases and quiet hours again.",
    whatsapp: "Later, at the scheduled time, as an approved template",
    body: [
      {
        name: "customer_id or wa_number",
        type: "uuid / string",
        req: "yes",
        desc: "Which customer.",
      },
      {
        name: "scheduled_for",
        type: "ISO date-time",
        req: "yes",
        desc: "At least 1 minute ahead, within 90 days, between 09:00 and 21:00 IST.",
      },
      {
        name: "reason",
        type: "string",
        req: "yes",
        desc: 'What was agreed, e.g. "talk after salary day". No health details.',
      },
      { name: "selected_product", type: "oxxy | cut_medi_bills", req: "no", desc: "" },
      {
        name: "kind",
        type: "string",
        req: "no",
        desc: "agreed_follow_up (default), rescue, booking_update.",
      },
      {
        name: "template_name",
        type: "string",
        req: "no",
        desc: "Approved WhatsApp template, default agreed_follow_up.",
      },
      { name: "source", type: "string", req: "no", desc: "" },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/FollowUps" -d '{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "scheduled_for": "2026-12-01T11:00:00+05:30",
  "reason": "talk after salary day",
  "selected_product": "oxxy",
  "source": "voice_ai"
}'`,
    response: `HTTP 201
{ "follow_up_id": "bf9c2d6b-6428-46d2-8d37-6ce544dff45f", "scheduled_for": "2026-12-01T05:30:00.000Z",
  "kind": "agreed_follow_up", "selected_product": "oxxy", "status": "scheduled" }`,
    errors:
      "400 invalid_time, time_in_past, time_too_far, quiet_hours, reason_required, invalid_product · 403 opted_out, privacy_request_open · 404 customer_not_found",
    notes: [
      "STOP, a privacy request or a verified payment cancels scheduled follow-ups automatically.",
    ],
  },
  {
    id: "get-official-plan",
    action: "get_official_plan",
    method: "GET",
    path: "/api/v1/Actions/OfficialPlan",
    summary:
      "Current price, GST, renewal terms, activation time, link and version from the bot's plan catalogue. Read it right before quoting a price or sending a link; do not cache it.",
    whatsapp: "No",
    params: [
      { name: "product", type: "oxxy | cut_medi_bills", req: "yes", desc: "" },
      {
        name: "plan",
        type: "everyday | vital | thrive | infinity",
        req: "yes",
        desc: "Required when product = oxxy.",
      },
      {
        name: "billing",
        type: "monthly | yearly",
        req: "no",
        desc: "Without it both are returned.",
      },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/OfficialPlan?product=oxxy&plan=vital&billing=yearly"`,
    response: `{
  "product": "oxxy",
  "plan": "vital",
  "options": [
    { "catalog_id": "5a33483d-…", "billing": "yearly",
      "price": 20000, "gst_rate": 0.18, "gst_amount": 3600, "price_incl_gst": 23600,
      "auto_renews": false, "renewal_terms": "…", "activation_time": "…",
      "max_saving_pct": 25, "age_limit": 75,
      "activation_link": "https://www.oxxy.in/…",
      "version": 3, "version_timestamp": "2026-11-13T15:17:30.508Z", "needs_confirmation": false }
  ]
}`,
    errors: "400 invalid_product, plan_required · 404 plan_not_found",
    notes: [
      "needs_confirmation = true means a value is still missing (returned as null): do not quote that plan as final; hand over to a person.",
      "Money is in rupees, without GST unless the field says incl_gst. gst_rate is a fraction (0.18).",
    ],
  },
  {
    id: "send-approved-asset",
    action: "send_approved_asset",
    method: "POST",
    path: "/api/v1/Actions/SendAsset",
    summary:
      "Sends one approved item (website, document, comparison, media, testimonial, policy, article) to the customer on WhatsApp now. Only items approved in the console and not past their end date.",
    whatsapp: "Yes, at once",
    body: [
      { name: "customer_id or wa_number", type: "uuid / string", req: "yes", desc: "" },
      {
        name: "asset_id or code",
        type: "uuid / string",
        req: "yes",
        desc: "e.g. code = trust_pack_en (Admin > Approved content).",
      },
      {
        name: "source",
        type: "string",
        req: "no",
        desc: "whatsapp_inbound = reply inside a live chat (no quiet-hours check); anything else is proactive.",
      },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/SendAsset" -d '{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "code": "trust_pack_en",
  "source": "crm"
}'`,
    response: `HTTP 201
{ "asset_send_id": "8c2bd7ed-…", "asset_id": "483f307a-…", "code": "trust_pack_en", "kind": "website",
  "wa_message_id": "wamid.HBgM…" }`,
    errors:
      "400 asset_ref_required, invalid_id · 403 asset_not_approved, opted_out, privacy_request_open · 404 customer_not_found, asset_not_found · 409 duplicate, quiet_hours (with next_allowed_at), window_closed, window_closed_no_template, safety_event_open · 410 asset_expired",
    notes: [
      "Once per asset per journey. Inside 24 hours of the customer's last message it goes as text; outside it only through the asset's approved template.",
      "Never between 21:00 and 09:00 IST for proactive sends, never to opted-out customers, during a privacy request or while an emergency is open.",
    ],
  },
  {
    id: "create-escalation",
    action: "create_escalation",
    method: "POST",
    path: "/api/v1/Actions/Escalations",
    summary:
      "A task for a person: priority, reason, callback window and a short summary. The bot stops commercial messages to the customer until the task is closed (Complete call below).",
    whatsapp: "No",
    body: [
      { name: "customer_id or wa_number", type: "uuid / string", req: "yes", desc: "" },
      {
        name: "reason",
        type: "string",
        req: "yes",
        desc: 'e.g. "wants the exact discount at a centre".',
      },
      {
        name: "summary",
        type: "string",
        req: "yes",
        desc: "Short transcript summary. No health details.",
      },
      {
        name: "priority",
        type: "urgent | high | normal | low",
        req: "no",
        desc: "Default normal.",
      },
      {
        name: "callback_window.from / .to",
        type: "ISO date-time",
        req: "no",
        desc: "to must be after from.",
      },
      { name: "source", type: "string", req: "no", desc: "" },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/Escalations" -d '{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "reason": "Wants the exact discount at a centre",
  "summary": "Asked about the discount at the chosen centre",
  "priority": "high",
  "callback_window": { "from": "2026-11-15T11:30:00+05:30", "to": "2026-11-15T12:30:00+05:30" },
  "source": "voice_ai"
}'`,
    response: `HTTP 201
{ "task_id": "ceb9f3b4-27a1-4656-9392-aa890c89bde3", "priority": "high",
  "reason": "Wants the exact discount at a centre",
  "callback_window": { "from": "2026-11-15T06:00:00.000Z", "to": "2026-11-15T07:00:00.000Z" }, "status": "open" }`,
    errors:
      "400 reason_required, summary_required, invalid_time, invalid_callback_window · 404 customer_not_found",
    notes: [
      "The task appears in the changes feed as task.created and in GET Tasks.",
      "Emergencies and self-harm are not for this endpoint: the bot handles them itself before anything else.",
    ],
  },
  {
    id: "start-conversation",
    action: "start a WhatsApp chat after a call",
    method: "POST",
    path: "/api/v1/Actions/StartConversation",
    summary:
      "Playbook 4.1: your voice AI (or CRM) calls this when a customer on the phone asks for the details on WhatsApp. The bot sends the first message with three buttons: Yes, please / Just send details / Not now, and continues the chat. Send what was already said on the call in context, so the bot does not ask it again.",
    whatsapp:
      "Yes: the approved lead_intro template (or the same buttons as a normal message, see status)",
    body: [
      { name: "wa_number", type: "string", req: "yes", desc: "The customer's WhatsApp number." },
      {
        name: "whatsapp_consent",
        type: "boolean",
        req: "yes",
        desc: "Must be true: the customer agreed on the call to get WhatsApp messages.",
      },
      {
        name: "consent_source",
        type: "string",
        req: "yes",
        desc: "Where the consent was given, e.g. voice_ai, lead_form.",
      },
      { name: "first_name", type: "string", req: "no", desc: "Used in the greeting." },
      {
        name: "lead_id",
        type: "string",
        req: "no",
        desc: "Your lead id, kept on the customer record.",
      },
      { name: "language", type: "en | hi | hinglish", req: "no", desc: "Default en." },
      {
        name: "context.summary",
        type: "string",
        req: "no",
        desc: "What the customer said on the call, in a line or two (up to 1000 characters).",
      },
      {
        name: "context.need",
        type: "string",
        req: "no",
        desc: 'e.g. "dental treatment for mother". Stored encrypted.',
      },
      {
        name: "context.beneficiary",
        type: "string",
        req: "no",
        desc: "self, mother, father, family …",
      },
      {
        name: "context.city, context.locality",
        type: "string",
        req: "no",
        desc: "Used for the centre search.",
      },
      {
        name: "context.specialisation",
        type: "string",
        req: "no",
        desc: "e.g. dental, cardiology.",
      },
      {
        name: "context.selected_product",
        type: "oxxy | cut_medi_bills",
        req: "no",
        desc: "Only if the customer chose one on the call.",
      },
      {
        name: "context.recommended_plan",
        type: "everyday | vital | thrive | infinity",
        req: "no",
        desc: "Oxxy only.",
      },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/StartConversation" -d '{
  "wa_number": "919840012345",
  "first_name": "Ravi",
  "lead_id": "L-88812",
  "whatsapp_consent": true,
  "consent_source": "voice_ai",
  "language": "en",
  "context": {
    "summary": "Asked for Oxxy plan details on WhatsApp; mother needs regular dental care",
    "need": "dental treatment for mother",
    "beneficiary": "mother",
    "city": "Chennai",
    "locality": "Anna Nagar",
    "specialisation": "dental",
    "selected_product": "oxxy"
  }
}'`,
    response: `HTTP 201
{ "customer_id": "511f3b99-…", "conversation_id": "dbbfcbc1-…", "context_saved": true,
  "status": "sent", "wa_message_id": "wamid.HBgM…", "template": "lead_intro" }

Other answers (also 201):
{ …, "status": "queued", "scheduled_for": "2026-11-21T03:30:00.000Z", "template": "lead_intro" }   called between 21:00 and 09:00 IST
{ …, "status": "sent", "template": null }                   the customer wrote within 24 hours: same text and buttons as a normal message
{ …, "status": "context_saved", "reason": "chat_in_progress" }   a chat is going on: not interrupted, the bot uses the context`,
    errors:
      "400 consent_required, customer_ref_required · 403 opted_out · 409 chat_open (an older chat stopped part-way; use FollowUps or SendAsset)",
    notes: [
      "Quiet hours: never refused any more. The message is queued and sent at 09:00 IST; it is skipped if the customer starts chatting before that (the context is still used).",
      "The context is shown to the bot for 7 days. The customer still gets the health-data notice on WhatsApp before any health question.",
      "Do not call it twice for the same call: a second call during quiet hours returns the same queued message.",
    ],
  },
  {
    id: "set-opt-out",
    action: "set_opt_out",
    method: "POST",
    path: "/api/v1/Actions/OptOut",
    summary:
      "Stops all WhatsApp automation for the customer at once: consent updated, conversation OPTED_OUT, scheduled follow-ups cancelled.",
    whatsapp: "No",
    body: [
      { name: "customer_id or wa_number", type: "uuid / string", req: "yes", desc: "" },
      {
        name: "source",
        type: "string",
        req: "no",
        desc: "crm = your own change (the bot does not echo it back to you).",
      },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/OptOut" -d '{ "wa_number": "919840012345", "source": "crm" }'`,
    response: `{ "customer_id": "ccd2b6e7-…", "opted_out_at": "2026-11-13T18:39:45.999Z", "already_opted_out": false, "cancelled_follow_ups": 0 }`,
    errors: "400 customer_ref_required, invalid_id · 404 customer_not_found",
    notes: ["Safe to repeat: a second call returns already_opted_out: true and changes nothing."],
  },
  {
    id: "customer-record",
    action: "customer record (Playbook 17)",
    method: "GET",
    path: "/api/v1/Actions/Customers/{customer_id}/Record",
    summary:
      "The Playbook 17 record, one object per field group, to fill your CRM screen. Health details (condition, bill, spend, insurance, pre-existing) are left out on this API.",
    whatsapp: "No",
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/Customers/511f3b99-db54-4ee4-9db2-d36296b94988/Record"`,
    response: `{
  "identity":    { "lead_id", "customer_id", "crm_customer_id", "first_name", "whatsapp_number", "language", "timezone" },
  "consent":     { "source", "consent_timestamp", "whatsapp_consent", "marketing_consent", "opt_out_timestamp",
                   "privacy_request", "health_data_consent", "consent_notice_version", "retention_until" },
  "need":        { "beneficiary", "age", "specialisation", "urgency", "service_date", "need_pattern" },
  "location":    { "city", "locality", "postcode_if_available", "travel_radius_km" },
  "provider":    { "preferred_centre", "branch", "private_status_verified", "verification_source", "suggested_centres": [] },
  "eligibility": { "centre", "appointment_status", "registration_status", "treatment_status", "bill_status" },
  "routing":     { "selected_product", "recommended_plan", "recommendation_reason", "alternate_product_suppressed", "value_check_passed" },
  "booking":     [ { "booking_request_id", "centre", "branch", "specialisation", "preferred_date", "preferred_time", "status", "created_at" } ],
  "activation":  [ { "activation_id", "product", "plan", "billing", "price", "gst", "renewal_terms_shown",
                     "activation_link_sent_at", "payment_status", "activation_status", "trigger_path" } ],
  "engagement":  { "last_state", "last_intent", "rescue_attempts", "objection", "follow_up_at", "escalation_reason", "outcome" },
  "content":     { "documents_sent": [], "links_sent": [], "comparison_sent": [], "testimonial_or_media_sent": [] },
  "trigger_events": [ { "trigger_id", "trigger_reason", "conversation_source", "asset_ids", "cta", "customer_response",
                        "next_state", "conversion_attribution", "suppression_reason", "created_at" } ]
}`,
    errors: "400 invalid_id · 404 customer_not_found",
    notes: [
      "Eligibility values: none (nothing done yet), done / generated (already happened), unknown (not asked yet).",
      "trigger_path on a paid activation is the trigger journey before payment, e.g. A>D>G>H>E (Trigger layer 13).",
    ],
  },
];

export const ERRORS: [number, string, string][] = [
  [400, "customer_ref_required", "Neither customer_id nor wa_number was sent"],
  [400, "invalid_id", "An id is not a UUID"],
  [
    400,
    "date_out_of_window",
    "Booking date outside today + 3 days .. + 6 months (also reason, min, max)",
  ],
  [
    400,
    "…_required",
    "A required field is missing: specialisation, centre, location, reason, summary, asset_ref, plan",
  ],
  [
    400,
    "invalid_time / time_in_past / time_too_far / invalid_callback_window / invalid_product",
    "A value is not valid",
  ],
  [400, "quiet_hours", "A follow-up time between 21:00 and 09:00 IST"],
  [
    400,
    "consent_required",
    "StartConversation without whatsapp_consent: true and a consent_source",
  ],
  [401, "unauthorized", "Wrong, expired or revoked X-Api-Key"],
  [403, "opted_out", "The customer opted out: no follow-ups or content"],
  [403, "privacy_request_open", "Open privacy / deletion request: no follow-ups or content"],
  [403, "asset_not_approved", "The content is not approved for sending"],
  [404, "customer_not_found / asset_not_found / plan_not_found", "Not found"],
  [409, "duplicate", "That content was already sent in this journey (also suppression_reason)"],
  [409, "quiet_hours", "Proactive send between 21:00 and 09:00 IST (also next_allowed_at)"],
  [
    409,
    "window_closed / window_closed_no_template",
    "Outside the 24-hour window and no approved template",
  ],
  [409, "safety_event_open", "An emergency is open: no commercial content"],
  [409, "chat_open", "StartConversation while a chat with the customer is already going on"],
  [410, "asset_expired", "The content is past its end date"],
  [
    422,
    "centre_needs_verification",
    "The centre is not in the verified directory; a check task was made (also task_id)",
  ],
  [400, "confirmed_by_required", "Confirm without the sales person's name"],
  [400, "date_required", "Reschedule without preferred_date"],
  [
    400,
    "invalid_status / invalid_result",
    "A status filter or payment result that is not in the list",
  ],
  [404, "booking_not_found / activation_not_found / task_not_found", "No such record"],
  [409, "not_pending", "Confirm on a booking that is not pending (also status_now)"],
  [409, "booking_cancelled", "Reschedule on a cancelled booking"],
  [409, "crm_id_in_use", "That CRM customer id is already linked to another customer"],
  [500, "internal_error", "Bot-side problem; retry later"],
  [503, "not_configured", "No API key exists on the server yet"],
];

// ---------------------------------------------------------------- 2. Keep your CRM in sync (you pull)
// The client's CRM calls only this API: it builds nothing the bot calls. It imports once, then polls the
// changes feed, and makes the sales team's changes (confirm a booking, record a payment, close a task) here.
export const SYNC_ACTIONS: DocEndpoint[] = [
  {
    id: "changes",
    action: "changes feed",
    method: "GET",
    path: "/api/v1/Actions/Changes",
    summary:
      "Every change the bot made, oldest first: new and updated customers, booking requests, tasks, activations, payments, opt-outs, consent and trigger events. Keep the last seq you processed and ask for the ones after it, every 30 to 60 seconds.",
    whatsapp: "No",
    params: [
      {
        name: "after",
        type: "integer",
        req: "no",
        desc: "The last seq you processed. 0 (default) = from the start (the feed keeps 90 days).",
      },
      { name: "limit", type: "integer", req: "no", desc: "1 to 500, default 100." },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/Changes?after=1520&limit=100"`,
    response: `{
  "changes": [
    { "seq": 1521, "type": "booking.created", "customer_id": "511f3b99-…",
      "data": { "booking_id": "cd42ad49-…", "centre": { "name": "Apollo Clinic", "branch": "Anna Nagar" },
                "specialisation": "cardiology", "preferred_date": "2026-11-25", "preferred_time": "10:30",
                "request_status": "pending_confirmation", "selected_product": "oxxy_vital", … },
      "created_at": "2026-11-14T10:00:00.000Z" },
    { "seq": 1522, "type": "task.created", "customer_id": "511f3b99-…",
      "data": { "task_id": "ceb9f3b4-…", "type": "booking_confirm", "priority": "normal", "summary": "…" },
      "created_at": "2026-11-14T10:00:01.000Z" }
  ],
  "next_after": 1522,
  "has_more": false
}`,
    errors: "401 unauthorized",
    notes: [
      "Save next_after only after you have stored the changes. If has_more is true, call again at once with after = next_after.",
      "seq only grows. The same change is never sent twice with a different seq, so processing by seq is safe after a crash.",
      'Changes your own calls made (for example your Confirm) also appear, with source: "crm"; skip them if you like.',
    ],
  },
  {
    id: "list-customers",
    action: "list customers (first import)",
    method: "GET",
    path: "/api/v1/Actions/Customers",
    summary:
      "All customers, oldest first, for the first import into your CRM. After that, use the changes feed.",
    whatsapp: "No",
    params: [
      { name: "limit", type: "integer", req: "no", desc: "1 to 500, default 100." },
      {
        name: "offset",
        type: "integer",
        req: "no",
        desc: "Use next_offset from the previous page; null = last page.",
      },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/Customers?limit=500&offset=0"`,
    response: `{
  "count": 2,
  "next_offset": null,
  "customers": [
    { "customer_id": "511f3b99-…", "crm_customer_id": null, "lead_id": null, "first_name": "Ravi",
      "wa_number": "919840012345", "language": "en", "active_product": "oxxy", "active_plan": "everyday",
      "opted_out": false, "created_at": "2026-11-13T19:54:38.188Z" }
  ]
}`,
    errors: "401 unauthorized",
  },
  {
    id: "link-customer",
    action: "link your customer id",
    method: "PUT",
    path: "/api/v1/Actions/Customers/{customer_id}/CrmId",
    summary:
      "Stores your own customer id on the bot's customer, so lists and the feed carry it (crm_customer_id).",
    whatsapp: "No",
    body: [
      { name: "crm_customer_id", type: "string", req: "yes", desc: "Your id for this customer." },
    ],
    request: `curl -X PUT ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/Customers/511f3b99-db54-4ee4-9db2-d36296b94988/CrmId" -d '{ "crm_customer_id": "C-10023" }'`,
    response: `{ "customer_id": "511f3b99-…", "crm_customer_id": "C-10023" }`,
    errors: "400 crm_customer_id_required, invalid_id · 404 customer_not_found · 409 crm_id_in_use",
  },
  {
    id: "list-bookings",
    action: "list booking requests",
    method: "GET",
    path: "/api/v1/Actions/BookingRequests",
    summary: "Booking requests waiting for your sales team (or any status). Oldest first.",
    whatsapp: "No",
    params: [
      {
        name: "status",
        type: "string",
        req: "no",
        desc: "pending_confirmation (default), confirmed, changed, cancelled, all.",
      },
      { name: "customer_id", type: "uuid", req: "no", desc: "Only this customer's requests." },
      { name: "limit", type: "integer", req: "no", desc: "1 to 500, default 100." },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/BookingRequests?status=pending_confirmation"`,
    response: `{
  "count": 1,
  "booking_requests": [
    { "booking_request_id": "cd42ad49-…", "status": "pending_confirmation",
      "customer": { "customer_id": "511f3b99-…", "first_name": "Ravi", "wa_number": "919840012345", "crm_customer_id": "C-10023" },
      "centre": { "centre_id": "2bea8038-…", "name": "Apollo Clinic", "branch": "Anna Nagar" },
      "specialisation": "cardiology", "preferred_date": "2026-11-25", "preferred_time": "10:30",
      "timezone": "Asia/Kolkata", "crm_booking_id": null, "confirmed_by": null, "created_at": "2026-11-14T10:00:00.000Z" }
  ]
}`,
    errors: "400 invalid_status, invalid_id",
  },
  {
    id: "confirm-booking",
    action: "confirm a booking",
    method: "POST",
    path: "/api/v1/Actions/BookingRequests/{booking_request_id}/Confirm",
    summary:
      "Your sales team confirmed the slot with the centre. The bot marks it confirmed and sends the customer the booking_confirmed WhatsApp template.",
    whatsapp: "Yes, the booking_confirmed template",
    body: [
      {
        name: "confirmed_by",
        type: "string",
        req: "yes",
        desc: "The sales person's name or email (a booking is confirmed only by a named person).",
      },
      {
        name: "crm_booking_id",
        type: "string",
        req: "no",
        desc: "Your id for the booking; stored on the bot's record.",
      },
      { name: "source", type: "string", req: "no", desc: "Default crm." },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/BookingRequests/cd42ad49-5297-4035-aef0-15d7d6e0f5e1/Confirm" -d '{
  "confirmed_by": "Priya S (sales)",
  "crm_booking_id": "BK-1001"
}'`,
    response: `{ "booking_request_id": "cd42ad49-…", "status": "confirmed", "preferred_date": "2026-11-25", "preferred_time": "10:30",
  "crm_booking_id": "BK-1001", "confirmed_by": "Priya S (sales)", "customer_notified": "booking_confirmed template" }`,
    errors:
      "400 confirmed_by_required, invalid_id · 404 booking_not_found · 409 not_pending (with status_now)",
  },
  {
    id: "reschedule-booking",
    action: "reschedule a booking",
    method: "POST",
    path: "/api/v1/Actions/BookingRequests/{booking_request_id}/Reschedule",
    summary:
      "A new date or time agreed with the centre. The bot checks the booking window and sends the booking_rescheduled template.",
    whatsapp: "Yes, the booking_rescheduled template",
    body: [
      {
        name: "preferred_date",
        type: "YYYY-MM-DD",
        req: "yes",
        desc: "Today + 3 days up to the same date + 6 months (Asia/Kolkata).",
      },
      { name: "preferred_time", type: "HH:MM or window", req: "no", desc: "" },
      { name: "crm_booking_id", type: "string", req: "no", desc: "" },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/BookingRequests/cd42ad49-5297-4035-aef0-15d7d6e0f5e1/Reschedule" -d '{
  "preferred_date": "2026-11-28",
  "preferred_time": "15:00"
}'`,
    response: `{ "booking_request_id": "cd42ad49-…", "status": "pending_confirmation", "preferred_date": "2026-11-28",
  "preferred_time": "15:00", "crm_booking_id": "BK-1001", "confirmed_by": null, "customer_notified": "booking_rescheduled template" }`,
    errors:
      "400 date_required, date_out_of_window, invalid_id · 404 booking_not_found · 409 booking_cancelled",
  },
  {
    id: "cancel-booking",
    action: "cancel a booking",
    method: "POST",
    path: "/api/v1/Actions/BookingRequests/{booking_request_id}/Cancel",
    summary:
      "The centre or the customer cancelled. The bot tells the customer; the first cancellation in a chat offers another centre once (YES / NO buttons).",
    whatsapp: "Yes, booking_cancelled or booking_cancelled_info",
    body: [
      {
        name: "reason",
        type: "string",
        req: "no",
        desc: "For your records and the feed (not sent to the customer).",
      },
      { name: "crm_booking_id", type: "string", req: "no", desc: "" },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/BookingRequests/cd42ad49-5297-4035-aef0-15d7d6e0f5e1/Cancel" -d '{ "reason": "centre closed that day" }'`,
    response: `{ "booking_request_id": "cd42ad49-…", "status": "cancelled", "preferred_date": "2026-11-28", "preferred_time": "15:00",
  "crm_booking_id": "BK-1001", "confirmed_by": null, "already_cancelled": false }`,
    errors: "400 invalid_id · 404 booking_not_found",
    notes: ["Safe to repeat: a second call answers already_cancelled: true and sends nothing."],
  },
  {
    id: "list-activations",
    action: "list activations",
    method: "GET",
    path: "/api/v1/Actions/Activations",
    summary:
      "Customers who were sent the official activation link, by payment status. Oldest first.",
    whatsapp: "No",
    params: [
      {
        name: "payment_status",
        type: "string",
        req: "no",
        desc: "pending (default), paid, failed, all.",
      },
      { name: "limit", type: "integer", req: "no", desc: "1 to 500, default 100." },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/Activations?payment_status=pending"`,
    response: `{
  "count": 1,
  "activations": [
    { "activation_id": "7f1c0a52-…", "customer": { "customer_id": "511f3b99-…", "first_name": "Ravi", "wa_number": "919840012345", "crm_customer_id": null },
      "product": "oxxy", "plan": "vital", "billing": "yearly", "price": 20000, "gst_rate": 0.18,
      "link_sent_at": "2026-11-14T10:05:00.000Z", "payment_status": "pending", "activation_status": "pending",
      "crm_activation_id": null, "created_at": "2026-11-14T10:05:00.000Z" }
  ]
}`,
    errors: "400 invalid_status",
  },
  {
    id: "record-payment",
    action: "record a payment result",
    method: "POST",
    path: "/api/v1/Actions/Activations/{activation_id}/Payment",
    summary:
      "Your payment gateway reported the result. paid: the product becomes active (one-product lock), sales reminders stop and the customer gets activation_confirmed. failed / refunded: the lock is released, no message.",
    whatsapp: "paid: the activation_confirmed template · failed / refunded: no",
    body: [
      { name: "result", type: "paid | failed | refunded", req: "yes", desc: "" },
      { name: "crm_activation_id", type: "string", req: "no", desc: "Your payment / order id." },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/Activations/7f1c0a52-0000-4000-8000-000000000000/Payment" -d '{
  "result": "paid",
  "crm_activation_id": "PAY-55"
}'`,
    response: `{ "activation_id": "7f1c0a52-…", "payment_status": "paid", "activation_status": "active", "already": false,
  "customer_notified": "activation_confirmed template" }`,
    errors: "400 invalid_result, invalid_id · 404 activation_not_found",
    notes: [
      "Sending paid twice is harmless: the second call answers already: true and sends nothing.",
    ],
  },
  {
    id: "list-tasks",
    action: "list tasks",
    method: "GET",
    path: "/api/v1/Actions/Tasks",
    summary:
      "Work for your team: callbacks, escalations, booking confirmations, payment issues, centre checks, emergencies. Urgent first.",
    whatsapp: "No",
    params: [
      {
        name: "status",
        type: "string",
        req: "no",
        desc: "not_done (default), open, in_progress, done, all.",
      },
      {
        name: "type",
        type: "string",
        req: "no",
        desc: "Only one task type (see Reference values).",
      },
      { name: "limit", type: "integer", req: "no", desc: "1 to 500, default 100." },
    ],
    request: `curl ${KEY} "{{BASE}}/api/v1/Actions/Tasks?status=not_done"`,
    response: `{
  "count": 1,
  "tasks": [
    { "task_id": "ceb9f3b4-…", "type": "escalation", "priority": "high", "status": "open",
      "reason": "Question needs a person: family / multi-member pricing (Oxxy)",
      "summary": "Asked about pricing for 4 family members",
      "customer": { "customer_id": "511f3b99-…", "first_name": "Ravi", "wa_number": "919840012345", "crm_customer_id": "C-10023" },
      "callback_window": { "from": "2026-11-15T08:30:00.000Z", "to": "2026-11-15T10:30:00.000Z" },
      "crm_task_id": null, "outcome": null, "created_at": "2026-11-14T10:00:00.000Z" }
  ]
}`,
    errors: "400 invalid_status",
  },
  {
    id: "complete-task",
    action: "complete a task",
    method: "POST",
    path: "/api/v1/Actions/Tasks/{task_id}/Complete",
    summary:
      "Your team finished the callback or escalation. If the chat was waiting for a person, the bot may continue with the customer.",
    whatsapp: "No",
    body: [
      {
        name: "outcome",
        type: "string",
        req: "no",
        desc: 'What was done, e.g. "called, will pay on the 1st". No health details.',
      },
      { name: "crm_task_id", type: "string", req: "no", desc: "Your id for the task." },
    ],
    request: `curl -X POST ${KEY} ${JSON_H} "{{BASE}}/api/v1/Actions/Tasks/ceb9f3b4-27a1-4656-9392-aa890c89bde3/Complete" -d '{ "outcome": "called, answered the pricing question" }'`,
    response: `{ "task_id": "ceb9f3b4-…", "status": "done", "already_done": false }`,
    errors: "400 invalid_id · 404 task_not_found",
  },
];

export interface DocFeedEvent {
  type: string;
  when: string;
  data: string; // main data fields
}

export const FEED_EVENTS: DocFeedEvent[] = [
  {
    type: "customer.updated",
    when: "A new customer wrote, or name, language, city, product … changed.",
    data: "customer_id, whatsapp (or wa_number), first_name, language, age, lead_id, beneficiary, city, locality, need_pattern, selected_product, recommended_plan",
  },
  {
    type: "customer.opted_out",
    when: "The customer wrote STOP (or you called OptOut).",
    data: "customer_id, opt_out_at",
  },
  {
    type: "customer.opted_in",
    when: "The customer wrote START after STOP.",
    data: "customer_id, opt_in_at",
  },
  {
    type: "consent.changed",
    when: "Health-data consent given or refused.",
    data: "customer_id, health_data_consent, notice_version, at",
  },
  {
    type: "booking.created",
    when: "A booking request was recorded (pending_confirmation).",
    data: "booking_id, customer_id, crm_customer_id, centre {centre_id, name, branch}, specialisation, preferred_date, preferred_time, timezone, selected_product, activation_status, request_status, source",
  },
  {
    type: "booking.confirmed",
    when: "Confirmed (by your Confirm call or in the Oxxy console).",
    data: "booking_id, crm_booking_id, preferred_date, preferred_time, confirmed_by, source",
  },
  {
    type: "booking.rescheduled",
    when: "New date or time.",
    data: "booking_id, crm_booking_id, preferred_date, preferred_time, source",
  },
  {
    type: "booking.cancelled",
    when: "Cancelled.",
    data: "booking_id, crm_booking_id, reason, source",
  },
  {
    type: "task.created",
    when: "Something needs a person: callback, escalation, booking to confirm, payment issue, centre check, emergency …",
    data: "task_id, type, priority, summary, conversation_id, activation_pitch_allowed (false = do not pitch activation on the call)",
  },
  {
    type: "task.callback_window",
    when: "The customer picked a callback time.",
    data: "task_id, crm_task_id, callback_window {from, to}",
  },
  {
    type: "task.completed",
    when: "A task was closed (your Complete call or the console).",
    data: "task_id, crm_task_id, type, outcome, source",
  },
  {
    type: "activation.created",
    when: "The official activation link was sent.",
    data: "activation_id, product, plan, billing",
  },
  {
    type: "activation.declined",
    when: "The customer declined activation after a booking.",
    data: "customer_id, activation_pitch_allowed: false",
  },
  {
    type: "activation.paid",
    when: "Payment verified.",
    data: "activation_id, crm_activation_id, product, plan, billing, source",
  },
  {
    type: "activation.failed / activation.refunded",
    when: "Payment failed or refunded.",
    data: "activation_id, crm_activation_id, product, source",
  },
  {
    type: "trigger.fired",
    when: "A trigger A to R fired (Trigger layer 13 analytics).",
    data: "customer_id, conversation_id, trigger_id, trigger_reason, conversation_source, asset_ids, cta, next_state, suppression_reason, at",
  },
];

export const SYNC_CODE = {
  node: `// Node.js 18+: run every 30-60 seconds (cron, queue worker …)
async function syncFromOxxy(db) {
  let after = await db.getSetting("oxxy_last_seq") ?? 0;      // your own storage
  for (;;) {
    const res = await fetch(\`{{BASE}}/api/v1/Actions/Changes?after=\${after}&limit=500\`, {
      headers: { "X-Api-Key": process.env.OXXY_API_KEY },
    });
    if (!res.ok) throw new Error("Oxxy " + res.status);         // try again next run
    const page = await res.json();
    for (const c of page.changes) {
      await applyChange(db, c);                                  // upsert by the bot's ids (see the event table)
    }
    after = page.next_after;
    await db.setSetting("oxxy_last_seq", after);                 // only after the changes are stored
    if (!page.has_more) break;
  }
}

async function applyChange(db, c) {
  switch (c.type) {
    case "customer.updated":   return db.upsertCustomer(c.customer_id, c.data);
    case "booking.created":    return db.createBooking(c.data.booking_id, c.data);
    case "booking.confirmed":
    case "booking.rescheduled":
    case "booking.cancelled":  return db.updateBooking(c.data.booking_id, c.type, c.data);
    case "task.created":       return db.createTask(c.data.task_id, c.data);
    case "task.completed":     return db.closeTask(c.data.task_id, c.data);
    case "activation.created": return db.createActivation(c.data.activation_id, c.data);
    case "activation.paid":    return db.markPaid(c.data.activation_id);
    case "customer.opted_out": return db.setOptOut(c.customer_id, true);
    default:                   return db.logEvent(c.customer_id, c.type, c.data);
  }
}`,
  python: `# Python 3: run every 30-60 seconds
import os, requests

def sync_from_oxxy(db):
    after = db.get_setting("oxxy_last_seq") or 0
    while True:
        r = requests.get(
            "{{BASE}}/api/v1/Actions/Changes",
            params={"after": after, "limit": 500},
            headers={"X-Api-Key": os.environ["OXXY_API_KEY"]},
            timeout=10,
        )
        r.raise_for_status()
        page = r.json()
        for c in page["changes"]:
            apply_change(db, c)          # upsert by the bot's ids
        after = page["next_after"]
        db.set_setting("oxxy_last_seq", after)   # only after the changes are stored
        if not page["has_more"]:
            break`,
};

// ---------------------------------------------------------------- 4. Reference lists
export const ENUMS: [string, string][] = [
  ["Product", "oxxy · cut_medi_bills (one per customer)"],
  ["Oxxy plan", "everyday · vital · thrive · infinity"],
  ["Billing", "monthly · yearly"],
  ["Booking status", "pending_confirmation · confirmed · changed · cancelled"],
  ["Task status", "open · in_progress · done"],
  [
    "Task type",
    "human_handoff · booking_confirm · emergency · self_harm · activation · activation_follow_up · verify_activation · payment_issue · escalation · holding_message · opt_out_open_case · privacy_request · directory_verification · servicing",
  ],
  ["Task priority", "urgent · high · normal · low"],
  ["Language", "en · hi · hinglish"],
  ["source", "voice_ai · whatsapp_inbound · whatsapp_outbound · human_agent · crm"],
  [
    "Triggers",
    "A to R (Trigger layer document); each fired trigger appears in the changes feed as trigger.fired",
  ],
  [
    "Conversation state",
    "new · intent_menu · discovery · routing · plan_fit · cut_medi_bills_fit · centre_search · booking_capture · booking_recorded · activation · awaiting_payment · follow_up · escalated · pause · closed · opted_out",
  ],
];

export const HARD_RULES: string[] = [
  "One product per customer: never a second pending or active product (Oxxy or Cut Medi Bills) for the same customer.",
  "Booking dates only from today + 3 days to the same date + 6 months, in Asia/Kolkata.",
  "A booking is confirmed only by a named sales person (confirmed_by on the Confirm call).",
  "Never show the customer a centre name that did not come from SearchCentres or the customer.",
  "Prices, GST, renewal terms and links only from OfficialPlan, never typed by hand.",
  "No WhatsApp marketing to a customer who opted out, during an open privacy request or an open emergency.",
  "Proactive messages only between 09:00 and 21:00 IST.",
  "Never call Oxxy insurance. Never promise a saving or a discount at a specific centre.",
];

export const CHECKLIST: string[] = [
  "Get a sandbox API key from the Oxxy team (one per system and environment) and the sandbox base URL.",
  "Import the Postman collection, set base_url and api_key, and try every call.",
  "First import: page through Customers, then BookingRequests?status=all, Tasks?status=all and Activations?payment_status=all.",
  "Optional: link your ids with PUT Customers/{id}/CrmId and crm_booking_id / crm_activation_id / crm_task_id on your calls.",
  "Start the changes poller (every 30 to 60 seconds); store the last seq only after the changes are saved.",
  "Wire your sales screens to Confirm / Reschedule / Cancel, Payment and Complete.",
  "If your voice AI talks to customers: LookupCustomer first, then SearchCentres, BookingRequests, FollowUps, StartConversation as needed.",
  "Agree the field mapping for the Playbook 17 groups and which custom fields your CRM adds.",
  "Test end to end in the sandbox: a test WhatsApp booking → booking.created in the feed → Confirm → the test phone gets the confirmation.",
  "Go live: production URL and a new production key (never reuse the sandbox one).",
];
