# Oxxy Actions API (v1)

The eight actions from Playbook section 17.1, for the in-house CRM, the voice AI and other back-end services.
The bot applies every business rule itself: a caller cannot book outside the date window, send unapproved
content, message an opted-out customer or skip quiet hours. Not for browsers or the console.

| Action (Playbook 17.1) | Method and path | Sends a WhatsApp message? |
|---|---|---|
| lookup_customer | `GET /api/v1/Actions/LookupCustomer` | No |
| search_centres | `GET /api/v1/Actions/SearchCentres` | No |
| create_booking_request | `POST /api/v1/Actions/BookingRequests` | No (the customer hears when the sales team confirms) |
| create_follow_up | `POST /api/v1/Actions/FollowUps` | Later, at the scheduled time, as an approved template |
| get_official_plan | `GET /api/v1/Actions/OfficialPlan` | No |
| send_approved_asset | `POST /api/v1/Actions/SendAsset` | Yes, at once |
| create_escalation | `POST /api/v1/Actions/Escalations` | No |
| set_opt_out | `POST /api/v1/Actions/OptOut` | No |
| customer record (Playbook 17 field groups) | `GET /api/v1/Actions/Customers/{id}/Record` | No |

## 1. Connecting

- **Base URL:** `https://<bot-host>/api/v1/Actions` (local: `http://localhost:8000/api/v1/Actions`).
- **Auth:** every request sends the header `X-Api-Key: <ACTIONS_API_KEY>`. The bot team gives you the key; it
  is set on the bot server as `ACTIONS_API_KEY`. Wrong or missing key: `401`. Key not set on the server: `503`.
  Keep the key server-side only (never in a browser or mobile app). HTTPS only outside local development.
- **Body:** JSON, `Content-Type: application/json`.
- **Timeout:** answer times are well under a second; use a 5-second timeout like the bot does towards the CRM.

## 2. Conventions

**Which customer.** Every customer action takes either `customer_id` (the bot's id, a UUID, returned by
`LookupCustomer`) or `wa_number` (the WhatsApp number). Numbers are normalised: `+91 98400 12345`,
`09840012345` and `9840012345` all mean `919840012345`.

**`source`** (optional on writes) says who made the call, for the trigger log and the KPIs:
`voice_ai`, `whatsapp_inbound`, `whatsapp_outbound`, `human_agent`, `crm` (default).

**Times.** Date-times are ISO 8601. Send them with an offset (`2026-11-20T11:00:00+05:30`) or in UTC
(`2026-11-20T05:30:00Z`); the bot answers in UTC (`...Z`). Booking dates are plain `YYYY-MM-DD` and are
checked in Asia/Kolkata.

**Money.** Rupees as numbers, without GST unless the field says `incl_gst`. `gst_rate` is a fraction (`0.18`).

## 3. Errors

Every error has the same shape and a real HTTP status. Branch on `code`, show `message` to people.

