# Oxxy WhatsApp bot: working context

Last updated: 15 Nov 2026. Read this first when you pick the project up again (person or AI).
The requirement documents are in this folder: `1_Oxxy_Full_Development_Plan.docx` (the plan; section numbers
below like "12.5" point into it), `2_Oxxy_Prototype.html` (console design + WhatsApp simulator),
`3_Oxxy_3Day_Tasks.xlsx`. The Playbook and the Trigger & Conversion Layer documents are in this folder too; Playbook section 17 /
Trigger layer section 13 are the source of the CRM work. The Actions API reference is `ACTIONS_API.md`.

## Repository and branch

- Repo: github `Kavipriya-sharyx/oxy`. Work branch: `claude/review-fixes`, cut from `origin/dev`.
- Most of the work is committed as `3c53bf0 changes` and `e54ed07 changes` and is on `origin/dev`.
- Local commits on `claude/review-fixes`, not pushed yet (no PR): `066de72` (Trigger & Conversion Layer, booking
  flow, recovery, multi-LLM, Hindi/Hinglish), `2ad0540 changes`, `829db2c` (live updates, nightly CRM
  reconciliation and retention, console ops screens).
- Later local commits: `b7ab72c changes`, `725b15a`, `4677b6f dsd`, `59629d5 vcvcv` (they hold the 14-15 Nov chat
  fixes: booking answers, one question, memory). In the working tree, NOT committed yet (15 Nov): the Google
  Maps work (`Service/Maps`, `geo_cache`, the location flow, `scripts/maps-e2e*.js`, console map and key
  settings) and the urgent-alert files (`UrgentAlert.service.ts`, `UrgentBanner.tsx`).
- Stack: NestJS 11 + TypeORM (Postgres) + BullMQ / Redis backend; React 18 + Vite + antd + react-query console.
- Schema: migrations only (`backend/src/Database/Migrations`), run at start-up (`migrationsRun`). In order:
  `Baseline`, `TriggerEventPerJourney`, `CutMediBillsGate`, `CrmFieldGroups`, `TakeoverHandback`, `ConsoleOps`, `LeadIntroTemplate`, `RemoveSampleData`. Generate new ones with
  `npm run migration:generate -- src/Database/Migrations/Name`, then remove the noise lines TypeORM adds
  (`SET DEFAULT '1'`, the `chk_*` checks, `uq_activation_one_open`): those are kept by the Baseline on purpose.

## What the bot does now (all tested)

Order of one turn (`ChatPipeline.service.ts`, plan 12.1):
1. Guardrails first, fixed replies, no LLM: emergency 112/108, self-harm 14416, STOP, privacy, complaint,
   "talk to a person". STOP + chest pain = emergency reply, then opted out.
2. Trigger response is recorded on the last trigger (replied / opted_out / escalated).
3. Opted out = silent. Stale message (a newer one was already answered) = skipped, marked `stale`,
   shown as "not answered (late)" in Conversations (plan 12.10 strict order).
4. Pause / Escalated = silent (human has it).
5. DPDP health-data consent gate, then the 4-row opening list.
6. Waiting answers, no LLM: Cut Medi Bills gate, activation link YES/NO, soft activation YES/NO,
   payment replies after the link (DONE -> Trigger P + verify task; failed -> payment task + escalated;
   not now -> follow-up), insurance ("I have insurance" / "is Oxxy insurance?" -> Trigger B with its approved
   asset; J only on the Cut Medi Bills route), "discount at this hospital?" -> the neutral savings line (fixed).
7. The LLM (Claude, OpenAI or Gemini) drafts JSON -> ReplyValidator (also rejects any link / web address / e-mail) -> retry once -> else
   holding message + task, state ESCALATED (not PAUSE: PAUSE is the safety state).
8. Code actions: plan pick + value check (floor(spend x rate / 500) x 500 > yearly x 1.18), centre search
   (verified private only, up to 5), booking (Asia/Kolkata +3 days .. +6 months, always pending_confirmation,
   unknown centre -> directory_verification task, never rejected), soft activation once per journey with the
   timing caution, activation disclosure first and the link only after YES, Trigger Q reminder after 4 h.
9. One trigger per turn, decided before the send and recorded after it (TriggerEngine `decide` / `record`).
   D / E / I are recorded only when the list / plan / offer was really shown.
10. Content triggers (`Helper/TriggerReplies.ts`, approved wording, fixed phrases answered before the LLM):
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
  4+ plain English words = en); the LLM's `language` field can also set it. Insurance "has it" detection
  (Trigger B / J) works in English, Hinglish and Hindi.

## LLM choice

