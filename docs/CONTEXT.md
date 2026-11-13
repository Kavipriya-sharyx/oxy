# Oxxy WhatsApp bot: working context

Last updated: 14 Nov 2026. Read this first when you pick the project up again (person or AI).
The requirement documents are in this folder: `1_Oxxy_Full_Development_Plan.docx` (the plan; section numbers
below like "12.5" point into it), `2_Oxxy_Prototype.html` (console design + WhatsApp simulator),
`3_Oxxy_3Day_Tasks.xlsx`. The Playbook and the Trigger & Conversion Layer documents are in this folder too; Playbook section 17 /
Trigger layer section 13 are the source of the CRM work. The Actions API reference is `ACTIONS_API.md`.

## Repository and branch

- Repo: github `Kavipriya-sharyx/oxy`. Work branch: `claude/review-fixes`, cut from `origin/dev`.
- Most of the work is committed as `3c53bf0 changes` and `e54ed07 changes` and is on `origin/dev`.
- Not committed yet: the content-trigger wiring (`AssetPicker.ts` + spec, `ChatPipeline`, `Claude`, `TriggerEngine`).
- Stack: NestJS 11 + TypeORM (Postgres) + BullMQ / Redis backend; React 18 + Vite + antd + react-query console.
- Schema: migrations only (`backend/src/Database/Migrations`), run at start-up (`migrationsRun`). In order:
  `Baseline`, `TriggerEventPerJourney`, `CutMediBillsGate`, `CrmFieldGroups`, `TakeoverHandback`, `ConsoleOps`. Generate new ones with
  `npm run migration:generate -- src/Database/Migrations/Name`, then remove the noise lines TypeORM adds
  (`SET DEFAULT '1'`, the `chk_*` checks, `uq_activation_one_open`): those are kept by the Baseline on purpose.

## What the bot does now (all tested)

Order of one turn (`ChatPipeline.service.ts`, plan 12.1):
1. Guardrails first, fixed replies, no Claude: emergency 112/108, self-harm 14416, STOP, privacy, complaint,
   "talk to a person". STOP + chest pain = emergency reply, then opted out.
2. Trigger response is recorded on the last trigger (replied / opted_out / escalated).
3. Opted out = silent. Stale message (a newer one was already answered) = skipped, marked `stale`,
   shown as "not answered (late)" in Conversations (plan 12.10 strict order).
4. Pause / Escalated = silent (human has it).
5. DPDP health-data consent gate, then the 4-row opening list.
6. Waiting answers, no Claude: Cut Medi Bills gate, activation link YES/NO, soft activation YES/NO,
   payment replies after the link (DONE -> Trigger P + verify task; failed -> payment task + escalated;
   not now -> follow-up), insurance ("I have insurance" / "is Oxxy insurance?" -> Trigger B with its approved
   asset; J only on the Cut Medi Bills route), "discount at this hospital?" -> the neutral savings line (fixed).
7. Claude drafts JSON -> ReplyValidator (also rejects any link / web address / e-mail) -> retry once -> else
   holding message + task, state ESCALATED (not PAUSE: PAUSE is the safety state).
8. Code actions: plan pick + value check (floor(spend x rate / 500) x 500 > yearly x 1.18), centre search
   (verified private only, up to 5), booking (Asia/Kolkata +3 days .. +6 months, always pending_confirmation,
   unknown centre -> directory_verification task, never rejected), soft activation once per journey with the
   timing caution, activation disclosure first and the link only after YES, Trigger Q reminder after 4 h.
9. One trigger per turn, decided before the send and recorded after it (TriggerEngine `decide` / `record`).
   D / E / I are recorded only when the list / plan / offer was really shown.
10. Content triggers (`Helper/TriggerReplies.ts`, approved wording, fixed phrases answered before Claude):
   A trust pack = official website + policies + support (Playbook 21, env `OXXY_WEBSITE_URL` etc.) + up to 2
   approved A assets; a repeat in the same journey sends only the links. C = preparedness message + variant
   (elderly / recurring / major / no need), never with an active product, on Cut Medi Bills or after a decline.
   E comparison only when asked: the four plans, one marked (by need + age), no link; "send me the link" with no
   plan yet = one plan by need + age, then the disclosure. F = a new expected bill -> 30% or the recommended
   plan's lower rate. L = approved proof only (nothing approved = no L).
11. Booking request (`BookingFlow.ts`, Playbook 11.1): one question per turn, draft in
   `pending_action = booking:<json>` (specialisation stays in need, encrypted): centre (a number after the centre
   list picks that centre, then the G offer) -> landmark for a centre not in the directory -> specialisation
   (skipped if health consent refused) -> date (20/11/2026, 20 Nov, tomorrow...; 3-day / 6-month window) -> time.
   Then the H summary (date, time, centre, branch, specialisation, pending) + the Playbook 11.2 soft suggestion.
   Unknown centre = directory_verification task, no booking row. A question mid-flow is answered, then the same
   step again. NO to the soft suggestion = outcome activation_declined.
