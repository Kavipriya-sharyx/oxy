// Postman collection (v2.1) for the client's developers: every Actions API call, including the CRM sync calls
// (changes feed, lists, booking / payment / task updates). The client's CRM calls only this API; it builds
// nothing the bot calls. Served by the console's Developer page and written to
// docs/oxxy-api.postman_collection.json (scripts/write-postman.ts). No real key is ever put in it.

type Item = Record<string, unknown>;

const HEADERS = [
  { key: "X-Api-Key", value: "{{api_key}}" },
  { key: "Content-Type", value: "application/json" },
];

function url(path: string, query: [string, string][] = []) {
  const qs = query.map(([k, v]) => `${k}=${v}`).join("&");
  return {
    raw: `{{base_url}}/api/v1/Actions/${path}${qs ? `?${qs}` : ""}`,
    host: ["{{base_url}}"],
    path: ["api", "v1", "Actions", ...path.split("/")],
    query: query.map(([key, value]) => ({ key, value })),
  };
}

const get = (name: string, path: string, query: [string, string][], description: string): Item => ({
  name,
  request: { method: "GET", header: [HEADERS[0]], url: url(path, query), description },
});

const post = (name: string, path: string, body: unknown, description: string): Item => ({
  name,
  request: {
    method: "POST",
    header: HEADERS,
    url: url(path),
    body: {
      mode: "raw",
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: "json" } },
    },
    description,
  },
});

const put = (name: string, path: string, body: unknown, description: string): Item => ({
  name,
  request: {
    method: "PUT",
    header: HEADERS,
    url: url(path),
    body: {
      mode: "raw",
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: "json" } },
    },
    description,
  },
});