```json
{ "error": true, "status": 400, "code": "date_out_of_window",
  "message": "preferred_date must be between 2026-11-17 and 2027-05-14 (Asia/Kolkata)",
  "reason": "too_soon", "min": "2026-11-17", "max": "2027-05-14" }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `customer_ref_required` | Neither `customer_id` nor `wa_number` was sent |
| 400 | `invalid_id` | An id is not a UUID |
| 400 | `date_out_of_window` | Booking date outside today + 3 days .. + 6 months (also `reason`, `min`, `max`) |
| 400 | `specialisation_required`, `centre_required`, `location_required`, `reason_required`, `summary_required`, `asset_ref_required`, `plan_required` | A required field is missing |
| 400 | `invalid_time`, `time_in_past`, `time_too_far`, `invalid_callback_window`, `invalid_product` | A value is not valid |
| 400 | `quiet_hours` | A follow-up time between 21:00 and 09:00 IST |
| 401 | `unauthorized` | Wrong or missing `X-Api-Key` |
| 403 | `opted_out` | The customer opted out: no follow-ups or content |
| 403 | `privacy_request_open` | Open privacy / deletion request: no follow-ups or content |
| 403 | `asset_not_approved` | The content is not approved for sending |
| 404 | `customer_not_found`, `asset_not_found`, `plan_not_found` | Not found |
| 409 | `duplicate` | That content was already sent in this journey (also `suppression_reason`) |
| 409 | `quiet_hours` | Proactive send between 21:00 and 09:00 IST (also `next_allowed_at`) |
| 409 | `window_closed`, `window_closed_no_template` | Outside the 24-hour window and no approved template |
| 409 | `safety_event_open` | An emergency is open: no commercial content |
| 410 | `asset_expired` | The content is past its `valid_to` |
| 422 | `centre_needs_verification` | The centre is not in the verified directory; a check task was made (also `task_id`) |
| 500 | `internal_error` | Bot-side problem; retry later (writes are safe to retry only where noted) |
| 503 | `not_configured` | The Actions API is switched off on this server |

## 4. Actions

### 4.1 lookup_customer — `GET /LookupCustomer`

Active product, consent, language and open cases. Call it at the start of every conversation.

Query: `wa_number` or `customer_id`; `full=true` also returns the Playbook 17 `record` (section 5).

```bash
curl -H "X-Api-Key: $KEY" "$BASE/LookupCustomer?wa_number=919800000303"
```

```json
{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "crm_customer_id": null, "lead_id": null,
  "first_name": "Test", "wa_number": "919800000303", "language": "en", "timezone": "Asia/Kolkata",
  "active_product": null, "active_plan": null,
  "opted_out": false,
  "consent": { "whatsapp_consent": false, "marketing_consent": false, "health_data_consent": true,
               "consent_notice_version": "dpdp-health-v1", "opt_out_timestamp": null, "privacy_request": null },
  "conversation": { "id": "dbbfcbc1-...", "state": "booking_recorded", "selected_product": null, "recommended_plan": null },
  "open_bookings": [ { "booking_request_id": "a6967c0c-...", "centre": "Sample Care Hospital", "branch": "Anna Nagar",
                       "preferred_date": "2026-11-18", "preferred_time": null, "status": "pending_confirmation" } ],
  "open_activations": [],
  "open_cases": [ { "task_id": "657196b5-...", "type": "booking_confirm", "priority": "normal", "status": "open" } ]
}
```

`active_product` is `oxxy` or `cut_medi_bills` once a payment is verified. One product per customer: never
offer the other. Errors: `400 customer_ref_required | invalid_id`, `404 customer_not_found`.

### 4.2 search_centres — `GET /SearchCentres`

Verified private centres from the approved directory only, at most 5. Never show a centre name that did not
come from here.

Query: `city`, or `latitude` + `longitude` (then nearest first); `radius_km` (1–200, default 10);
`specialisation` (matches the centre's list, case-insensitive); `customer_id` (optional: saves the list shown
as the customer's suggested centres).

```bash
curl -H "X-Api-Key: $KEY" "$BASE/SearchCentres?city=Chennai&specialisation=dental"
```

```json
{
  "count": 3, "radius_km": 10, "note": "Only 3 verified option(s) found.",
  "centres": [
    { "centre_id": "2bea8038-6e63-42cf-be9f-8f1050286069", "name": "Sample Care Hospital", "branch": "Anna Nagar",
      "locality": "Anna Nagar", "city": "Chennai", "type": "multispeciality", "specialisations": ["general", "cardiology"],
      "distance_km": null, "private_status_verified": true, "verified_at": null, "verification_source": null }
  ]
}
```

`note` explains an empty or short list ("No verified option in that area. Ask to widen the radius or name a
centre."). Errors: `400 location_required | invalid_id`.

### 4.3 create_booking_request — `POST /BookingRequests`

The Playbook 17.2 payload. A booking is always `pending_confirmation`; only the sales team confirms it (in the
CRM, then the `booking.confirmed` webhook tells the bot, which messages the customer).

| Field | Required | Notes |
|---|---|---|
| `customer_id` or `wa_number` | yes | |
| `centre.centre_id` | one of | from `SearchCentres` |
| `centre.name` (+ `centre.branch`) | one of | any centre the customer names; matched to the directory |
| `specialisation` | yes | |
| `preferred_date` | yes | `YYYY-MM-DD`, today + 3 days .. same date + 6 months, Asia/Kolkata |
| `preferred_time` | no | `HH:MM` or a window like `10:00-12:00` |
| `selected_product` | no | `oxxy` or `cut_medi_bills` |
| `source` | no | see section 2 |

```bash
curl -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" "$BASE/BookingRequests" -d '{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "centre": { "centre_id": "2bea8038-6e63-42cf-be9f-8f1050286069" },
  "specialisation": "general", "preferred_date": "2026-11-25", "preferred_time": "10:30", "source": "voice_ai" }'
