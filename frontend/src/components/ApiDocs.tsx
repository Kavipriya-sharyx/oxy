// The integration guide for the client's CRM / voice AI developers (content: data/apiDocs.ts).
// Rendered on Admin > Developer, and rendered to one standalone HTML file for download (interactive = false).
import { useState, type ReactNode } from "react";
import {
  ACTIONS,
  CHECKLIST,
  DOC_VERSION,
  ENUMS,
  ERRORS,
  FEED_EVENTS,
  HARD_RULES,
  SYNC_ACTIONS,
  SYNC_CODE,
  type DocEndpoint,
  type DocField,
} from "../data/apiDocs";

// Scoped under .apidoc. Uses the console tokens when it runs inside the console; the standalone file
// defines its own tokens (STANDALONE_TOKENS).
export const DOC_CSS = `
.apidoc { font-size: 14px; line-height: 1.55; color: var(--fg); }
.apidoc h2 { font-size: 20px; margin: 34px 0 10px; padding-top: 6px; scroll-margin-top: 80px; }
.apidoc h3 { font-size: 15px; margin: 24px 0 8px; scroll-margin-top: 80px; }
.apidoc h4 { font-size: 13px; margin: 14px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.apidoc p { margin: 6px 0 10px; max-width: 80ch; }
.apidoc ul, .apidoc ol { margin: 6px 0 12px; padding-left: 22px; max-width: 86ch; }
.apidoc li { margin: 3px 0; }
.apidoc code { font-family: var(--font-mono); font-size: 12.5px; background: var(--sunk); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
.apidoc .codewrap { position: relative; margin: 8px 0 14px; }
.apidoc pre { font-family: var(--font-mono); font-size: 12.5px; line-height: 1.5; background: #0b2233; color: #e3eef3;
  padding: 12px 14px; border-radius: 8px; overflow-x: auto; margin: 0; white-space: pre; }
.apidoc .codewrap:has(.copy) pre { padding-top: 34px; }
.apidoc .codewrap .copy { position: absolute; top: 6px; right: 6px; font-size: 11px; padding: 3px 9px; border-radius: 999px;
  border: 1px solid #2c4a5c; background: #12344a; color: #e3eef3; cursor: pointer; }
.apidoc table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 13px; }
.apidoc th, .apidoc td { border: 1px solid var(--line); padding: 6px 9px; text-align: left; vertical-align: top; }
.apidoc th { background: var(--sunk); font-weight: 600; }
.apidoc td:first-child code { white-space: nowrap; }
.apidoc .tblwrap { overflow-x: auto; }
.apidoc .ep { border: 1px solid var(--line); border-radius: 10px; padding: 4px 16px 10px; margin: 14px 0; background: var(--surface); }
.apidoc .ep h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.apidoc .verb { font-family: var(--font-mono); font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; color: #fff; }
.apidoc .verb.GET { background: #1f6fb2; } .apidoc .verb.POST { background: #02857c; } .apidoc .verb.PUT { background: #9a5b00; }
.apidoc .path { font-family: var(--font-mono); font-size: 13px; overflow-wrap: anywhere; }
.apidoc .meta { font-size: 12.5px; color: var(--muted); }
.apidoc .toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; }
.apidoc .toc a { font-size: 12.5px; padding: 4px 11px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); text-decoration: none; font-weight: 500; }
.apidoc .flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 10px 0 14px; }
.apidoc .flow div { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--surface); }
.apidoc .flow b { display: block; color: var(--heading); margin-bottom: 4px; }
.apidoc .note { border-left: 3px solid var(--accent); background: var(--accent-soft); padding: 8px 12px; border-radius: 0 8px 8px 0; margin: 10px 0; }
.apidoc .warn { border-left-color: var(--warn); background: var(--warn-soft); }
@media (max-width: 760px) { .apidoc .flow { grid-template-columns: 1fr; } .apidoc .ep { padding: 4px 10px 8px; } }
`;

export const STANDALONE_TOKENS = `
:root { --fg: #16283a; --heading: #023350; --muted: #596d78; --line: #d2e7e2; --sunk: #e9f4f2; --surface: #ffffff;
  --accent: #02857c; --accent-soft: #dcf2ef; --warn: #9a5b00; --warn-soft: #fbecd2;
  --font-ui: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif; --font-head: Outfit, Roboto, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Consolas, monospace; }
body { margin: 0; background: #f2f8f7; font-family: var(--font-ui); }
.page { max-width: 1060px; margin: 0 auto; padding: 28px 16px 60px; }
h1, h2, h3 { font-family: var(--font-head); color: var(--heading); }
h1 { font-size: 28px; margin: 6px 0 4px; }
`;