12. Recovery (`RecoveryFlow.ts`): objections (M, Playbook 14) price -> yearly spend + value check; think /
   family / busy -> 3-line summary + two follow-up times; not interested -> summary or close (CLOSED);
   no provider -> locality + radius. Agreed follow-up (N) only when the customer picks a time (also after
   "not now" to the disclosure / link and the "Talk to me later" row): follow_up row + `agreed_follow_up`
   template, 09:00-21:00 IST, <= 90 days. Medicines (K) name only the selected product. Rescue (Playbook 15):
   after a reply in an open sales state, `conversation_rescue_1` after 20 h, then `conversation_rescue_2`
   48 h later, never a third; any customer message cancels it. R (stop / emergency / privacy) and O
   (complaint / person) are recorded from the guardrails. Content triggers A / B / C / L append their approved asset ("Title: link") once per
   journey; no approved asset = the trigger does not fire.

Cut Medi Bills (plan 8.2 / 12.3): explicit ask, or one upcoming expense whose 30% saving beats ₹4,999 x 1.18,
goes through the gate: centre, then 4 YES/NO questions (booked / registered / treatment started / bill),
any YES = not eligible at that centre (remembered), then the expected bill and the value check, then the
offer (monthly or one-year) and the normal disclosure -> link flow. A question during the gate is answered
and the same gate question is asked again.

Console: permission-based roles (18 permission keys, `Helper/Permissions.ts`; Roles page with a matrix;
Super Admin always all; nobody can remove `roles.manage` from their own role). Pages follow the prototype.

## Languages

- Every system text is `{ en, hi, hinglish }` (`Helper/Lang.ts`: `say(X_T, lang)`; functions take the language
  last). English is the approved wording; Hindi / Hinglish are drafts [CONFIRM] (Playbook 19: same price, GST,
  renewal, activation, pending and no-guarantee facts; "Cut Medi Bills" never translated). Hindi uses one
  (masculine) voice, "सकता हूँ", as the older fixed replies do: Playbook 22.2 open decision.
- The reply language follows the customer's last clear message (Devanagari = hi, Hinglish words = hinglish,
  4+ plain English words = en); Claude's `language` field can also set it. Insurance "has it" detection
  (Trigger B / J) works in English, Hinglish and Hindi.

## LLM choice