```

`201`:

```json
{ "booking_request_id": "cd42ad49-5297-4035-aef0-15d7d6e0f5e1", "request_status": "pending_confirmation",
  "customer_id": "511f3b99-...", "centre": { "centre_id": "2bea8038-...", "name": "Sample Care Hospital", "branch": "Anna Nagar" },
  "specialisation": "general", "preferred_date": "2026-11-25", "preferred_time": "10:30",
  "timezone": "Asia/Kolkata", "selected_product": null, "source": "voice_ai" }
```

A centre that is not in the verified directory is never refused outright: the bot makes a "check this centre"
task for the team and answers `422 centre_needs_verification` with its `task_id`. Ask the customer for the
address or a landmark; book once the centre is verified.

Errors: `400 date_out_of_window` (with `reason` `too_soon | too_far | invalid_date`, `min`, `max`),
`400 specialisation_required | centre_required | invalid_id`, `404 customer_not_found`,
`422 centre_needs_verification`. Not idempotent: a retry after a timeout can make a second request; call
`LookupCustomer` first to see `open_bookings`.

### 4.4 create_follow_up — `POST /FollowUps`

A follow-up the customer agreed to, at an exact time. The bot sends the approved template then, after checking
consent, open cases and quiet hours again at send time.

| Field | Required | Notes |
|---|---|---|
| `customer_id` or `wa_number` | yes | |
| `scheduled_for` | yes | ISO date-time, at least 1 minute ahead, within 90 days, between 09:00 and 21:00 IST |
| `reason` | yes | what was agreed, e.g. "talk after salary day" (no health details) |
| `selected_product` | no | `oxxy` or `cut_medi_bills` |
| `kind` | no | `agreed_follow_up` (default), `rescue`, `booking_update` |
| `template_name` | no | approved WhatsApp template, default `agreed_follow_up` |
| `source` | no | |

`201`:

```json
{ "follow_up_id": "bf9c2d6b-6428-46d2-8d37-6ce544dff45f", "scheduled_for": "2026-11-15T06:00:00.000Z",
  "kind": "agreed_follow_up", "selected_product": "oxxy", "status": "scheduled" }
```

The conversation moves to FOLLOW_UP and Trigger N is logged. STOP, a privacy request or a verified payment
cancels scheduled follow-ups automatically. Errors: `400 invalid_time | time_in_past | time_too_far |
quiet_hours | reason_required | invalid_product`, `403 opted_out | privacy_request_open`, `404 customer_not_found`.

### 4.5 get_official_plan — `GET /OfficialPlan`

Current price, GST, renewal terms, link and version, only from the bot's plan catalogue. Read it right before
quoting a price or sending a link; never cache it for long.

Query: `product` = `oxxy` (then `plan` = `everyday | vital | thrive | infinity` is required) or `cut_medi_bills`;
`billing` = `monthly | yearly` (optional: without it both are returned).

```bash
curl -H "X-Api-Key: $KEY" "$BASE/OfficialPlan?product=oxxy&plan=vital&billing=yearly"
```

```json
{ "product": "oxxy", "plan": "vital",
  "options": [ { "catalog_id": "5a33483d-...", "billing": "yearly",
                 "price": 20000, "gst_rate": 0.18, "gst_amount": 3600, "price_incl_gst": 23600,
                 "auto_renews": false, "renewal_terms": "[CONFIRM] renewal terms",
                 "activation_time": "[CONFIRM] activation time", "max_saving_pct": 25, "age_limit": 75,
                 "activation_link": "https://example.com/oxxy/activate/vital-yearly",
                 "version": 1, "version_timestamp": "2026-11-13T15:17:30.508Z", "needs_confirmation": true } ] }
```

`needs_confirmation: true` means a value is still marked `[CONFIRM]` by the business team: do not present it to a
customer as final. Errors: `400 invalid_product | plan_required`, `404 plan_not_found`.

### 4.6 send_approved_asset — `POST /SendAsset`

Sends one approved item (website, document, comparison, media, testimonial, policy, article) to the customer
on WhatsApp now. Only items approved in the console (Admin > Approved content) and not past `valid_to`.

| Field | Required | Notes |
|---|---|---|
| `customer_id` or `wa_number` | yes | |
| `asset_id` or `code` | yes | e.g. `code: "trust_pack_en"` |
| `source` | no | `whatsapp_inbound` = a reply inside a live chat (no quiet-hours check); anything else is proactive |

`201`:

```json
{ "asset_send_id": "8c2bd7ed-...", "asset_id": "483f307a-...", "code": "trust_pack_en", "kind": "website",
  "wa_message_id": "wamid.HBgM..." }
