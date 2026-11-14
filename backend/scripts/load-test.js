#!/usr/bin/env node
// Load test (Full Plan 11): signed WhatsApp webhooks at a steady rate, then the time until each customer
// gets the bot's first reply. Run it against a test stack ONLY: the backend must point WHATSAPP_API_BASE
// (and the LLM base URL) at a stub that records what would be sent and serves it at GET <stub>/_sent
// (a list of Cloud API message bodies with a `to` field). Never run it against the real Meta API.
//
//   node scripts/load-test.js --rate 10 --seconds 60 --customers 200 \
//     --url http://localhost:8766/api/v1/Whatsapp/Webhook --stub http://localhost:8799 --secret appsecret
//
// Prints sent / accepted / replied counts and p50 / p95 / max reply time; writes load-report.json.
// Exit code 1 when p95 is over --p95 seconds (default 8) or under 99% of messages got a reply.
/* eslint-disable @typescript-eslint/no-require-imports */
const nodeCrypto = require("crypto");
const { writeFileSync } = require("fs");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []),
);
const RATE = Number(args.rate || 5); // messages per second
const SECONDS = Number(args.seconds || 30);
const CUSTOMERS = Number(args.customers || 100); // distinct WhatsApp numbers
const TARGET = args.url || "http://localhost:8766/api/v1/Whatsapp/Webhook";
const STUB = (args.stub || "http://localhost:8799").replace(/\/$/, "");
const SECRET = args.secret || process.env.WHATSAPP_APP_SECRET || "appsecret";
const P95_LIMIT = Number(args.p95 || 8);
const WAIT_AFTER = Number(args.wait || 60); // seconds to keep collecting replies after the last send

if (/graph\.facebook\.com/.test(STUB)) {
  console.error("refusing to run: --stub must be a local test stub, not the Meta API");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MESSAGES = ["Hi", "I need help with medical bills", "My mother needs regular checkups", "Which hospitals are near Adyar?", "How does it work?"];
const number = (i) => `9199${String(100000 + i).padStart(8, "0")}`;

// one message per customer in flight: the next message to a number waits for its reply (real users do)
const waiting = new Map(); // wa -> sent time (ms)
const latencies = [];
let sent = 0;
let accepted = 0;
let failed = 0;
let replied = 0;

async function send(wa, text) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      contacts: [{ profile: { name: "Load" }, wa_id: wa }],
      messages: [{ from: wa, id: `wamid.LOAD${Date.now()}${Math.random().toString(36).slice(2)}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  const sig = "sha256=" + nodeCrypto.createHmac("sha256", SECRET).update(body).digest("hex");
  sent++;
  waiting.set(wa, Date.now());
  try {
    const r = await fetch(TARGET, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
    if (r.ok) accepted++;
    else {
      failed++;
      waiting.delete(wa);
    }
  } catch {
    failed++;
    waiting.delete(wa);
  }
}

async function collect() {
  try {
    const out = await (await fetch(`${STUB}/_sent`)).json();
    const now = Date.now();
    for (const m of out) {
      const t0 = waiting.get(m.to);
      if (t0 == null) continue; // a second bubble of the same reply, or not ours
      latencies.push((now - t0) / 1000);
      waiting.delete(m.to);
      replied++;
    }
  } catch {
    /* stub not ready: try again */
  }
}

const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

(async () => {
  await fetch(`${STUB}/_sent`).catch(() => {
    console.error(`stub ${STUB} is not reachable`);
    process.exit(2);
  });
  console.log(`load: ${RATE} msg/s for ${SECONDS}s over ${CUSTOMERS} customers -> ${TARGET}`);
  const poller = setInterval(collect, 250);
  let next = 0;
  const total = RATE * SECONDS;
  const started = Date.now();
  for (let k = 0; k < total; k++) {
    // the next customer who is not waiting for a reply
    let wa = null;
    for (let tries = 0; tries < CUSTOMERS && !wa; tries++) {
      const cand = number(next++ % CUSTOMERS);
      if (!waiting.has(cand)) wa = cand;
    }
    if (wa) send(wa, MESSAGES[k % MESSAGES.length]);
    const due = started + ((k + 1) * 1000) / RATE;
    await sleep(Math.max(0, due - Date.now()));
  }
  const end = Date.now() + WAIT_AFTER * 1000;
  while (waiting.size && Date.now() < end) await sleep(250);
  clearInterval(poller);
  await collect();

  const report = {
    at: new Date().toISOString(),
    rate: RATE,
    seconds: SECONDS,
    customers: CUSTOMERS,
    sent,
    accepted,
    failed,
    replied,
    no_reply: waiting.size,
    p50_s: pct(latencies, 50),
    p95_s: pct(latencies, 95),
    max_s: latencies.length ? Math.max(...latencies) : null,
  };
  writeFileSync("load-report.json", JSON.stringify(report, null, 2));
  console.log(report);
  const okReplies = accepted ? replied / accepted : 0;
  if (report.p95_s == null || report.p95_s > P95_LIMIT || okReplies < 0.99) {
    console.log(`FAIL: p95 ${report.p95_s}s (limit ${P95_LIMIT}s), replies ${(okReplies * 100).toFixed(1)}% (need 99%)`);
    process.exitCode = 1;
  } else console.log("PASS");
})();
