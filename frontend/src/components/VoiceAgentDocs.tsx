// The guide for the client's voice agent developers (content: data/voiceDocs.ts, endpoints shared with the CRM
// guide). Rendered on Admin > Developer > Voice agent API docs, and as one standalone HTML file for download.
import { Code, Endpoints, Table, fill } from "./ApiDocs";
import { ERRORS } from "../data/apiDocs";
import {
  VOICE_ACTIONS,
  VOICE_CHECKLIST,
  VOICE_CODE,
  VOICE_CONSENT_LINES,
  VOICE_CONTEXT_MAP,
  VOICE_DOC_VERSION,
  VOICE_FLOW,
  VOICE_RULES,
  VOICE_STATUS,
} from "../data/voiceDocs";

const SECTIONS: [string, string][] = [
  ["overview", "Overview"],
  ["flow", "Call flow"],
  ["consent", "WhatsApp consent"],
  ["context", "Call context"],
  ["status", "What to say"],
  ["auth", "Authentication"],
  ["calls", "API calls"],
  ["code", "Example code"],
  ["errors", "Errors"],
  ["rules", "Rules"],
  ["checklist", "Go-live checklist"],
];

const P = "voice-";

export default function VoiceAgentDocs({
  base,
  interactive = true,
}: {
  base: string;
  interactive?: boolean;
}) {
  const code = (t: string) => <Code text={fill(t, base)} interactive={interactive} />;
  return (
    <div className="apidoc">
      <div className="meta">Oxxy WhatsApp AI · Voice agent guide · Version {VOICE_DOC_VERSION}</div>
      <h1 style={{ margin: "4px 0 6px" }}>Voice agent integration guide</h1>
      <p>
        For the developers of the voice agent that calls Oxxy customers. When a customer on the
        phone wants the details on WhatsApp, the voice agent hands the conversation to the Oxxy
        WhatsApp bot with one API call, and tells the bot what was already said so the customer is
        not asked again. Server: <code>{base}</code>
      </p>
      <nav className="toc" aria-label="Contents">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${P}${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <h2 id={`${P}overview`}>Overview</h2>
      <div className="flow">
        <div>
          <b>On the call</b>
          The voice agent talks to the customer. It can look the customer up, read the official
          price, find verified centres and record a booking request through the same API the CRM
          uses.
        </div>
        <div>
          <b>Hand over to WhatsApp</b>
          The customer agrees to WhatsApp. One call to <code>StartConversation</code> with the
          number and the call's context. The bot sends the first message with three buttons.
        </div>
        <div>
          <b>On WhatsApp</b>
          The bot continues: answers questions, suggests centres, records bookings, sends the
          official link. Your CRM sees it all in its own feed.
        </div>
      </div>
      <div className="note">
        The voice agent gets its own API key (header <code>X-Api-Key</code>), separate from the
        CRM's, so each can be revoked alone. Keep it on your servers only.
      </div>

      <h2 id={`${P}flow`}>Call flow</h2>
      <Table
        head={["Step", "Call", "Why"]}
        rows={VOICE_FLOW.map(([s, c, w]) => [<b key="s">{s}</b>, <code key="c">{c}</code>, w])}
      />

      <h2 id={`${P}consent`}>WhatsApp consent on the call</h2>
      <p>
        WhatsApp allows the first message only to people who agreed to get it. Ask on the call, and
        send <code>whatsapp_consent: true</code> and <code>consent_source: "voice_ai"</code> only
        after a clear yes. Suggested lines (to confirm with Oxxy):
      </p>
      <Table head={["Language", "Line"]} rows={VOICE_CONSENT_LINES.map(([l, t]) => [l, t])} />

      <h2 id={`${P}context`}>Call context</h2>
      <p>
        Send what the customer already said in <code>context</code>. The bot treats it as known for
        7 days and asks only for what is missing. Everything is optional; send what you have.
      </p>
      <Table
        head={["From the call", "Field", "Example"]}
        rows={VOICE_CONTEXT_MAP.map(([w, f, e]) => [w, <code key="f">{f}</code>, e])}
      />

      <h2 id={`${P}status`}>What to say after StartConversation</h2>
      <Table
        head={["Answer", "Meaning", "The voice agent says"]}
        rows={VOICE_STATUS.map(([a, m, s]) => [<code key="a">{a}</code>, m, s])}
      />

      <h2 id={`${P}auth`}>Authentication and conventions</h2>
      <ul>
        <li>
          Header <code>X-Api-Key: &lt;voice agent key&gt;</code> on every call. Wrong, expired or
          revoked key: 401.
        </li>
        <li>JSON in and out; HTTPS only; use a 5-second timeout.</li>
        <li>
          Phone numbers in any Indian format: <code>+91 98400 12345</code>, <code>09840012345</code>{" "}
          and <code>9840012345</code> are the same customer.
        </li>
        <li>
          Times are ISO 8601 with an offset, e.g. <code>2026-11-20T17:00:00+05:30</code>. Booking
          dates are <code>YYYY-MM-DD</code> (Asia/Kolkata).
        </li>
        <li>
          Send <code>"source": "voice_ai"</code> on writes, so the reports show what the voice agent
          did.
        </li>
      </ul>

      <h2 id={`${P}calls`}>API calls the voice agent uses</h2>
      <div className="note">
        The phone number is enough: every call below takes <code>wa_number</code>. You never need
        the bot's <code>customer_id</code>; it comes back from LookupCustomer and StartConversation
        if you want to keep it. LookupCustomer answering 404 <code>customer_not_found</code> just
        means a new lead: StartConversation creates the customer.
      </div>
      <Endpoints list={VOICE_ACTIONS} code={code} prefix={P} />

      <h2 id={`${P}code`}>Example code</h2>
      {code(VOICE_CODE.node)}
      {code(VOICE_CODE.python)}

      <h2 id={`${P}errors`}>Errors</h2>
      <p>Every error has the same shape: branch on code.</p>
      {code(
        `{ "error": true, "status": 403, "code": "opted_out", "message": "The customer opted out" }`,
      )}
      <Table
        head={["Status", "code", "Meaning"]}
        rows={ERRORS.map(([s, c, m]) => [String(s), <code key="c">{c}</code>, m])}
      />

      <h2 id={`${P}rules`}>Rules for the voice agent</h2>
      <ul>
        {VOICE_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <h2 id={`${P}checklist`}>Go-live checklist</h2>
      <ol>
        {VOICE_CHECKLIST.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
    </div>
  );
}