export const fill = (s: string, base: string) => s.split("{{BASE}}").join(base);

export function Code({ text, interactive }: { text: string; interactive: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="codewrap">
      <pre>{text}</pre>
      {interactive && (
        <button
          type="button"
          className="copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            } catch {
              /* select by hand */
            }
          }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

export function Fields({ rows, title }: { rows: DocField[]; title: string }) {
  return (
    <>
      <h4>{title}</h4>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.name}>
                <td>
                  <code>{f.name}</code>
                </td>
                <td>{f.type}</td>
                <td>{f.req ?? "no"}</td>
                <td>{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="tblwrap">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS: [string, string][] = [
  ["overview", "Overview"],
  ["quick-start", "Quick start"],
  ["auth", "Authentication and conventions"],
  ["actions", "1. Customer actions"],
  ["sync", "2. CRM sync"],
  ["feed-events", "Change types"],
  ["errors", "Errors"],
  ["reference", "Reference values"],
  ["rules", "Business rules"],
  ["checklist", "Go-live checklist"],
];

export function Endpoints({
  list,
  code,
  prefix = "doc-",
}: {
  list: DocEndpoint[];
  code: (t: string) => ReactNode;
  prefix?: string;
}) {
  return (
    <>
      <Table
        head={["Action", "Method and path", "Messages the customer?"]}
        rows={list.map((a) => [
          <a key={a.id} href={`#${prefix}${a.id}`}>
            {a.action}
          </a>,
          <code key="p">
            {a.method} {a.path}
          </code>,
          a.whatsapp,
        ])}
      />
      {list.map((a) => (
        <section className="ep" key={a.id}>
          <h3 id={`${prefix}${a.id}`}>
            <span className={`verb ${a.method}`}>{a.method}</span>
            <span className="path">{a.path}</span>
            <span className="meta">· {a.action}</span>
          </h3>
          <p>{a.summary}</p>
          <p className="meta">Messages the customer: {a.whatsapp}</p>
          {a.params && <Fields rows={a.params} title="Query parameters" />}
          {a.body && <Fields rows={a.body} title="Body" />}
          <h4>Request</h4>
          {code(a.request)}
          <h4>Response</h4>
          {code(a.response)}
          <p>
            <b>Errors:</b> {a.errors}
          </p>
          {a.notes && (
            <ul>
              {a.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

export default function ApiDocs({
  base,
  interactive = true,
  title = true,
}: {
  base: string;
  interactive?: boolean;
  title?: boolean;
}) {
  const actionsBase = `${base}/api/v1/Actions`;
  const code = (t: string) => <Code text={fill(t, base)} interactive={interactive} />;

  return (
    <div className="apidoc">
      {title && (
        <>
          <div className="meta">Oxxy WhatsApp AI · Version {DOC_VERSION}</div>
          <h1 style={{ margin: "4px 0 6px" }}>CRM and voice AI integration guide</h1>
        </>
      )}
      <p>
        Everything your CRM and voice AI developers need to connect to the Oxxy WhatsApp bot. It
        follows the Oxxy Playbook section 17 (CRM and integration specification), the Full
        Development Plan sections 3.1 to 3.5 and the Trigger layer section 13. Server:{" "}
        <code>{base}</code>
      </p>
      <nav className="toc" aria-label="Contents">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#doc-${id}`}>
            {label}
          </a>
        ))}
      </nav>

      {/* ------------------------------------------------------------------ overview */}
      <h2 id="doc-overview">Overview</h2>
      <p>
        Your CRM stays the record for customers, bookings, tasks and payments. The bot owns the
        WhatsApp conversation and every Playbook rule. <b>Your systems only call the bot's API</b>:
        you do not build anything the bot calls, and there are no webhooks to receive.
      </p>
      <div className="flow">
        <div>
          <b>1. Customer actions</b>
          Your CRM / voice AI asks the bot: look up a customer, find verified centres, record a
          booking request, schedule a follow-up, read the official price, send approved content,
          escalate, opt out, start a WhatsApp chat.
        </div>
        <div>
          <b>2. CRM sync: read</b>
          Import customers, bookings, tasks and payments once, then poll the changes feed every 30
          to 60 seconds. Every new booking, task, payment link, opt-out and trigger appears there,
          in order.
        </div>
        <div>
          <b>2. CRM sync: update</b>
          When your sales team confirms, reschedules or cancels a booking, records a payment or
          closes a task, call the bot. The bot sends the customer the matching WhatsApp message.
        </div>
      </div>
      <Table
        head={["You get from Oxxy", "Oxxy needs from you"]}
        rows={[
          [
            <>
              Base URL <code>{base}</code> (sandbox first, then production)
            </>,
            "Who in your team confirms bookings and records payments (they use the update calls)",
          ],
          [
            "An API key per system and environment (header X-Api-Key)",
            "Which of the Playbook 17 field groups your CRM stores (field mapping)",
          ],
          [
            "The Postman collection with every call",
            "Whether your voice AI starts WhatsApp chats (StartConversation)",
          ],
        ]}
      />
      <div className="note">
        Keys are shown once when they are made. Share them through a password manager, never by
        WhatsApp or email. Keep them on your servers only. Use HTTPS only.
      </div>

      {/* ------------------------------------------------------------------ quick start */}
      <h2 id="doc-quick-start">Quick start</h2>
      <ol>
        <li>
          Get an API key from the Oxxy team (one per system and environment, e.g. "CRM - sandbox").
        </li>
        <li>
          Check it works:
          {code(
            `export OXXY_API_KEY="oxk_test_…"\ncurl -H "X-Api-Key: $OXXY_API_KEY" "{{BASE}}/api/v1/Actions/Changes?after=0&limit=5"`,
          )}
        </li>
        <li>Import the Postman collection, set base_url and api_key, and try every call.</li>
        <li>
          First import: page through <code>Customers</code>, then{" "}
          <code>BookingRequests?status=all</code>, <code>Tasks?status=all</code> and{" "}
          <code>Activations?payment_status=all</code>.
        </li>
        <li>
          Start polling <code>Changes</code> with the last <code>seq</code> you stored, and wire
          your sales screens to Confirm, Reschedule, Cancel, Payment and Complete.
        </li>
      </ol>

      {/* ------------------------------------------------------------------ auth */}
      <h2 id="doc-auth">Authentication and conventions</h2>
      <Table
        head={["Topic", "Rule"]}
        rows={[
          [
            "Actions API auth",
            <>
              Header <code>X-Api-Key: &lt;key&gt;</code>. Wrong, expired or revoked key: 401. Keep
              keys on your servers only, never in a browser or mobile app.
            </>,
          ],
          [
            "Format",
            <>
              JSON in and out, <code>Content-Type: application/json</code>. UTF-8.
            </>,
          ],
          [
            "Which customer",
            <>
              Every customer action takes <code>customer_id</code> (the bot's UUID, from
              LookupCustomer) or <code>wa_number</code>. Numbers are normalised:{" "}
              <code>+91 98400 12345</code>, <code>09840012345</code> and <code>9840012345</code> all
              mean <code>919840012345</code>.
            </>,
          ],
          [
            "Times",
            <>
              ISO 8601 with an offset (<code>2026-11-20T11:00:00+05:30</code>) or UTC (
              <code>…Z</code>). The bot answers in UTC. Booking dates are plain{" "}
              <code>YYYY-MM-DD</code>, checked in Asia/Kolkata.
            </>,
          ],
          [
            "Money",
            <>
              Rupees as numbers, without GST unless the field says incl_gst. <code>gst_rate</code>{" "}
              is a fraction (0.18).
            </>,
          ],
          [
            "source",
            <>
              Optional on writes, for the trigger log and KPIs: <code>voice_ai</code>,{" "}
              <code>whatsapp_inbound</code>, <code>whatsapp_outbound</code>,{" "}
              <code>human_agent</code>, <code>crm</code> (default).
            </>,
          ],
          ["Timeouts", "Answers take well under a second. Use a 5-second timeout."],
          [
            "Retries",
            "GET calls and OptOut are safe to retry. BookingRequests is not idempotent: after a timeout, call LookupCustomer and check open_bookings before retrying.",
          ],
          [
            "Health data",
            "Never send diagnoses or medical details in reason / summary fields. The bot never sends them to you either.",
          ],
        ]}
      />

      {/* ------------------------------------------------------------------ actions */}
      <h2 id="doc-actions">1. Customer actions (your CRM / voice AI → bot)</h2>
      <p>
        Base URL <code>{actionsBase}</code>. The bot applies every business rule itself: a caller
        cannot book outside the date window, send unapproved content, message an opted-out customer
        or skip quiet hours.
      </p>
      <Endpoints list={ACTIONS} code={code} />

      {/* ------------------------------------------------------------------ sync */}
      <h2 id="doc-sync">2. CRM sync (your CRM reads and updates)</h2>
      <p>
        Your CRM keeps its own copy by reading from the bot, and tells the bot what your sales team
        did. The update calls do the same work the bot does when a person acts in the Oxxy console:
        the customer gets the right WhatsApp message, the one-product lock and reminders are
        handled.
      </p>
      <h3>How to stay in sync</h3>
      <ol>
        <li>
          Import once: Customers, BookingRequests?status=all, Tasks?status=all,
          Activations?payment_status=all.
        </li>
        <li>
          Note the newest <code>seq</code> from <code>Changes</code> before you start the import, so
          nothing made during the import is missed (a change you already have is safe to apply
          again: upsert by the bot's ids).
        </li>
        <li>
          Every 30 to 60 seconds, read Changes after your stored seq; apply each change; store
          next_after.
        </li>
        <li>When your team acts, call Confirm / Reschedule / Cancel / Payment / Complete.</li>
      </ol>
      {code(SYNC_CODE.node)}
      {code(SYNC_CODE.python)}
      <Endpoints list={SYNC_ACTIONS} code={code} />

      <h3 id="doc-feed-events">Change types in the feed</h3>
      <p>
        Each change has <code>seq</code>, <code>type</code>, <code>customer_id</code>,{" "}
        <code>data</code> and <code>created_at</code>. Upsert by the bot's ids (customer_id,
        booking_id, task_id, activation_id). Unknown types may be added later: log and skip them.
      </p>
      <Table
        head={["type", "When", "data fields"]}
        rows={FEED_EVENTS.map((e) => [<code key="t">{e.type}</code>, e.when, e.data])}
      />

      {/* ------------------------------------------------------------------ errors */}
      <h2 id="doc-errors">Errors</h2>
      <p>
        Every Actions API error has the same shape and a real HTTP status. Branch on code; show
        message to people.
      </p>
      {code(`{ "error": true, "status": 400, "code": "date_out_of_window",
  "message": "preferred_date must be between 2026-11-17 and 2027-05-14 (Asia/Kolkata)",
  "reason": "too_soon", "min": "2026-11-17", "max": "2027-05-14" }`)}
      <Table
        head={["Status", "code", "Meaning"]}
        rows={ERRORS.map(([s, c, m]) => [String(s), <code key="c">{c}</code>, m])}
      />

      {/* ------------------------------------------------------------------ reference */}
      <h2 id="doc-reference">Reference values</h2>
      <Table head={["Name", "Values"]} rows={ENUMS.map(([n, v]) => [n, v])} />
      <h3>Playbook 17 field groups</h3>
      <p>
        The full record is available from{" "}
        <a href="#doc-customer-record">GET …/Customers/{"{id}"}/Record</a>. Agree with the Oxxy team
        which of these groups your CRM stores as custom fields.
      </p>
      <Table
        head={["Group", "Fields"]}
        rows={[
          ["Identity", "lead_id, customer_id, first_name, WhatsApp number, language, timezone"],
          [
            "Consent",
            "source, consent_timestamp, whatsapp_consent, marketing_consent, opt_out_timestamp, privacy_request, health_data_consent, consent_notice_version, retention_until",
          ],
          [
            "Need",
            "beneficiary, age, specialisation, urgency, service_date (condition and expected bill stay in the bot)",
          ],
          ["Location", "city, locality, postcode_if_available, travel_radius_km"],
          [
            "Provider",
            "preferred_centre, branch, private_status_verified, verification_source, suggested_centres[]",
          ],
          ["Eligibility", "appointment_status, registration_status, treatment_status, bill_status"],
          [
            "Routing",
            "selected_product, recommended_plan, recommendation_reason, alternate_product_suppressed, value_check_passed",
          ],
          [
            "Booking",
            "booking_request_id, centre, branch, specialisation, preferred_date, preferred_time, status, created_at",
          ],
          [
            "Activation",
            "plan, price, GST, renewal_terms_shown, activation_link_sent_at, payment_status, activation_status",
          ],
          [
            "Engagement",
            "last_state, last_intent, rescue_attempts, objection, follow_up_at, escalation_reason, outcome",
          ],
          ["Content", "documents_sent, links_sent, comparison_sent, testimonial_or_media_sent"],
          [
            "Trigger events",
            "trigger_id, trigger_reason, conversation_source, asset_ids, cta, customer_response, next_state, conversion_attribution, suppression_reason",
          ],
        ]}
      />

      {/* ------------------------------------------------------------------ rules */}
      <h2 id="doc-rules">Business rules your CRM should also enforce</h2>
      <p>
        The bot checks these before every call; the Full Development Plan 3.4 asks the CRM to reject
        the same cases itself.
      </p>
      <ul>
        {HARD_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {/* ------------------------------------------------------------------ checklist */}
      <h2 id="doc-checklist">Go-live checklist</h2>
      <ol>
        {CHECKLIST.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="note warn">
        Paths marked [Path to agree] and the nightly /reconciliation/open check are proposals:
        confirm them with the Oxxy team before you build them.
      </div>
    </div>
  );
}
