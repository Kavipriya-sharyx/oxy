# CRM integration plan

Updated 14 Nov 2026. **Decision: the client's CRM only calls our API.** Their team will not build any endpoint
the bot calls, and will not send webhooks. So the bot never pushes to the CRM; the CRM pulls.

## How it works (pull)

| Need | How the CRM does it | Endpoint (header `X-Api-Key`) |
|---|---|---|
| First copy of the data | Page through once | `GET /api/v1/Actions/Customers`, `BookingRequests?status=all`, `Tasks?status=all`, `Activations?payment_status=all` |
| Stay up to date | Poll every 30 to 60 s with the last `seq` it stored | `GET /api/v1/Actions/Changes?after=<seq>&limit=` |
| Sales team confirms / moves / cancels a booking | Call the bot; the bot messages the customer | `POST /BookingRequests/{id}/Confirm`, `/Reschedule`, `/Cancel` |
| Payment verified / failed / refunded | Call the bot (product lock, Trigger P, reminders stop) | `POST /Activations/{id}/Payment` |
| Callback or escalation done | Call the bot (a chat waiting for a person continues) | `POST /Tasks/{id}/Complete` |
| Keep their ids on our records | Optional | `PUT /Customers/{id}/CrmId`, `crm_booking_id` / `crm_activation_id` / `crm_task_id` on the calls |
| Voice AI / CRM talks to customers | The existing customer actions | LookupCustomer, SearchCentres, BookingRequests, FollowUps, OfficialPlan, SendAsset, Escalations, StartConversation, OptOut, Customers/{id}/Record |

The changes feed (`change_event` table, migration `ChangeFeed1794660000000`) gets every change the outbox would
have pushed (customer.updated, booking.created, task.created, activation.created, customer.opted_out / opted_in,
consent.changed, activation.declined, trigger.fired, task.callback_window) plus the state changes (booking.confirmed /
rescheduled / cancelled, activation.paid / failed / refunded, task.completed), written in the same transaction as
the bot change. It is filled whether `CRM_ENABLED` is on or off. Kept 90 days (nightly prune 02:45 IST).

Bot settings for this setup: `CRM_ENABLED=false` (no push, no webhooks), an Actions API key per system
(Admin → Developer). The Oxxy console still works for bookings and payments too; both paths do the same thing.

## What the client gets

- Admin → Developer → **API documentation** (in the console, or "Download guide (HTML)"): every call with fields,
  curl, responses, errors, the change types and sync code in Node and Python.
- The Postman collection (Developer page, or `docs/oxxy-api.postman_collection.json`).
- A sandbox API key, then a production key.

## Still to agree with the client

1. Who in their team confirms bookings and records payments (they use the update calls).
2. Which Playbook 17 field groups their CRM stores.
3. Whether their voice AI starts WhatsApp chats (`StartConversation`).

## Not used now (kept in the code)

The push model (outbox → CRM REST endpoints, signed CRM webhooks at `POST /api/v1/Crm/Webhook`, nightly
`/reconciliation/open`) stays in the code behind `CRM_ENABLED=true` in case a later CRM can take calls.
`docs/CRM_API_REFERENCE.md` describes that model.