```

Rules: once per asset per journey (`409 duplicate`); inside 24 hours of the customer's last message it is sent
as text, outside it only through the asset's approved template (else `409 window_closed_no_template`); never
21:00–09:00 IST for proactive sends (`409 quiet_hours` with `next_allowed_at`); never to opted-out customers,
during a privacy request or while an emergency is open. If the asset belongs to a trigger (A–R), that trigger
is logged with the asset id.

Errors: `400 asset_ref_required | invalid_id`, `403 asset_not_approved | opted_out | privacy_request_open`,
`404 customer_not_found | asset_not_found`, `409 duplicate | quiet_hours | window_closed | window_closed_no_template |
safety_event_open`, `410 asset_expired`.

### 4.7 create_escalation — `POST /Escalations`

A task for a person: priority, reason, callback window and a short summary. The bot stops commercial
messages to the customer until the task is closed (CRM `task.completed` webhook).

| Field | Required | Notes |
|---|---|---|
| `customer_id` or `wa_number` | yes | |
| `reason` | yes | e.g. "wants the exact discount at a centre" |
| `summary` | yes | short transcript summary, **no health details** |
| `priority` | no | `urgent`, `high`, `normal` (default), `low` |
| `callback_window.from`, `.to` | no | ISO date-times, `to` after `from` |
| `source` | no | |

`201`:

```json
{ "task_id": "ceb9f3b4-27a1-4656-9392-aa890c89bde3", "priority": "high", "reason": "Wants the exact discount at a centre",
  "callback_window": { "from": "2026-11-15T06:00:00.000Z", "to": "2026-11-15T07:00:00.000Z" }, "status": "open" }
```

The task also goes to the CRM through the outbox (`create_task`, with `activation_pitch_allowed: false`).
Emergencies and self-harm are not for this endpoint: the bot handles them itself before anything else.
Errors: `400 reason_required | summary_required | invalid_time | invalid_callback_window`, `404 customer_not_found`.

### 4.8 set_opt_out — `POST /OptOut`

Stops all WhatsApp automation for the customer at once: consent updated, conversation OPTED_OUT, scheduled
follow-ups cancelled, CRM told (unless `source` is `crm`, so the CRM's own change is not echoed back).

Body: `customer_id` or `wa_number`; `source` optional.

```json
{ "customer_id": "ccd2b6e7-9f9a-4536-a138-72e41be390d5", "opted_out_at": "2026-11-13T18:39:45.999Z",
  "already_opted_out": false, "cancelled_follow_ups": 0 }
```

Safe to repeat: a second call returns `already_opted_out: true` and changes nothing. There is no opt-in action
yet: after an opt-out the bot stays silent to that customer (safety replies still go out) until the bot team
re-enables them. Errors: `400 customer_ref_required | invalid_id`, `404 customer_not_found`.

## 5. Customer record — `GET /Customers/{customer_id}/Record`

The Playbook 17 record, one object per field group. Health details (need, bill, spend, insurance,
pre-existing) are left out on this API.

```json
{
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
}
```

Eligibility values: `none` (nothing done yet), `done` / `generated` (already happened), `unknown` (not asked yet).
`trigger_path` on a paid activation is the trigger journey before payment, e.g. `A>D>G>H>E`.

## 6. Related, not in this API

- **CRM -> bot webhooks** (`POST /api/v1/Crm/Webhook`, HMAC-SHA256 in `X-CRM-Signature`, unix time in
  `X-CRM-Timestamp`, refused if older than 5 minutes): `booking.confirmed`, `booking.rescheduled`,
  `booking.cancelled`, `activation.paid`, `activation.failed`, `activation.refunded`, `task.completed`,
  `task.updated`, `customer.opted_out`, `customer.owner_changed`, `user.upserted`. Plan section 3.3.
- **Bot -> CRM calls** go through the bot's outbox with retries (1, 5, 15, 60 minutes, then hourly for 24 hours).
  Plan sections 3.2 and 3.4.
- **Interactive docs:** `/swagger` on a development server lists these endpoints too.