export function buildPostmanCollection(baseUrl = "https://your-bot-host") {
  return {
    info: {
      name: "Oxxy bot API",
      description:
        "Oxxy bot API for your CRM and voice AI (header X-Api-Key). Your CRM only calls this API: customer actions, " +
        "then CRM sync (import, poll the changes feed, send your sales team's updates). Set base_url and api_key " +
        "(Admin > Developer in the Oxxy console). Full guide: Admin > Developer > API documentation.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "base_url", value: baseUrl },
      { key: "api_key", value: "" },
      { key: "last_seq", value: "0" },
      { key: "booking_request_id", value: "" },
      { key: "activation_id", value: "" },
      { key: "task_id", value: "" },
      { key: "customer_id", value: "" },
      { key: "wa_number", value: "919800000000" },
    ],
    item: [
      {
        name: "1. Customer actions",
        description:
          "Every call needs the header X-Api-Key. Errors: { error, status, code, message }.",
        item: [
          get(
            "lookup_customer",
            "LookupCustomer",
            [["wa_number", "{{wa_number}}"]],
            "Active product, consent, open bookings and cases. Call first; save customer_id.",
          ),
          get(
            "search_centres",
            "SearchCentres",
            [
              ["city", "Chennai"],
              ["specialisation", "cardiology"],
            ],
            "Verified private centres only, at most 5. Or latitude + longitude + radius_km.",
          ),
          post(
            "create_booking_request",
            "BookingRequests",
            {
              customer_id: "{{customer_id}}",
              centre: { centre_id: "<from search_centres>" },
              specialisation: "cardiology",
              preferred_date: "YYYY-MM-DD",
              preferred_time: "10:30",
              source: "voice_ai",
            },
            "Always pending_confirmation. preferred_date: today + 3 days .. + 6 months (Asia/Kolkata).",
          ),
          post(
            "create_follow_up",
            "FollowUps",
            {
              customer_id: "{{customer_id}}",
              scheduled_for: "2026-12-01T11:00:00+05:30",
              reason: "talk after salary day",
              selected_product: "oxxy",
              source: "voice_ai",
            },
            "Between 09:00 and 21:00 IST, within 90 days. Sent later as the approved template.",
          ),
          get(
            "get_official_plan",
            "OfficialPlan",
            [
              ["product", "oxxy"],
              ["plan", "vital"],
              ["billing", "yearly"],
            ],
            "Price, GST, renewal terms, activation link. needs_confirmation=true: not final yet.",
          ),
          post(
            "send_approved_asset",
            "SendAsset",
            { customer_id: "{{customer_id}}", code: "trust_pack_en", source: "crm" },
            "Sends one approved item on WhatsApp now. Once per journey; no proactive sends 21:00-09:00 IST.",
          ),
          post(
            "create_escalation",
            "Escalations",
            {
              customer_id: "{{customer_id}}",
              reason: "Wants the exact discount at a centre",
              summary: "Asked about discount at the chosen centre (no health details)",
              priority: "high",
              source: "voice_ai",
            },
            "A task for a person. No health details in summary.",
          ),
          post(
            "start_conversation",
            "StartConversation",
            {
              wa_number: "{{wa_number}}",
              first_name: "Ravi",
              whatsapp_consent: true,
              consent_source: "voice_ai",
              language: "en",
              context: {
                summary:
                  "Asked for Oxxy plan details on WhatsApp; mother needs regular dental care",
                need: "dental treatment for mother",
                beneficiary: "mother",
                city: "Chennai",
                specialisation: "dental",
                selected_product: "oxxy",
              },
            },
            "After a call: first WhatsApp message with three buttons. context = what was said on the call. status: sent | queued (quiet hours, sent at 09:00 IST) | context_saved (chat in progress).",
          ),
          post(
            "set_opt_out",
            "OptOut",
            { customer_id: "{{customer_id}}", source: "crm" },
            "Stops all WhatsApp automation for the customer. Safe to repeat.",
          ),
          get(
            "customer_record",
            "Customers/{{customer_id}}/Record",
            [],
            "The Playbook 17 record (no health details).",
          ),
        ],
      },
      {
        name: "2. CRM sync (your CRM reads and updates)",
        description:
          "Import once (Customers, BookingRequests?status=all, Tasks?status=all, Activations?payment_status=all), " +
          "then poll Changes every 30-60 s with the last seq you stored. Your sales team's changes go through the update calls.",
        item: [
          get(
            "changes feed",
            "Changes",
            [
              ["after", "{{last_seq}}"],
              ["limit", "100"],
            ],
            "Every bot change after seq, oldest first. Store next_after after saving the changes.",
          ),
          get(
            "list customers",
            "Customers",
            [
              ["limit", "100"],
              ["offset", "0"],
            ],
            "All customers, oldest first, for the first import.",
          ),
          put(
            "link your customer id",
            "Customers/{{customer_id}}/CrmId",
            { crm_customer_id: "C-10023" },
            "Store your own customer id on the bot's customer.",
          ),
          get(
            "list booking requests",
            "BookingRequests",
            [["status", "pending_confirmation"]],
            "status: pending_confirmation (default), confirmed, changed, cancelled, all.",
          ),
          post(
            "confirm a booking",
            "BookingRequests/{{booking_request_id}}/Confirm",
            { confirmed_by: "Priya S (sales)", crm_booking_id: "BK-1001" },
            "The customer gets the booking_confirmed template.",
          ),
          post(
            "reschedule a booking",
            "BookingRequests/{{booking_request_id}}/Reschedule",
            { preferred_date: "YYYY-MM-DD", preferred_time: "15:00" },
            "Today + 3 days .. + 6 months. The customer gets booking_rescheduled.",
          ),
          post(
            "cancel a booking",
            "BookingRequests/{{booking_request_id}}/Cancel",
            { reason: "centre closed that day" },
            "The customer is told; the first time it offers another centre once.",
          ),
          get(
            "list activations",
            "Activations",
            [["payment_status", "pending"]],
            "payment_status: pending (default), paid, failed, all.",
          ),
          post(
            "record a payment result",
            "Activations/{{activation_id}}/Payment",
            { result: "paid", crm_activation_id: "PAY-55" },
            "paid: product active, customer gets activation_confirmed. failed / refunded: no message.",
          ),
          get(
            "list tasks",
            "Tasks",
            [["status", "not_done"]],
            "status: not_done (default), open, in_progress, done, all. Urgent first.",
          ),
          post(
            "complete a task",
            "Tasks/{{task_id}}/Complete",
            { outcome: "called, answered the pricing question" },
            "If the chat was waiting for a person, the bot may continue.",
          ),
        ],
      },
    ],
  };
}