- Settings -> "AI Provider & Model Keys": **Preferred LLM** (Claude / OpenAI / Gemini) and **Fallback LLM**
  (`LLM_PROVIDER`, `LLM_FALLBACK`; models `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`; keys
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`). Saved in `system_config`, applied at once.
- `ClaudeService` (name kept, it is injected everywhere) is the router: preferred first, then the fallback
  on an error / timeout / bad JSON; a refusal or Gemini safety block is NOT retried elsewhere (a person
  takes over). Preferred without a key = the fallback, else the first provider that has a key. Same prompt
  and JSON for all three; every draft still goes through ReplyValidator.

## Live updates, nightly jobs, ops screens

- Live updates: `GET /api/v1/Console/Live` (server-sent events, JWT in the Authorization header; the console reads
  it with fetch, `hooks/useLiveUpdates.ts`). A TypeORM subscriber (`LiveEventsService`) turns every insert / update
  / delete of a shown table into `{ topic, conversation_id }` (no row data), batched 250 ms, sent over Redis
  pub/sub (`<QUEUE_PREFIX>:live`) to every instance. Polling stays as the fallback (slower now).
- Nightly (BullMQ job schedulers, queue `nightly`): 02:00 IST CRM reconciliation (bot vs
  `GET {CRM_BASE_URL}/reconciliation/open` [CONFIRM contract], lists mismatches, changes nothing; skipped when
  CRM_ENABLED is off), 02:30 IST data retention (`RETENTION_DAYS` [CONFIRM]; unset = skipped). Runs in `job_run`;
  "Run now" on CRM sync / Data requests. Erase keeps the number and opt-out, never runs with an open case.
- Screens: Follow-ups (cancel), WhatsApp templates (`wa_template`, status by hand or "Read status from Meta" with
  `WHATSAPP_WABA_ID`; rejected / paused / disabled templates are refused in WhatsappClient), Plans: propose ->
  a different user approves (`plan_change`, permissions `plans.edit` / `plans.approve`, version + 1).

## Human takeover (Full Plan 12.9)

- Take over = ESCALATED (not PAUSE), `taken_over_by_id` / `taken_over_at` saved. Hand back takes an
  optional note (console box); `handback_note` goes to the prompt as `team_note` for 7 days.

## Backend / CRM layer (Playbook 17, Trigger layer 13)

- All 12 field groups are stored; `CustomerRecordService` returns them grouped (identity, consent, need,
  location, provider, eligibility, routing, booking, activation, engagement, content, trigger_events).
  New tables: `follow_up` (the record; the BullMQ job is only the alarm), `approved_asset`, `asset_send`.
- Actions API for the CRM / voice AI (full reference: `docs/ACTIONS_API.md`): `/api/v1/Actions/*`, header `X-Api-Key` = `ACTIONS_API_KEY`
  (unset = 503). Real HTTP status codes (own exception filter). Endpoints: `LookupCustomer`, `SearchCentres`,
  `BookingRequests`, `FollowUps`, `OfficialPlan`, `SendAsset`, `Escalations`, `OptOut`,
  `Customers/:id/Record` (health details left out). Swagger at `/swagger` in development.
- Console (JWT): `/api/v1/Insights/Kpis`, `Insights/Customers/:id/Record`, `Insights/Assets` (add, edit,
  approve). Screens: Reports (KPIs with dates), Conversations -> "CRM record" drawer, Admin -> Approved content.
- KPIs (13.1): trigger-to-response by A-R, trust pack -> continued, centre list -> booking, plan -> link
  accepted, link -> payment, booking-only -> later activation, opt-out / complaint by trigger sequence,
  callback resolution and activation, duplicate / cap violations (target 0).
- Conversion attribution: when a payment is verified the trigger path is saved on the activation
  (e.g. `A>D>G>H>E`), the last trigger marked `last_touch`, the others `assisted`.

## Gotchas learned the hard way

- `BaseTable.created_on` / `updated_on` are `select: false`. `find()` does not return them: use a query
  builder with `addSelect("x.created_on")`, or compare inside SQL.
- `created_on` is a timestamp WITHOUT time zone. Never pass a JS Date to compare with it: the driver shifts
  it by 5:30. Compare in SQL (`(SELECT created_on ... WHERE id = :id)`, `now() - interval ...`).
- The global exception filter answers HTTP 200 with `{Type:"E"}` (the console relies on it). Only the
  Actions controller uses real status codes.
- `sendAndSave` treats a unique violation on the outbound row as "already replied". A test WhatsApp mock
  must return unique message ids, or replies silently stop being saved.
- Templates are referenced by name only and must be approved in Meta before go-live:
  `booking_confirmed`, `booking_rescheduled`, `booking_cancelled`, `activation_confirmed`,
  `activation_reminder`, `agreed_follow_up`, `conversation_rescue_1`, `conversation_rescue_2`.

## Running it locally for tests

On Windows start node with an UPPERCASE drive path (`cd "D:/sharyx/oxxy/oxy/backend" && node "D:/.../dist/main.js"`):
from Git Bash's `/d/...` the entity glob and the imports load two copies of every entity and every query fails
with "DataSource is not set for this entity".


A throwaway Postgres on 5544 and Redis on 6379 were used (not the developer's databases).
Backend from `oxy/backend` after `npm run build`:

```bash
env PORT=8766 DB_HOST=localhost DB_PORT=5544 DB_USER=postgres DB_PASS=x DB_NAME=oxxy DB_SYNC=false DB_SEED=true REDIS_HOST=localhost REDIS_PORT=6379 SECERT_KEY=test-key-test-key TOKEN_SECRET=test-token ExpiresIn=1d AUDIT_LOG=false INFLUX_URL=http://localhost:8086 INFLUX_TOKEN=x INFLUX_ORG=x INFLUX_BUCKET=x WHATSAPP_VERIFY_TOKEN=verify123 WHATSAPP_APP_SECRET=appsecret WHATSAPP_ACCESS_TOKEN=x WHATSAPP_PHONE_NUMBER_ID=123 WHATSAPP_API_BASE=http://localhost:8799 ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:8799 CRM_ENABLED=false ACTIONS_API_KEY=test-actions-key NODE_ENV=development node dist/main
```

`WHATSAPP_API_BASE` and `ANTHROPIC_BASE_URL` pointed at a small local mock (fake Meta API + scripted
Claude) on 8799, so no real messages or API calls were made. Seeded console logins: `admin@oxxy.com`,
`user@oxxy.com`, `superadmin@oxxy.com` (dev seed password in `CommonSeeder.service.ts`).
Tests: `npx jest` in `backend` (728 passing); `npx tsc -b`, `npx eslint src`, `npx vite build` in `frontend`.

## Real WhatsApp

`backend/.env` (git-ignored) holds the Phone Number ID, WABA ID and business number. The access token given
on 13 Nov had already expired (Meta: "Session has expired on 12-Nov-26"). Still needed: a permanent
System User token, `WHATSAPP_APP_SECRET` (inbound signature check), a public HTTPS webhook URL, and the
template approvals above. The token was shared in chat, so rotate it.

## Open items (not built yet)

- The CMB gate YES/NO and booking date parsing accept English / Hinglish forms; Hindi month names are not parsed.
- O senior callback does not offer callback time options yet (team hours / SLA are [CONFIRM]).
- No opt-in path after STOP (`ConversationRepository.optIn` exists but nothing calls it).

## Decisions waiting for the business team

- Validator rejects any "savings" wording, even "healthcare-savings service", which is in the approved
  insurance answer: real drafts with that phrase become holding messages.
- "scam" / "fraud" are complaint keywords, so "Is Oxxy a scam?" escalates instead of getting Trigger A.
- Cut Medi Bills break-even: the plan says ₹19,664 a month, but the floor-to-500 rule makes it ₹20,000.
- All `[CONFIRM]` values: renewal terms, activation time for Oxxy plans, GST, Trigger Q delay (4 h),
  the 5 example content items (example.com links, not approved).
