# Oxxy WhatsApp bot: API reference for the CRM team

> **Not the current plan (14 Nov 2026).** The client's CRM will only call our API: no endpoints for the bot to
> call (Part C) and no webhooks (Part B). Use the console's Developer → API documentation (pull model: changes
> feed + update calls) and `CRM_INTEGRATION_PLAN.md`. This file describes the push model kept in the code.

Version 1, 14 Nov 2026. For the developers who connect your CRM (and voice AI) to the Oxxy WhatsApp bot.
Everything below is what the bot does today; each field and rule was checked against the bot's code.

Files that go with this document:

| File | What it is |
|---|---|
| `CRM_API_REFERENCE.md` (this file) | How the three connections work, every webhook and every call the bot makes to your CRM |
| `ACTIONS_API.md` | Full detail of every Actions API call (request, response, errors) |
| `oxxy-api.postman_collection.json` | Ready-made requests for all Actions calls and all webhooks; webhooks are signed for you |

## 1. The three connections

```
           (A) Actions API: you call the bot              header X-Api-Key
 Your CRM  ───────────────────────────────────────────▶  Oxxy bot
 / voice AI ◀───────────────────────────────────────────
           (C) Bot -> CRM: the bot calls your API        header Authorization: Bearer <CRM API key>

 Your CRM  ───────────────────────────────────────────▶  Oxxy bot
           (B) Webhooks: you tell the bot what changed   header X-CRM-Signature (HMAC)
```

| | Direction | Who builds it | Needed when |
|---|---|---|---|
| **A. Actions API** | CRM / voice AI → bot | Bot (ready) | You want to look up customers, search centres, book, schedule follow-ups, send approved content, escalate, start a WhatsApp chat |
| **B. Webhooks** | CRM → bot | You send them | Your sales team confirms bookings or verifies payments in your CRM |
| **C. Bot → CRM** | Bot → CRM | You build the endpoints | You want every customer, booking, task and activation to appear in your CRM automatically |

You can start with A only. B and C are switched on together on the bot (`CRM sync`); until then the bot's own
console is used for confirming bookings and payments, and nothing is lost: every record is kept and can be sent
later.

## 2. What we give you, what we need from you

| We give you | Where it comes from |
|---|---|
| Base URL, e.g. `https://<bot-host>` (HTTPS) | Bot team |
| An **API key** per system and environment (`oxk_live_…` / `oxk_test_…`) | Console → Admin → Developer → Generate key |
| The **webhook secret** (`whsec_…`) for signing webhooks | Console → Admin → Developer → Make secret |
| The webhook URL: `https://<bot-host>/api/v1/Crm/Webhook` | — |

| We need from you (only for C) | Used for |
|---|---|
| Your API base URL, e.g. `https://crm.example.com/api/v1` | `CRM_BASE_URL` on the bot |
| An API key the bot sends as `Authorization: Bearer <key>` | `CRM_API_KEY` on the bot |
| A sandbox first, production later | Testing |

Keys and secrets are shown once when they are made. Send them through a password manager, never by email or
chat. Keep them on your servers only (never in a browser or mobile app). A key can be revoked at any time in the
console; calls with it are refused at once.

## 3. Rules the bot always applies

Whatever you send, the bot keeps these rules. Your call is refused with a clear error when it would break one.

- **No message to an opted-out customer** (STOP). Safety replies still go out.
- **Quiet hours:** no proactive message between 21:00 and 09:00 IST.
- **WhatsApp 24-hour window:** outside it, only approved templates can be sent.
- **Bookings are requests:** a booking is always `pending_confirmation` until your sales team confirms it
  (webhook `booking.confirmed`). Booking dates: today + 3 days to the same date + 6 months, Asia/Kolkata.
- **One product per customer:** once Oxxy or Cut Medi Bills is active, the other is never offered.
- **No health details leave the bot:** medical needs, bills and insurance details stay in the bot. The CRM gets
  the customer, the booking, the task and the activation, never the medical detail.