- Settings -> "AI Provider & Model Keys": **Preferred LLM** (Claude / OpenAI / Gemini) and **Fallback LLM**
  (`LLM_PROVIDER`, `LLM_FALLBACK`; models `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`; keys
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`). Saved in `system_config`, applied at once.
- `LlmService` (`Service/Oxxy/Llm.service.ts`, renamed from `ClaudeService` on 15 Nov) is the router: preferred first, then the fallback
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
  `WHATSAPP_WABA_ID`; rejected / paused / disabled templates are refused in WhatsappClient), Plans: a saved
  change applies at once (`plan_change` row "applied" = history, permission `plans.edit`, version + 1).

## Opt back in, senior callback, Hindi (14 Nov)

- START after STOP: an opted-out customer who writes only `START` / `unstop` / `subscribe` / `start again` /
  `shuru karo` / `शुरू करो` is opted in again (`isOptIn`, whole message only; "can we start the plan" is not).
  Opt-out cleared, OPTED_OUT -> NEW, CRM `set_opt_in` [CONFIRM endpoint], fixed `opt_in` reply [CONFIRM text].
  Marketing consent stays off, and the follow-ups cancelled at STOP do not come back.
- Trigger O callback options (`CallbackFlow.ts`): "talk to a person", a complaint and the LLM's `needs_human`
  replies also list three 2-hour windows inside `TEAM_HOURS` (default 10-19) on `TEAM_DAYS` (default 1-6 =
  Mon-Sat) [CONFIRM both], each at least 1 hour away. The windows shown are kept in
  `pending_action = callback_time:<task id>:<windows>`. While ESCALATED the bot reads only that answer
  ("1" / "2" / "3", Devanagari digits, or a time such as "tomorrow 11 am" = a 1-hour window). The answer
  goes on the task (`callback_from`, `callback_to`, `due_at`), is sent to the CRM as `set_callback_window`
  [CONFIRM endpoint], and the customer gets "requested a callback for <window>. Reference: CB-XXXXXXXX".
  A time outside team hours gets the hours and fresh options. Any other message stays with the team (no reply).
  The Escalations screen shows the chosen window.
- Hindi dates: the booking date parser reads Hindi month names (नवंबर / नवम्बर, फ़रवरी ...), Devanagari digits,
  आज / कल / परसों. The CMB gate YES / NO already accepted हाँ / नहीं (shared with the consent parser).
- Hindi templates: a template send asks for `en`. A Hindi customer (`language = hi`) gets `hi` instead, but only
  when a `wa_template` row (name, `hi`) exists and is approved. Read it from Meta with "Read status from Meta"
  once the Hindi versions exist there. Hinglish stays English.

## Playbook gap fixes (14 Nov, after the full Playbook / Trigger layer review)

- **FAQ (Playbook 13, 4.3, 4.4, 16.2)**: `Helper/FaqReplies.ts`, approved answers sent word for word before the LLM
  (what is Oxxy, who pays, repeated use, pre-existing, activation time, after paying, Cut Medi Bills age, both
  products, 30% guaranteed, appointment confirmed, policies, medical advice, "are you a bot?", "I don't remember").
  Product-aware (the Oxxy route never mentions Cut Medi Bills). Mid-gate / mid-booking: answer, then the same step.
  The same answers are in the LLM prompt, which now follows Playbook 2 (identity, one question, <350 chars,
  escalation list 16.4, discovery order 5).
- **Validator**: the generic "healthcare savings" description passes (it is the approved 7.1 wording); promises,
  figures, guarantees, offers, cashback and "pays for itself" are still rejected (`promisesSavings`). New 2.1
  checks: Cut Medi Bills shortened, urgency / dark patterns, asking for OTP / PIN / password, "covers" / coverage.
  "support partner" is no longer a tie-up; "partner hospitals / network hospitals" still are.
- **Fixed replies = Playbook wording**: emergency 16.1, self-harm (14416 free 24x7), opt-out / opt-out with booking
  16.3, new opt-out with open payment case, privacy (with `{privacy_contact}`), health-data notice 16.3 with
  `{retention}` and `{privacy_contact}` (+ "Sharing them is your choice", DPDP) -> NOTICE_VERSION dpdp-health-v2
  (everyone consents again). Env: `OXXY_PRIVACY_CONTACT`, `RETENTION_DAYS`.
- **Opening (4.2)**: rows Reduce a medical bill / Find or book a centre / Understand Oxxy / Existing customer help
  ("Talk to me later" removed; follow-ups still come from "busy" / "not now"). A new chat gets the 4.2 welcome +
  list FIRST; the health notice comes with the next message, and the row picked before consent
  (`pending_action = after_consent:<row>`) is answered right after YES.
- **Existing customer help (3)**: the row looks the customer up (active product, open bookings, unpaid link, open
  case); the next question becomes a `servicing` task + ESCALATED + callback options. An active product blocks any
  other activation with a message and a `servicing` task (3.1).
- **ESCALATED / PAUSE**: one acknowledgement per escalation (`pending_action = parked_ack`), never while a person has
  taken over or callback options are waiting; PAUSE repeats 112 / 108. The holding message now carries callback options.
- **Decision journey (1.3)**: `journeyExpired`, `JOURNEY_DAYS` (default 7). A message after 7 quiet days closes the
  old conversation (outcome `no_reply_7_days`) and starts a new one. Never for ESCALATED / PAUSE / OPTED_OUT.
- **CRM sync (Full Plan 3.2)**: `CrmClient` uses the plan's REST paths (`crmRoute`, base = CRM API root),
  5-second timeout; `log_event` for every trigger (TriggerEngine.record) and consent change; `upsert_customer`
  when a discovery field changes (no health details); `lookup_customer` on the first message of a conversation
  (queue worker, not the webhook) copies the CRM's active product, id and opt-out; booking payload = Playbook 17.2.
- **Recovery loop fix**: a turn that ends without a reply on purpose marks the inbound `no_reply`, so the
  lost-message recovery no longer requeues it every minute (that blocked the one-at-a-time inbound queue).
- Local test Redis is 5.0: BullMQ polls every ~5 s on Redis < 6.2, so replies take 5-15 s here. Use Redis >= 6.2
  (the plan says 7) anywhere real.

## Medium Playbook fixes (14 Nov)

- **Centre search (Playbook 10)**: `CentreSearch.service.ts` maps customers' words to directory specialisations
  (eye -> ophthalmology, teeth -> dental ...), ranks the customer's locality first, uses a directory centre in that
  locality as the origin for the radius, and keeps both specialist and multispeciality choices in the top 5. The bot
  asks the travel radius before listing (`pending_action = centre_radius`, `parseRadius`), then shows Trigger D
  cards (`Helper/CentreReplies.ts`: name, branch - locality | Specialist/Multispeciality | Relevant for X) and says
  plainly when fewer than five exist. "Find or book a centre" -> the city answer becomes a centre search.
- **Bubbles and buttons (Playbook 1.1)**: `Helper/Bubbles.ts`. Every pipeline reply ending "Reply YES or NO" (and the
  Hindi / Hinglish forms) goes as one reply-button message (ids yes / no). Text over 350 characters is split at
  paragraphs into up to three bubbles; only the first carries reply_to_wa_message_id.
- **Meta marketing limit (15.1)**: code 131049 -> `FrequencyCapError` (send) or status `frequency_cap` (status
  webhook); a scheduled send is skipped with reason frequency_cap and never retried the same day; a blocked Trigger Q
  is logged as Q suppressed frequency_cap; the KPI counts both.
- **Outbound lead (Playbook 4.1 / 4.5)**: `POST /api/v1/Actions/StartConversation` (consented lead only, never in quiet
  hours or into a live chat) sends template `lead_intro` (migration `LeadIntroTemplate`, approve it in Meta) and sets
  `pending_action = lead_intro`. Buttons: Yes, please -> notice -> discovery question 1; Just send details -> the
  4.5 priority question (`lead_priority`) -> only the matching summary (`LEAD_SUMMARY`); Not now -> FOLLOW_UP_TIME.
  These steps and the follow-up time answer run before the consent gate (no health question in them).
- **needs_human task summary**: no message text any more (it went to the CRM and could hold health details).
- **Acceptance suites**: `src/Acceptance/Playbook.acceptance.spec.ts` (27, Playbook 20) and
  `Trigger.acceptance.spec.ts` (20, Trigger layer 15), named as the document rows.
- **CI**: `.github/workflows/ci.yml`: backend tsc, eslint (errors), jest, acceptance; frontend eslint + build.
  `test/app.e2e-spec.ts` type error fixed (default supertest import).

## Remaining Playbook / Full Plan gaps built (14 Nov, last pass)

- **Rescue ladder in chat (Playbook 15)**: `Helper/RescueReplies.ts` + `handleRescueSignal` (after
  handleObjection, only when no pending_action). One-word fillers -> benefit-or-price, then trust/price/use.
  A whole-message "I don't know" -> routine-or-major, then the ₹50k / ₹1L / ₹3L bucket (sets `price_spend`, so the
  answer runs the value check). "You are repeating" -> one-concern, then help/info/end. Attempt 3 = the close
  offer (`close_offer`). Count kept in `conversation.objection = "rescue:<signal>:<n>"`, reset by any other message.
- **Activation follow-up after booking (Playbook 11.2)**: the soft offer creates a `activation_follow_up` task
  (CRM payload `activation_pitch_allowed: true`). "No" closes it (`task_status done`, outcome note) and emits
  CRM `log_event activation_declined` with `activation_pitch_allowed: false`. Console label added.
- **Cancelled booking (Full Plan 3.3)**: CRM `booking.cancelled` -> template `booking_cancelled` (YES/NO buttons)
  only for the first cancellation in a conversation, and sets `pending_action = rebook_offer:<booking id>`.
  YES = a new centre list without that centre (`CentreQuery.exclude`, Trigger D); NO = `REBOOK_DECLINED_T`.
  Later cancellations use the new template `booking_cancelled_info` (migration 1794640000000; GoLive list).
- **CRM webhooks via BullMQ (Full Plan 3.3)**: `handle()` stores -> returns "ok" -> queue `crm-webhook`
  (jobId = event_id, 3 attempts, backoff, concurrency 1 keeps order). `processStored()` skips processed events.
  Sweeper every 60 s re-queues stored-but-never-processed events. No queue (tests) = inline as before.
- **Cut Medi Bills FAQs (Playbook 8)**: `member_pricing` (CMB: 30% off each additional member), `cmb_cancel`
  (uses env `CMB_CANCELLATION_METHOD`; unset = escalated), `early_activation` (senior review offered, never
  promised; creates an Activation task). Oxxy family pricing is [CONFIRM] -> escalated with the 16.4 line
  (`SERVICE_ESCALATE`) + callback windows (`faqNeedsPerson`).
- **Templates doc**: `docs/WHATSAPP_TEMPLATES.md` = name, category, body, variables (in code order), buttons
  for every template, ready for Meta submission. `lead_intro` agent name is fixed text [CONFIRM].
- **Red team + LLM eval (`src/Eval`)**: `RedTeam.cases.ts` / `RedTeam.spec.ts` run in CI (guardrails, approved
  FAQs, validator block/allow). It found and fixed: Hinglish bleeding phrases now trigger emergency; validator
  rejects prompt leaks ("system prompt", "I was instructed to") and "covered under / will be covered".
  `EvalDataset.ts` = 369 cases (en / Hinglish / Hindi). Runner (one paid call per case):
  `npx ts-node -r tsconfig-paths/register src/Eval/run-eval.ts [--limit N] [--category trust]`; no key = skipped;
  writes `eval-report.json`; exit 1 under `EVAL_MIN_PASS` (0.95). The runner does what the pipeline does: skips
  messages a fixed answer handles (guardrail / FAQ / insurance), one validator retry, one question enforced,
  code-side fields. Run on OpenAI gpt-4o-mini (key in backend/.env, `LLM_PROVIDER=openai`): 78.3% -> 87% ->
  **97.2% (344/354)**. Fixes it drove: `Helper/OneQuestion.ts` (only the last question kept, in the pipeline),
  `Helper/NeedSignals.ts` (planned surgery/operation = single_expense in code), validator stops blocking honest
  refusals (discount code, "guarantee nahi de sakta", "can't share instructions"), prompt: never raise Cut Medi
  Bills unprompted, "send link" = intent activate. Left: "I'll take it when I fall sick" read as collect_needs
  (not why_activate), 2 Hinglish jokes, 1 "Oxxy or Cut Medi Bills?" (validator retry catches it in the pipeline).
- **Load test**: `backend/scripts/load-test.js --rate 10 --seconds 60 --customers 200 --stub http://localhost:8799`
  (signed webhooks; reply time via the stub's `/_sent`; refuses a Meta URL). Local run (Redis 5.0): p50 0.3 s,
  p95 17 s, i.e. the slow local Redis; rerun on Redis >= 6.2 before go-live.
- **Health + alerts (Full Plan 11)**: `GET /api/v1/Health` public (200 ok/degraded, 503 when DB or Redis down);
  `GET /api/v1/Health/Details` (signed in, dashboard.view). `Service/Ops/Monitoring.service.ts` every
  `HEALTH_CHECK_SECONDS`: DB, Redis, unanswered inbound (same rule as recovery), new CRM dead letters, failed CRM
  webhooks -> `ALERT_WEBHOOK_URL` ({"text"}), throttled `ALERT_THROTTLE_MIN`, counts only, off in tests.

## Templates submitted, centre import, CRM plan (14 Nov)

- **Meta templates**: the 10 English templates in `Helper/TemplateDefinitions.ts` were submitted to the real WABA
  with `scripts/submit-templates.ts` (skips existing; `--dry-run`). All PENDING at Meta on 14 Nov; all 10 APPROVED at the evening sync. Agent name
  "Asha" (`AGENT_NAME`). Hindi versions not submitted (wait for review). Check status: WhatsApp templates page
  → sync from Meta.
- **Plans**: admin edits price / GST / renewal / activation time / link on "Plans and prices" (PlanChangePanel,
  applied at once with a confirm dialog; history kept. The two-person rule was dropped on 16 Nov 2026 at the
  client's request: they want it automatic).
- **Centre CSV import fixed**: "false"/"no" used to import as verified. Now `importedCentre()` parses text
  booleans, verified needs an explicit yes (gets verification_source + verified_at), reads is_private /
  postcode, and same name+branch+city updates instead of duplicating. Returns created / updated / skipped.
- **CRM**: undecided by the client. `docs/CRM_INTEGRATION_PLAN.md`: Plan A (CRM_ENABLED=false, console is the
  CRM, go-live default), B (their devs implement our REST + webhooks), C (packaged CRM: we write an adapter).

## Developer page: API keys, webhook secret, Postman (14 Nov)

- Console → Admin → **Developer** (`/developer`, new permission `developer.manage`; Super Admin and default
  Admin have it, a role with a saved custom list must be given it on the Roles page).
- **API keys** (`api_key` table, migration `ApiKeys1794650000000`, `Service/Admin/ApiKey.service.ts`): "Generate
  key" with a name and expiry (30/90/180/365 days or never) → `oxk_live_…` (production) / `oxk_test_…`, shown
  ONCE; only the SHA-256 hash is stored. List shows prefix, made by, last used (updated at most once a minute),
  status; Revoke. The Actions guard accepts the `ACTIONS_API_KEY` env key OR an active console key (30 s
  cache, cleared on revoke); 401 for a wrong / expired / revoked key, 503 only when no key exists at all.
- **CRM webhook secret**: "Make secret" makes `whsec_…`, saved through the Configuration settings
  (`CRM_WEBHOOK_SECRET`), shown once; the old one stops working at once.
- **Postman collection** (`Helper/PostmanCollection.ts`): every Actions call + all 11 webhook events, the
  pre-request script signs webhooks (`sha256=` HMAC + timestamp). Download from the page (server address filled
  in) or `docs/oxxy-api.postman_collection.json` (`scripts/write-postman.ts`). No keys in it.
- **API documentation tab** (Developer page, `components/ApiDocs.tsx`, content in `frontend/src/data/apiDocs.ts`):
  the full guide for the client's CRM / voice AI developers, with this server's URL filled in. Overview of the
  three directions, quick start, auth and conventions, all 10 Actions (fields, curl, response, errors), the error
  table, webhooks (envelope, HMAC signing in Node / Python / PHP, responses, all 11 events with data fields), the 11
  bot → CRM calls the CRM must build (exact payloads from the code, Bearer auth, Idempotency-Key, `{ id }` reply,
  retry rules: 5xx / timeout / 408 / 429 retried 24 h, other 4xx dead at once), reference values, Playbook 17 field
  groups, hard rules (Full Plan 3.4) and a go-live checklist (3.5). "Download guide (HTML)" renders the same
  component to one self-contained file to send the client. When an API changes, update `apiDocs.ts`.
- **Build fix**: `tsconfig.build.json` now excludes `scripts/`. `scripts/submit-templates.ts` had made
  `nest build` write `dist/src/main.js` instead of `dist/main.js`, which broke `npm run start:prod`.
- Go-live check "Actions API key" (`actionsKeyCheck` in `GoLive.service.ts`) is ok with an active Developer-page
  key or `ACTIONS_API_KEY`; it warns only when neither exists.

## CRM decision: the client's CRM only calls our API (14 Nov, pull model)

- The client builds nothing the bot calls and sends no webhooks. `CRM_ENABLED` stays false. Plan:
  `docs/CRM_INTEGRATION_PLAN.md`. The push code (outbox → CRM, signed webhooks) stays for later.
- Changes feed: `change_event` table (migration `ChangeFeed1794660000000`, also adds
  `booking_request.confirmed_by_name`), `Service/Crm/ChangeFeed.service.ts`. `CrmOutboxService.enqueue/emit`
  record every action in the feed (same transaction) BEFORE the CRM_ENABLED check; the shared webhook handlers
  (`CrmWebhookService.apply`) record booking.confirmed / rescheduled / cancelled, activation.paid / failed /
  refunded, task.completed. Booking's 17.2 payload is now always built. Nightly prune at 02:45 IST (90 days).
- New Actions endpoints (`Service/Crm/CrmPull.service.ts`): GET Changes, Customers, BookingRequests, Activations,
  Tasks; PUT Customers/{id}/CrmId; POST BookingRequests/{id}/Confirm | Reschedule | Cancel,
  Activations/{id}/Payment, Tasks/{id}/Complete. Writes reuse the webhook handlers, so the customer gets the
  same WhatsApp templates. Confirm needs `confirmed_by`; non-pending → 409 `not_pending`.
- Developer page and the API documentation tab now describe only this model (customer actions + CRM sync);
  the webhook secret panel and the webhook / CRM-endpoint sections were removed. Postman: "2. CRM sync" folder.
- Tested on the live 8000 server with a temporary key (revoked): feed, lists, 400/404 paths.

## Voice AI call → WhatsApp (14 Nov)

The client's voice AI shares details on WhatsApp after a call: `POST /Actions/StartConversation`.
- `context` (summary, need, beneficiary, city, locality, specialisation, selected_product, recommended_plan;
  `Helper/CallContext.ts`) → `conversation.call_context` (encrypted) + `call_context_at` (migration
  `CallContext1794670000000`), the need record (city, locality, beneficiary, specialisation, healthcare_need), and
  selected_product / recommended_plan when none is set. The LLM gets it as `call_context` for 7 days (prompt rule:
  known facts, ask only what is missing, never quote it).
- Quiet hours no longer refuse: a `follow_up` of kind `lead_intro` at 09:00 IST (`status: "queued"`); the scheduler
  skips it with `chat_open` if the customer started chatting, else sends the template and sets
  `pending_action = lead_intro`.
- Customer wrote within 24 h and the chat is idle (new / intent_menu, no pending action): the same text and three
  buttons as a normal message (`LEAD_INTRO_TEXT` in `OpeningMenu.ts`, [CONFIRM] wording). A chat in progress is not
  interrupted (`status: "context_saved"`). An older chat stopped part-way with the window closed is still 409.
- Tests: `Service/Crm/StartConversation.spec.ts`. Not built: a template that sends plan details straight away
  (needs a new Meta template; today the customer taps "Just send details").

## Timings on the Configuration page (16 Nov)

Configuration → "Timings" (system_config, group `timings`, `fromEnv`): PROACTIVE_FROM / PROACTIVE_UNTIL (quiet hours,
default 9 / 21), TEAM_HOURS, TEAM_DAYS, RESCUE_1_HOURS, RESCUE_2_HOURS, TRIGGER_Q_DELAY_HOURS, JOURNEY_DAYS. Saved
values go to process.env at once and the code reads them live (`proactiveHours()`, `rescueDelayMs()`,
`triggerQDelayMs()`, `journeyDays()`, `teamHours()`), so no restart; on start-up saved rows are re-applied. Each value
is checked on save (ranges, start before end); nothing is saved if one is wrong; empty = default. Customer and API
texts about quiet hours use the setting ("I can message only between 10 am and 9 pm"). Tests: `Timings.spec.ts`.

## End-to-end API check of both guides (16 Nov)

Every call in the CRM and voice agent guides was run against a test backend (throwaway DB 5544, mock WhatsApp +
LLM, own QUEUE_PREFIX) with keys made on the Developer page: all answered as documented (incl. 400 / 401 / 403 / 404 /
409 cases, changes feed, payment → product lock, OptOut). Found and fixed:
- Booking confirmed / rescheduled / cancelled and activation_confirmed messages in quiet hours were DROPPED (warning
  only) while the API said "notified". Now `CrmWebhookService.sendStatus` queues them as follow_up kind
  `status_update` for 09:00 IST (rebook YES / NO armed via `pendingAction` when really sent; still sent while
  ESCALATED, never in PAUSE); `customer_notified` says "… at 09:00 IST (quiet hours)".
- StartConversation did not tell the CRM about a new lead: it now emits upsert_customer → `customer.updated` in the
  feed.
- A CRM id already on another record (crm_booking_id / crm_activation_id / crm_task_id) gave 500: now 409
  `crm_id_in_use`.

## Console wording for the API model (15 Nov)

The client's CRM is never "connected": it calls the Oxxy API. Texts that said "The CRM is not connected" now say
tasks / bookings / payments are handled in the console or by the client's CRM through the API (Escalations,
Activations, Bookings, Dashboard, Configuration, permission labels). The CRM sync page notes it is the optional push.
Go-live "CRM sync: Off" (warn) became "CRM connection: the client's CRM uses the Oxxy API" (ok).

## Urgent safety alert to the sales team (15 Nov, Full Plan 12.7)

- Any task created with priority urgent (emergency, self-harm, urgent complaint / payment dispute) calls
  `UrgentAlertService.notify` (`Service/Ops/UrgentAlert.service.ts`) from `ChatPipeline.createTask`, once per task.
- Outside the console: one POST {"text"} to `SAFETY_ALERT_WEBHOOK_URL` (else `ALERT_WEBHOOK_URL`); no health detail,
  first name + last 4 digits only, and a link to `${CONSOLE_URL}/escalations` (no number in the link).
- Inside the console: `GET /Console/UrgentAlerts` (tasks.work) → `components/UrgentBanner.tsx` on every page while a
  case is open: red banner, three beeps and a desktop notification once per new case (seen ids in sessionStorage),
  "(N urgent)" in the tab title, "Open chat" / "Open escalations". It disappears when the task is done. Live task
  events refresh it at once; 15 s polling is the fallback. Browsers play sound only after a click on the page.
- Tests: `ChatPipeline.guardrail.spec.ts` (emergency / self-harm alert once, none for "talk to a human"),
  `UrgentAlert.spec.ts` (text). Not checked in a browser yet (servers were down on 15 Nov).

## Go-live check: Super Admin only (15 Nov)

`GET /Console/GoLive` has `@Roles(SuperAdmin)` on top of `settings.manage` (an Admin gets 403). In the console
`ROUTE_PERMS["/go-live"] = SUPER_ADMIN_ONLY`; `usePermissions().can` checks the role for it, so the menu item is
hidden and the URL goes to No access for everyone else. Test in `RolesGuard.service.spec.ts`.

## Provider-neutral wording (15 Nov)

The bot runs on Claude, OpenAI or Gemini (Configuration → Preferred / Fallback LLM). Generic "Claude" was replaced
with "the AI model" / "the LLM" in the console (Login quote, Plans note, Flows pages, Configuration "Fixed rules"),
and in backend comments. Configuration "AI model" now shows the provider and model really set (it was a hard-coded
claude-opus-5-5 while OpenAI gpt-4o-mini was running). `ClaudeService` → `LlmService`, `ClaudeResult` →
`LlmResult`, `parseClaudeJson` → `parseLlmJson`. "Claude" stays only where it names the provider (the provider
option and Anthropic key labels, the Go-live / no-key messages) and in the git branch name.

## No message without a reason; caches (14 Nov audit)

- Every scheduled message has a `follow_up` row; the BullMQ job is only the alarm clock. At send time
  `FollowUpScheduler.execute` re-reads the row (cancelled or missing → nothing sent), consent (STOP / privacy),
  conversation (closed, PAUSE, ESCALATED, OPTED_OUT), and per kind: rescue cap, Trigger Q unpaid / no product /
  not already P, lead_intro chat not started. Quiet hours move it to 09:00 IST.
- A customer message now cancels `CANCEL_ON_REPLY` = rescue, agreed_follow_up, lead_intro (it cancelled only the
  rescue, so an "as agreed, following up" message could still go to someone who had already come back).
- Redis on 14 Nov: 120 delayed rescue jobs for 37 customers, many from test runs against the dropped 5544 DB; all
  carry followUpId, so they find no row (or a cancelled one) and send nothing. Old `oxxytest:*` keys are inert.
- Rule: every environment needs its own `QUEUE_PREFIX` (or Redis DB). Two servers with different databases on the
  same prefix take each other's jobs: the other server finds no row and the real message is silently dropped.
- Caches: RolesGuard permissions 10 s in memory, cleared on role change; API keys 10 s (was 30 s), cleared on
  revoke. `UserRoleService` no longer uses the boilerplate Redis cache (it mixed lists, stored keys it never read
  back, and was never cleared by the Roles page); it was unused by the console anyway.

## Voice agent docs, separate from the CRM docs (14 Nov)

- Developer page tabs: Keys and setup · CRM API docs · Voice agent API docs. Each docs tab has its own
  "Download guide (HTML)" and "Download Postman collection"; the setup tab has a "Documents for the client's
  developers" panel with all four.
- Voice guide: `components/VoiceAgentDocs.tsx`, content `frontend/src/data/voiceDocs.ts` (call flow, WhatsApp consent
  lines [CONFIRM], call-context mapping, what to say for each StartConversation status, the 8 calls a voice agent
  uses taken from the shared ACTIONS list, Node / Python example, rules, checklist). Anchors use the `voice-` prefix.
- Postman: `buildVoicePostmanCollection()` (8 calls in call order), `POST /Developer/Postman { audience: "voice" }`,
  `docs/oxxy-voice-agent-api.postman_collection.json` (`scripts/write-postman.ts` writes both).
- One API key per system: the voice agent gets its own key, separate from the CRM's.

## Client API documentation (14 Nov)

- `docs/CRM_API_REFERENCE.md` is the document for the client's CRM developers: the three connections (Actions API,
  webhooks, bot -> CRM), what each side gives, the rules, every webhook event with its fields and responses
  (Node / Python signing examples checked against `validCrmSignature`), every bot -> CRM call with its payload,
  retries and `Idempotency-Key`, lookup and nightly reconciliation contracts, test and go-live steps. Send it with
  `ACTIONS_API.md` and `oxxy-api.postman_collection.json`.
- Fix found while writing it: webhook `customer.opted_out` now normalises `wa_number` (`+91 …`, `0…`, digits).

## Conversations page fixes (14 Nov)

- One draft per chat (`drafts[conversation id]`): text typed for one customer is never sent to another.
- The open chat never switches by itself: the first load opens the newest, after that only a click (or a tab /
  search change) changes it. A chat that leaves the current tab (e.g. handed back) stays open with a note.
- `GET Console/Conversations?q=&view=&limit=`: search (name, number digits, state) and the tab filter run in the
  database; limit 1..300 (100), "Load more" in the list. Each row has `last_message` (preview), `waiting`
  (customer messages after the last reply) and `open_booking`.
- `GET Console/Conversations/:Id/Messages?before=`: the NEWEST 200 (it returned the oldest 200 before, so long
  chats hid their latest messages); "Load older messages" pages back and keeps the scroll position.
- Live `message` events now refresh the open thread too (they only refreshed the list).
- The 24-hour window re-checks every 30 s and shows when it closes. Opted-out customers with a pending booking
  request get the composer with a "reply only about the booking" note (same rule as the Reply endpoint).

## Console branding from www.oxxy.in (14 Nov)

- Look only, no behaviour change. Tokens in `frontend/src/styles/oxxy.css`: teal `--brand #03A297` (fills, login
  gradient), `--accent #02857C` (the same teal one step darker so white text and teal text on white pass WCAG AA),
  navy `--heading #023350`, mint backgrounds, light-blue info panels. Fonts as on the site: Outfit (headings,
  big numbers) and Roboto (text), loaded in `index.html`; IBM Plex Mono stays for phone numbers.
- Light by default like the website (the OS dark mode no longer switches it); a dark set exists for
  `<html data-theme="dark">`. antd follows the same choice (`main.tsx`).
- Logo: `public/oxxy-logo.png` (205 x 100, from oxxy.in) in the rail and on the login page;
  `public/oxxy-icon.png` (52 x 50) is the favicon and the collapsed-rail logo. Buttons are pill-shaped like the site.

## No sample data, go-live check (14 Nov)

- The system holds NO sample or placeholder data. The seeders create only the roles and the 10 plan rows
  (prices, savings and age limits from Full Plan 1.1). No centres, no content, no example.com links, no
  `[CONFIRM]` text in any row. Migration `RemoveSampleData` cleans older databases: example links and
  `[CONFIRM]` texts in `plan_catalog` become empty, the 5 "Sample ..." centres and the 5 example.com content
  items are deleted (or switched off when a booking / a send still points at them).
- `Helper/GoLive.ts`: `isPlaceholder`, `isRealLink`, `planReady`. A plan row without a real https activation
  link, renewal terms and activation time is "not ready": the bot shows no price disclosure and sends no link
  for it, opens an Activation task ("Plan not ready to sell, missing: ...") and a person takes over. The Actions
  API returns such values as null with `needs_confirmation: true`. Plan changes and content approval refuse
  placeholder values.
- Console -> Admin -> Go-live check (`GET /api/v1/Console/GoLive`, permission `settings.manage`,
  `Service/Ops/GoLive.service.ts`): reads the real state and lists blockers / warnings: production mode, demo
  logins, a real call to Meta with the token and Phone Number ID (no message is sent), app secret, verify
  token, the 8 templates approved, LLM key, every plan row, verified centres, approved content, CRM settings,
  retention period, team hours.
- Production (`NODE_ENV=production`): no demo logins are created, and the four demo accounts of an earlier
  development start are switched off at start-up. The first Super Admin comes from `SEED_ADMIN_EMAIL` +
  `SEED_ADMIN_PASSWORD`. Development still creates the demo logins (the Go-live check flags them).
- Real data Oxxy must enter before go-live (console): the official activation link of all 10 plan rows; renewal
  terms and activation time of the 8 Oxxy rows (Plans; a change applies at once); the real centre directory
  (Centres, add or import); the approved content links (Content); WhatsApp token / app secret (Configuration).

## Fixes from real chats (14-15 Nov): booking answers, one question, memory

Reported from real WhatsApp chats; every case below is a regression test (the messages are in the specs).

- **A sentence was saved as a centre name.** At "Please share the centre and branch first", "No give me at your
  suggestion." became a centre "not in our directory yet". Now, at the centre step (`handleBooking`):
  a directory centre = taken, no LLM; `asksForSuggestion` ("you suggest", "any good hospital nearby", "aap
  batao", "koi bhi") = `suggestInsteadOfBooking` (centre search: location / city, radius, list); otherwise the
  LLM reads the answer (`LlmService.classifyAnswer`, `readAnswer`), and without an LLM answer the word rule
  `looksLikeCentreName` decides. Not a name = answered normally, then the same question again.
- **The LLM reads unclear booking answers, it never writes the reply** (`classifyAnswer(step, question, text,
  today)` -> `{kind: answer | wants_suggestion | decline | question | other, value}`; 6 s timeout; null on any
  problem = the word rules). Centre: pulls the name out of a sentence. Specialisation: only for words the
  directory does not know (`knownSpecialisation`), e.g. "Orthi" -> "Orthopaedics". Date: only when
  `parseCustomerDate` fails ("coming friday"); the booking window still decides. Landmark: only for a sentence.
- **A date outside the window is said at once.** `startBooking`: "tomorrow" gets the date-window line instead of
  being dropped silently.
- **Naming a hospital is not asking for a booking.** `asksToBook(text)`: without booking words the mandatory offer
  ("May I do your booking at X?") comes first (`startBooking({ asked })`), then the landmark question.
- **One question per message, no stalling, no repeated thanks** (`Helper/ReplyTidy.ts`, `tidyDraft`, applied at
  the final assembly after `OneQuestion.ts` and the validator; it only removes sentences): the draft's own
  question goes when the system adds one (age, city, booking step, callback options; `hasQuestion` also counts
  "Please share ..." / "Reply 1, 2 or 3"); "please hold on", "I will check", "I will share it shortly" are
  removed (a team callback is not stalling); a second "Thank you for ..." opener in a row is removed. Never an
  empty reply.
- **"Monthly 20,000" brings the value check.** `statedYearlySpend(text)` (one amount + a period word; x 12 for
  monthly; a question is not a statement) sets `annual_medical_spend` and intent `recommend` in code, so the
  plan and price come in the same turn instead of "would you like to explore a plan?" twice.
- **No verified centre: never the same sentence in a loop.** `noCentreText(place, again)` / `isNoCentreText`:
  first time "I do not have a verified centre in {place} yet. Please share the healthcare centre's name and
  location, in this or another area. Oxxy can help take your booking request there." (Playbook 10.1 + 10.2);
  the second time in a row the team gets a `directory_verification` task and the customer is told so.
- **Callback options come with their reason** (`CALLBACK_REASON_T`, Playbook 16.4: "I want to give you a precise
  answer rather than guess. I will arrange an authorised callback."). The ESCALATED acknowledgement is now
  "Thank you. Our team has your request and will contact you." (no "no need to send it again").
- **Memory: the LLM is told what is stored** (`knownFacts` -> `describe`). Before, the context held only name,
  language, age and active product, so the bot re-asked what was already in the database. Now: `known` (this
  conversation's need row: who, need, specialisation, city, locality, radius, spend, insurance; the recommended
  plan; an open booking request), `conversation_state`, and `from_earlier_chat` (the previous conversation of
  the last 90 days: need, city, spend, plan; to confirm in one question, not to assume). Health fields are
  left out when the health consent was refused; the free-text condition is never sent. The query for the
  earlier conversation has no unit test and was not run against the real database.
- Prompt rules added (`SYSTEM_PROMPT`): one question about one person, no opener in every message, no
  "activation date", no medicine names, yearly spend = monthly x 12 with intent recommend, the oldest patient's
  age when several need care, never ask again for what is in `known`.
- **Booking confirmed in the console, but no WhatsApp message (16 Nov).** `BookingService.confirm` sent the
  `booking_confirmed` template as "proactive" and swallowed every error, so in quiet hours (before 09:00 / after
  21:00 IST) the message was dropped for good and nobody was told. Now: quiet hours = queued for 09:00 IST
  (`status_update` follow-up, like the CRM webhook path); any other failure keeps the booking confirmed and the
  console shows why (`sendProblem`: template not approved, paused, wrong variable count, expired token ...).
  The reply text says which of the three happened.
- A long reply arrives as up to three WhatsApp bubbles (`toBubbles`, Playbook 1.1): that is why a plan line or
  the callback options can look like a separate message. Not a bug.
- Console: Live Chat shows "Tapped: Understand Oxxy" instead of the raw row id (`TAP_LABELS`); a Light / Dark
  switch in the topbar (kept in the browser as `oxxy-theme`, the page reloads once).
- Wording taken from the documents (no separate approval needed): the callback reason, "Please choose a
  convenient time: ..." (Trigger layer 9 O), "I have requested a callback for {window}. Reference: {id}."
  (Playbook 18), the second half of the no-centre reply (Playbook 10.2).

## Centre search asks for the location first; no hospital list from the LLM (16 Nov)

Real chat: the customer typed "coimbatore peelamedu", then "you can suggest hospital". The reply was
"1. 2. 3." + the travel-distance question, and the location was never asked.

- **Cause of "1. 2. 3."** The LLM listed hospitals by itself. `tidyDraft` split the draft into sentences with a
  pattern that lost every line without a full stop, so "1. PSG Hospitals" became "1." and the names went.
  (Had the names survived, invented hospitals would have reached the customer: worse.)
- **Fix 1, `Helper/ReplyTidy.ts`:** `tidyDraft` works line by line (a list item keeps its number and text, line
  breaks stay); `withoutCentreList` removes a list of centre names written by the LLM with its lead-in line
  (a list of steps or plans stays).
- **Fix 2, pipeline:** on any centre step (location, radius, list, no centre) the system's text is the whole
  reply (`shown` "LOC" / "CENTRE_STEP" -> `replaceReply`); the draft never rides along. Prompt rule added:
  never name or list hospitals.
- **The location question comes before the first centre list** (`locationAskText`, sent as `location_request` =
  the "Send location" button), in the LLM path (`applyResult`), at "suggest one for me"
  (`suggestInsteadOfBooking`) and at "near me" (`handleNearbyAsk`):
  - no area known: `LOCATION_ASK_T` ("... or type the locality and city"), whenever a search needs it;
  - area known: `LOCATION_NEAREST_T` ("To show the centres nearest to the patient, please share the patient's
    location with the button below. Or reply NO and I will search in {place}."), **once per conversation**
    (`locationAsked`: an outbound `location_request` row exists).
- **The answer** (`handleCentreLocationText`, pending `centre_location`): a pin = the list at once, nearest
  first, no radius question (default 10 km); NO / "skip" / "can't share" (`declinesLocation`) = the typed area,
  then the radius question (with the 5 / 10 / 20 km buttons of `Helper/Choices`), then the list; "10 km"
  (`onlyRadius`) = radius saved, list at once; "ok" (`agreesToShare`) = the button once more; a new area typed
  = looked up on the map and saved. "no" is never sent to the geocoder.
- **A pin never lists a centre from another city:** `rankCentres` keeps a centre without a map point only when
  it is in the customer's city (before, with a pin, every centre without coordinates passed).
- Wording `LOCATION_NEAREST_T` (en / hi / hinglish): accepted by the client on 16 Nov, no business-team approval needed.
- Not checked on real WhatsApp. Tests: `LocationAsk.spec.ts`, `ReplyTidy.spec.ts`, the "Real chat, 16 Nov" block
  in `ChatPipeline.plan.spec.ts`.

## Nearby centres with Google Maps Platform (15 Nov)

- Rule kept (Playbook 10): Google Maps says WHERE things are, never WHICH centre to suggest. Customers only
  ever see centres from the verified directory.
- `Service/Maps/GoogleMaps.service.ts` (key `GOOGLE_MAPS_API_KEY`, Settings -> Maps; enable Geocoding API,
  Routes API, Places API (New)): `geocode(text)` (cached for good in `geo_cache`, India only, "approximate"
  results are not used for a radius), `travel(origin, destinations)` (road km + minutes for the centres
  shown), `nearbyCandidates(point)` (hospitals / clinics for the TEAM to verify). No key or any error = null /
  empty: the bot works as before (city text match, straight-line distance). Nothing throws into the chat.
- Chat (`ChatPipeline.service.ts`): "any hospital near me" / "paas mein hospital" (`asksNearby`) or "suggest one"
  with no city known -> a WhatsApp "Send location" button (`location_request` message) + `pending_action =
  centre_location`. Answer = a pin (`handleLocationShare`, also any time a pin arrives) or the area typed
  (`handleCentreLocationText`: geocoded, saved as locality / city). Then the directory search around that
  spot (`originFor`: the pin, else the geocoded locality), list with "about 2.3 km, 9 min". Picking a centre
  also sends its map pin (`location` message). A shared pin is used for that search only and is not stored.
- No verified centre there: one `directory_verification` task per conversation; with Maps on it lists the
  places Google knows nearby ("Not verified, from Google Maps, to check before adding to the directory: ...").
  Never sent to the customer.
- Console: Centres form has Address + "Find on map" (`POST /Console/Centres/Geocode`) and a map preview; a centre
  saved or imported without latitude / longitude gets its point from the address (`centre.address`, migration
  `GeoCache`). "Show on map" (`GET /Console/Centres/Map`): centres, places asked for with no centre, centres
  without a point. The interactive map needs `VITE_GOOGLE_MAPS_BROWSER_KEY` (Maps JavaScript API, a separate
  browser key); without it the lists and "open in Google Maps" links are shown.
- Keys are set in the console, Configuration -> Maps, and apply without a restart: `GOOGLE_MAPS_API_KEY` (server:
  Geocoding, Routes, Places New) and `GOOGLE_MAPS_BROWSER_KEY` (console map, Maps JavaScript API, restricted to the
  site; sent to signed-in console users with the map data). "Test the saved server key" (`POST /Console/Maps/Test`,
  also the Go-live check) makes one real call per API and shows what Google answered. A refused key is reported
  as refused ("Find on map"), never cached as "address not found"; the chat falls back to straight-line distance.
- Bug found and fixed while testing: a shared WhatsApp location never reached the pipeline (the queue rebuilt the
  message from the database row, which has no coordinates). The pin now travels in the BullMQ job
  (`InboundJob.location`); it is still not stored in the database. A pin recovered after a restart asks again.
- Tested end to end on a throwaway database with a local stand-in for Meta and Google (23 checks: key test, Find
  on map, save / import without a point, "near me" -> Send location, pin -> list with road distance, pick -> map
  pin, typed area + cache, no centre -> team task with places, wrong / right / cleared key from the UI).
  NOT yet run against the real Google APIs (no key here): the request shapes follow the documented endpoints;
  press "Test the saved server key" once after saving the real key. [CONFIRM]: the "Send location" wording,
  whether unverified places may ever be shown to customers, whether a shared location may be stored.

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

- `nest build` deletes `dist` first (`deleteOutDir`). Run while `nest start --watch` is serving from the same
  `dist`, the running server can die and the watcher does not restart it (14 Nov: the bot stopped answering).
  For a type check use `npx tsc --noEmit -p tsconfig.json`; build only when no watch server is running.
- `ERROR [MonitoringService] Oxxy bot: inbound_stuck recovered` is good news printed at error level: the
  messages that had no reply (server down) were answered by the recovery sweep.
- A location message has no text: the queue rebuilds the inbound message from the database row, so anything that
  is not stored there must travel in the job (`InboundJob.location`).
- A unit test with a stubbed pipeline did not catch the lost location; the end-to-end run did. For anything that
  crosses the webhook -> queue -> pipeline path, run `scripts/maps-e2e.js` style tests.

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
Tests: `npx jest` in `backend` (1100 passing on 14 Nov); `npx tsc -b`, `npx eslint src`, `npx vite build` in `frontend`.

End-to-end without real services: `backend/scripts/maps-e2e-stub.js` (stands in for Meta and Google on :8799) and
`backend/scripts/maps-e2e.js` (console API + signed webhooks + what was sent; the header lists the environment
overrides). Needs a throwaway Postgres with an empty database and `uuid-ossp`, the backend on :8777, and the LLM
keys empty. Run once per fresh database. 28 checks on 15 Nov.

## Real WhatsApp

`backend/.env` (git-ignored) holds the Phone Number ID, WABA ID and business number. The access token given
on 13 Nov had already expired (Meta: "Session has expired on 12-Nov-26"). Still needed: a permanent
System User token, `WHATSAPP_APP_SECRET` (inbound signature check), a public HTTPS webhook URL, and the
template approvals above. The token was shared in chat, so rotate it. Update 14 Nov: a working token is in
`backend/.env` (it submitted the 10 templates); still to do: permanent System User token, app secret, public webhook.

## Open items (not built yet)

- The Hindi versions of the WhatsApp templates still have to be created and approved in Meta (the code picks
  them up automatically once they are approved, see above).
- The callback target time (`{{Callback_SLA}}`) is not shown to the customer; it waits for the [CONFIRM] value.
- Push `claude/review-fixes` and open the PR (waiting for the go-ahead).
- Not built (14 Nov recheck): an opt-in action in the Actions API (after a CRM opt-out only START on WhatsApp
  re-enables), single sign-on with the CRM (Full Plan 3.5, separate console logins today), a packaged-CRM adapter
  (Plan C, waits for the client's CRM choice), the `{{Callback_SLA}}` line. (The light / dark switch is built.)
- Family / several patients: the bot asks the oldest patient's age only; plan per person or per family waits for
  the pricing decision (Playbook 22.2). "Each one has different medicines?" still gets the fixed medicine reply.
- Not verified on real WhatsApp or with a real LLM: the 14-15 Nov chat fixes (unit tests only), the LLM answer
  reader (`classifyAnswer`), the memory context. The live check was blocked here because it uses the API key:
  run a real chat after the server restart. With gpt-4o-mini the prompt rules can still be missed.
- Slow replies and one "not answered (late)" message on 14 Nov happened while the server was down / restarting;
  check again on a stable server.
- Local Redis is 5.0.14; BullMQ needs Redis 6.2 or newer on the server (the slow p95 in the local load test).

## Pending confirmations (from the 14-15 Nov work)

- CRM contracts assumed [CONFIRM with the CRM team]: `GET {CRM_BASE_URL}/reconciliation/open` (until it exists
  the nightly check fails, and it is skipped while CRM is off), `POST /set_opt_in`, `POST /set_callback_window`.
- `TEAM_HOURS` / `TEAM_DAYS` for the callback windows [CONFIRM with the sales team]; defaults 10-19, Mon-Sat.
- Wordings that are NOT in the documents and need the business team's "okay" (en / hi / hinglish):
  (1) the last line of the callback options "Reply 1, 2 or 3, or tell me another time."; (2) "I do not have a
  verified centre in {place} yet."; (3) "in this or another area" inside the Playbook 10.2 sentence; (4) the
  second no-centre reply ("I still do not have ... I have asked our team to check the options there ...");
  (5) the ESCALATED acknowledgement; (6) the START opt-in reply; (7) "Our team calls between {hours}. Please
  choose one of these times:"; (8) the "Send location" request (`LOCATION_ASK_T`).
- Google Maps: create the two keys and save them in Configuration -> Maps, then press "Test the saved server key"
  (the first real call to Google). Decide: may unverified places ever be shown to customers (today: team only),
  may a shared location be stored (today: no).
- `RETENTION_DAYS`: the period must come from legal [CONFIRM]. Unset means the retention job removes nothing.
- Meta approval for the 8 seeded template names (`wa_template`), plus their Hindi versions; sends refuse
  rejected / paused / disabled ones.
- A server started before a code change keeps serving the old routes ("Cannot GET /api/v1/Console/Templates"
  = an old `dist/main` process): rebuild and restart it.
- Hindi / Hinglish wording needs a native speaker review.
- `CMB_CANCELLATION_METHOD` (Playbook 8 [CONFIRM]) and Oxxy family pricing (1.1 [CONFIRM]): until set, both
  questions go to a person. `ALERT_WEBHOOK_URL` for on-call alerts. (LLM eval done on OpenAI gpt-4o-mini: 97.2%.)
- The throwaway test DB (Postgres on 5544) was dropped and rebuilt on 14 Nov (migrations + development seed: 4 demo
  logins, 3 roles, 10 plan rows, templates; no customers). The local server now reads Meta / LLM values from
  `backend/.env` (real WABA, OpenAI); only DB / Redis / port / CORS are overridden. A Meta sync also lists the
  WABA's other templates (interview_invitation_v2, test, test_demo_sample_123).
- Live WhatsApp path (14 Nov): Meta webhook → cloudflared quick tunnel (`trycloudflare.com`, URL changes when
  cloudflared restarts) → backend on port 8000 (`backend/.env` DB). `frontend/.env.development.local` now points
  the console at `http://localhost:8000` (it pointed at the 8766 test server, so real chats did not show).
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (the name used in `.env`) is accepted for the WABA id, as well as `WHATSAPP_WABA_ID`.

## Decisions waiting for the business team

- "scam" / "fraud" are complaint keywords, so "Is Oxxy a scam?" escalates instead of getting Trigger A.
- Cut Medi Bills break-even: the plan says ₹19,664 a month, but the floor-to-500 rule makes it ₹20,000.
- All `[CONFIRM]` values: renewal terms, activation time for Oxxy plans, GST, Trigger Q delay (4 h),
  the fixed reply texts (en / hi / hinglish drafts).

## Client changes, 16 Nov 2026 (chat flow)
- **Any question is answered.** Before the health-data consent, a general question (or a menu row with no
  health question) is answered at once with no health question (LLM in no-health mode, FAQ, fixed texts);
  the consent notice follows as its own message (`askConsentLater`; later a short reminder). Greetings,
  YES / NO, the "Reduce a medical bill" row and any message with health detail (`sharesHealthDetail`) still
  get the notice first: health detail never reaches the LLM before consent (DPDP).
- **The bot keeps talking after "our team will connect with you".** ESCALATED with no person in the chat
  goes through the normal pipeline; a second "needs a person" says the team already has it
  (`TEAM_HAS_IT_T`, with the chosen callback time and CB- reference), no second task or callback offer.
  Quiet only while a person has taken the chat over, or during a safety PAUSE.
- **More multiple choice.** `Helper/Choices.ts` adds reply buttons (<= 3) or a list (4+) to known bot
  questions: who it is for, need type, one expense / ongoing, yearly spend ranges, travel distance,
  insurance, specialisation, booking dates (next 7) and time of day, callback windows, the centre list,
  plan next step, benefit / price, monthly / annual. Option ids are what the answer readers already parse.
  Applied in `toBubbles` for every reply; validated, so a bad option set falls back to plain text. The LLM
  prompt asks the discovery questions in the matching standard words.
- **Welcome + options when the chat is opened.** Configuration > "Chat opening on WhatsApp" sets Meta's
  conversational automation: the welcome-message event (`request_welcome` -> the bot sends the welcome and
  the 4 options before the customer types) and up to 4 ice breakers (default: the 4 menu row titles).