## 4. Part A: Actions API (you call the bot)

Base: `https://<bot-host>/api/v1/Actions`. Header `X-Api-Key: <key>`. JSON. Answers well under a second; use a
5-second timeout. Full requests, responses and error codes: `ACTIONS_API.md`.

| Call | Method and path | Sends a WhatsApp message? |
|---|---|---|
| lookup_customer | `GET /LookupCustomer?wa_number=` or `?customer_id=` (`&full=true` adds the record) | No |
| search_centres | `GET /SearchCentres?city=` or `?latitude=&longitude=` (`&radius_km=&specialisation=`) | No |
| create_booking_request | `POST /BookingRequests` | No (the customer hears when your team confirms) |
| create_follow_up | `POST /FollowUps` | Later, at the agreed time, as an approved template |
| get_official_plan | `GET /OfficialPlan?product=oxxy&plan=vital[&billing=yearly]` | No |
| send_approved_asset | `POST /SendAsset` | Yes, at once |
| create_escalation | `POST /Escalations` | No |
| start_conversation | `POST /StartConversation` (consented lead, `lead_intro` template) | Yes |
| set_opt_out | `POST /OptOut` | No |
| customer record | `GET /Customers/{customer_id}/Record` | No |

**Which customer.** Send `customer_id` (the bot's id, from `LookupCustomer`) or `wa_number`. Numbers are
normalised: `+91 98400 12345`, `09840012345` and `9840012345` all mean `919840012345`.

**Errors** always look like this, with a real HTTP status. Branch on `code`:

```json
{ "error": true, "status": 409, "code": "quiet_hours", "message": "...", "next_allowed_at": "2026-11-15T03:30:00.000Z" }
```

Status codes: `401` wrong / expired / revoked key, `503` no key exists on the bot yet, `400` bad input,
`403` opted out or content not approved, `404` not found, `409` blocked by a rule (quiet hours, 24-hour
window, duplicate, chat already open), `410` content expired, `422` centre not yet verified.

Example:

```bash
curl -H "X-Api-Key: $KEY" "https://<bot-host>/api/v1/Actions/LookupCustomer?wa_number=919840012345"
```

## 5. Part B: Webhooks (your CRM tells the bot what changed)

### 5.1 Request

```http
POST https://<bot-host>/api/v1/Crm/Webhook
Content-Type: application/json
X-CRM-Timestamp: 1794662400
X-CRM-Signature: sha256=3f1c...e9

{ "event_id": "evt_000123", "event_type": "booking.confirmed", "data": { ... } }
```

| Part | Rule |
|---|---|
| `event_id` | Required. Unique per event. Sending the same `event_id` again is ignored (answer `duplicate`), so retries are safe. |
| `event_type` | Required. One of the events in 5.4. |
| `data` | The event's fields (5.4). |
| `X-CRM-Signature` | Required. Hex HMAC-SHA256 of the **exact raw request body** with the webhook secret. The `sha256=` prefix is optional. |
| `X-CRM-Timestamp` | Required. Unix seconds (milliseconds and ISO 8601 also work). Refused if more than 5 minutes from the bot's clock. |

Sign the bytes you send. If your framework re-serialises the JSON after signing, the signature will not match.

### 5.2 Signing examples

Node.js:

```js
const crypto = require("crypto");
const body = JSON.stringify({ event_id: "evt_000123", event_type: "booking.confirmed", data: { booking_id: "…" } });
const signature = "sha256=" + crypto.createHmac("sha256", process.env.OXXY_WEBHOOK_SECRET).update(body).digest("hex");
await fetch("https://<bot-host>/api/v1/Crm/Webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CRM-Signature": signature,
    "X-CRM-Timestamp": String(Math.floor(Date.now() / 1000)),
  },
  body,
});
```

Python:

```python
import hmac, hashlib, json, time, requests
body = json.dumps({"event_id": "evt_000123", "event_type": "booking.confirmed", "data": {"booking_id": "…"}})
sig = "sha256=" + hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
requests.post("https://<bot-host>/api/v1/Crm/Webhook", data=body, timeout=10, headers={
    "Content-Type": "application/json", "X-CRM-Signature": sig, "X-CRM-Timestamp": str(int(time.time()))})
```

A packaged CRM (Zoho, HubSpot, LeadSquared …) that cannot compute an HMAC: tell us, and we agree another way
before go-live.

### 5.3 Responses

| HTTP | Body | Meaning | What you do |
|---|---|---|---|
| 200 | `{"status":"ok"}` | Stored; it is processed in the background within seconds | Nothing |
| 200 | `{"status":"duplicate"}` | This `event_id` was received before | Nothing |
| 400 | `{"status":"invalid"}` | `event_id` or `event_type` is missing | Fix the request |
| 401 | `{"status":"invalid signature"}` or `{"status":"stale or missing timestamp"}` | Signature or time is wrong | Check the secret, the raw body, your clock |
| 404 | `{"status":"crm disabled"}` | CRM sync is switched off on the bot | Ask the bot team |
| 5xx / timeout | — | Bot unavailable | Retry with the same `event_id` |

`200 ok` means **received**, not "applied". The bot then applies the event; if that fails (for example the
booking id is unknown) it retries 3 times and then shows the event as failed in its console (Admin → CRM sync),
where the bot team sees it. So send correct ids, and retry only on 5xx or timeouts.

### 5.4 Events

Ids: the bot's ids (`booking_id`, `activation_id`, `task_id`, `customer_id`) come in the bot → CRM calls
(Part C) and from the Actions API. If you answered those calls with your own `id`, you may send your id instead
(`crm_booking_id`, `crm_activation_id`, `crm_task_id`, `crm_customer_id`).

| `event_type` | `data` fields | What the bot does |
|---|---|---|
| `booking.confirmed` | `booking_id` or `crm_booking_id`; optional `confirmed_by_crm_user_id` | Booking → confirmed (only from pending); sends the customer the `booking_confirmed` template |
| `booking.rescheduled` | `booking_id` or `crm_booking_id`; **`preferred_date`** `YYYY-MM-DD` (today + 3 days .. + 6 months); optional `preferred_time` | New date / time; sends `booking_rescheduled` |
| `booking.cancelled` | `booking_id` or `crm_booking_id` | Booking → cancelled; sends `booking_cancelled` (the first time in a chat it offers another centre once) or `booking_cancelled_info` |
| `activation.paid` | `activation_id` or `crm_activation_id` | Payment verified: product active, reminders stop, sends `activation_confirmed` |
| `activation.failed` | `activation_id` or `crm_activation_id` | Payment and activation → failed (no message) |
| `activation.refunded` | `activation_id` or `crm_activation_id` | Treated like `activation.failed` |
| `customer.opted_out` | `customer_id` or `crm_customer_id` or `wa_number` (any format) | STOP: all automated messages and scheduled follow-ups stop |
| `customer.owner_changed` | `customer_id`; `crm_user_id` | Logged only |
| `task.completed` | `task_id` or `crm_task_id` | Task → done; a chat waiting for a person goes back to the bot |
| `task.updated` | **`crm_task_id`**; **`task_status`** `open`, `in_progress` or `done` | Task status updated |
| `user.upserted` | **`crm_user_id`**; **`email`**; optional `first_name`, `last_name`, `role` (`User` default) | Your sales user is known to the bot (for "confirmed by"); they cannot log in to the bot's console |

Bold = required. Unknown `event_type` is stored and then fails (visible in the console).

## 6. Part C: Bot → CRM (endpoints you build)

The bot calls your API whenever something happens in a WhatsApp chat. Every call:

- goes to `{CRM_BASE_URL}{path}` with `Authorization: Bearer <your API key>` and `Content-Type: application/json`;
- carries `Idempotency-Key: <uuid>`. The same key = the same call retried: do it once, answer the same;
- has a 5-second timeout;
- should answer `2xx` with `{"id": "<your id>"}` when you create a record. The bot stores your id and accepts
  it in webhooks later;
- is retried after 1, 5, 15 and 60 minutes, then hourly for 24 hours, then parked as "dead" and the bot team
  is alerted. A `4xx` (except 408 and 429) is parked at once: it means the request is wrong, a retry will not help.

`{wa}` below is the WhatsApp number with `+`, URL-encoded (`%2B919840012345`). `{customer}` is your customer id
when the bot has it, otherwise `{wa}`.

### 6.1 upsert_customer: `PUT /customers/{wa}`

Sent when a new customer writes, and again when a field changes. No health details.

```json
{ "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988", "whatsapp": "+919840012345",
  "first_name": "Ravi", "language": "en", "age": 42, "lead_id": null,
  "beneficiary": "self", "city": "Chennai", "locality": "Anna Nagar",
  "need_pattern": "single_expense", "selected_product": "oxxy", "recommended_plan": "vital" }
```

The very first call (a brand-new customer) has only `customer_id` and `wa_number` (digits, no `+`). Answer
`{"id": "<your customer id>"}`.

### 6.2 create_booking_request: `POST /booking-requests`

```json
{ "booking_id": "cd42ad49-5297-4035-aef0-15d7d6e0f5e1",
  "customer_id": "511f3b99-…", "crm_customer_id": "C-1001", "conversation_id": "dbbfcbc1-…",
  "centre": { "centre_id": "2bea8038-…", "name": "Apollo Hospital", "branch": "Greams Road" },
  "specialisation": "cardiology", "preferred_date": "2026-11-25", "preferred_time": "10:30",
  "timezone": "Asia/Kolkata", "selected_product": "oxxy_vital", "activation_status": "none",
  "request_status": "pending_confirmation", "source": "whatsapp_ai" }
```

Your sales team confirms, reschedules or cancels it, then sends the matching webhook (5.4) with `booking_id`.
Answer `{"id": "<your booking id>"}`.

### 6.3 create_task: `POST /tasks`

A job for a person (callback, escalation, payment problem …).

```json
{ "task_id": "ceb9f3b4-…", "type": "escalation", "priority": "high",
  "reason": "Wants the exact discount at a centre", "summary": "Asked about the discount at the chosen centre",
  "callback_window": { "from": "2026-11-15T06:00:00.000Z", "to": "2026-11-15T07:00:00.000Z" },
  "conversation_id": "dbbfcbc1-…", "activation_pitch_allowed": false }
```

| Field | Values |
|---|---|
| `type` | `human_handoff`, `booking_confirm`, `emergency`, `self_harm`, `escalation`, `activation`, `activation_follow_up`, `verify_activation`, `payment_issue`, `holding_message`, `opt_out_open_case`, `privacy_request`, `directory_verification`, `servicing` |
| `priority` | `urgent`, `high`, `normal`, `low` |
| `activation_pitch_allowed` | `false` = do not try to sell on this call |
| `reason`, `callback_window` | Present when known; `callback_window` may be `null` |

Close it with webhook `task.completed` (`task_id`). Answer `{"id": "<your task id>"}`.

### 6.4 create_activation: `POST /activations`

The bot sent the customer the official activation link.

```json
{ "activation_id": "0b7e…", "product": "oxxy", "plan": "vital", "billing": "yearly" }
```

`product`: `oxxy` or `cut_medi_bills` (`plan` is then null). When the payment is verified, send
`activation.paid`; when it fails, `activation.failed`. Answer `{"id": "<your activation id>"}`.

### 6.5 log_event: `POST /customers/{customer}/events`

Milestones for the customer's timeline. `event` says which:

```json
{ "event": "trigger", "customer_id": "511f…", "conversation_id": "dbbf…", "trigger_id": "D",
  "trigger_reason": "centre_search", "conversation_source": "whatsapp_inbound", "asset_ids": [],
  "cta": null, "next_state": "centre_search", "suppression_reason": null, "at": "2026-11-14T10:00:00.000Z" }
```

| `event` | Extra fields |
|---|---|
| `trigger` | `trigger_id` (A–R), `trigger_reason`, `asset_ids`, `cta`, `next_state`, `suppression_reason` |
| `consent` | `health_data_consent` (true / false), `notice_version` |
| `activation_declined` | `activation_pitch_allowed: false` (the customer declined after booking: no more sales follow-up) |

Answer `2xx`; no id needed.

### 6.6 set_opt_out: `POST /customers/{customer}/opt-out`

```json
{ "customer_id": "511f…", "opt_out_at": "2026-11-14T10:00:00.000Z" }
```

The customer wrote STOP. Stop all marketing to them in your systems too.

### 6.7 set_opt_in: `POST /set_opt_in`

```json
{ "customer_id": "511f…", "opt_in_at": "2026-11-14T10:00:00.000Z" }
```

The customer wrote START after STOP. Marketing consent stays off until they agree again.

### 6.8 set_callback_window: `POST /set_callback_window`

```json
{ "task_id": "ceb9…", "crm_task_id": "T-31",
  "callback_window": { "from": "2026-11-15T08:30:00.000Z", "to": "2026-11-15T10:30:00.000Z" } }
```

The customer chose a time for the callback of an existing task.

### 6.9 lookup: `GET /customers?whatsapp=%2B919840012345`

Called on the first message of a chat, so a STOP or an active product in your CRM is respected on WhatsApp too.

| Answer | Meaning |
|---|---|
| `200 {"id": "C-1001", "active_product": "oxxy", "active_plan": "vital", "opted_out": false}` | Known customer. An array or `{"data": {...}}` is also accepted. |
| `404` | Not in your CRM |

`active_product`: `oxxy`, `cut_medi_bills` or `null`.

### 6.10 Nightly check: `GET /reconciliation/open`

Once a night the bot compares the open records on both sides and shows differences in its console.

```json
{ "bookings":    [ { "external_id": "<bot booking_id>", "id": "BK-1001", "status": "pending_confirmation" } ],
  "tasks":       [ { "external_id": "<bot task_id>",    "id": "T-31",    "status": "open" } ],
  "activations": [ { "external_id": "<bot activation_id>", "id": "PAY-55", "status": "link_sent" } ] }
```

Records are matched by `external_id` (the bot's id), else by your `id`. Statuses: bookings
`pending_confirmation` / `confirmed`; tasks `open` / `in_progress`; activations `pending` / `link_sent`.

## 7. Testing and go-live

1. We give you a **staging** URL, a test API key and a test webhook secret.
2. Import `oxxy-api.postman_collection.json`; set `base_url`, `api_key`, `webhook_secret`.
3. Actions: `lookup_customer` → `search_centres` → `create_booking_request` with a test number.
4. Part C (if used): give us your sandbox URL and key; we switch CRM sync on in staging and send a test
   WhatsApp message. Check that the customer, booking and task arrive and that you answered with your ids.
5. Webhooks: send `booking.confirmed` for that booking; the test phone receives the confirmation.
6. Production: new keys and secret (never reuse staging ones), production URLs, one end-to-end test.

## 8. Still to agree with you

- The paths in Part C are our proposal. If your CRM already has different paths, tell us; we map them on our
  side (usually a day's work).
- Whether your CRM can sign webhooks with HMAC (5.2).
- Who confirms bookings and verifies payments: your sales team in the CRM (then B and C are used), or our
  console (then only A).
- Whether your voice AI starts WhatsApp chats (`StartConversation`).
