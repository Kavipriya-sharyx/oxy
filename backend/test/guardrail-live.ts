/* eslint-disable no-console */
// Live check of the guardrails with signed fake WhatsApp webhooks.
//
//   npx nest build && npx ts-node --transpile-only test/guardrail-live.ts
//
// Safe by design:
//  - creates a THROWAWAY Postgres database (never the one in .env) and drops it at the end
//  - uses its own Redis db number and queue prefix, removes its keys at the end
//  - WhatsApp sends AND Anthropic calls go to a local mock server (nothing leaves this machine)
// Uses only the Postgres admin login from backend/.env to CREATE / DROP the throwaway database.
import { ChildProcess, spawn, spawnSync } from "child_process";
import { createHmac, randomBytes } from "crypto";
import http from "http";
import net from "net";
import { Client } from "pg";
import Redis from "ioredis";
import { FIXED_REPLIES, NOTICE_VERSION } from "../src/Helper/FixedReplies";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env: real environment only */
}

const APP_SECRET = "live-check-secret";
const PHONE_ID = "PHONE_LIVE";
const API_VERSION = "v21.0";
const devDbName = process.env.DB_NAME;
const dbName = `oxxy_live_guardrail_${Date.now()}`;
const queuePrefix = `oxxy-live-${randomBytes(3).toString("hex")}`;
const HEALTH_WORDS = /\b(chest|pain|die|dying|suicide|breath\w*|heart|stroke|seizure|kill\w*|hurt\w*)\b/i;

interface Sent {
  to: string;
  body: string;
  kind: string; // text | list | ...
  rows: string[]; // list row ids
}
const waSent: Sent[] = [];
let claudeCalls = 0;
let appLog = "";
let app: ChildProcess | null = null;
let mock: http.Server | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

function startMock(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.url?.includes("/messages") && req.url.includes(PHONE_ID)) {
        const b = JSON.parse(raw || "{}");
        const rows = (b.interactive?.action?.sections?.[0]?.rows ?? []).map((r: { id: string }) => r.id);
        waSent.push({
          to: b.to,
          body: b.text?.body ?? b.interactive?.body?.text ?? JSON.stringify(b),
          kind: b.type === "interactive" ? b.interactive.type : "text",
          rows,
        });
        return json(200, { messages: [{ id: `wamid.MOCKOUT.${waSent.length}` }] });
      }
      if (req.url?.startsWith("/v1/messages")) {
        claudeCalls++; // the Anthropic API: counted, answered with a 400 (no SDK retries)
        return json(400, { type: "error", error: { type: "invalid_request_error", message: "mock" } });
      }
      if (req.url?.startsWith("/crm/")) return json(200, { id: "crm-mock-1" }); // the CRM: accepts everything
      json(404, { error: "mock: unknown route " + req.url });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function replyKey(text: string): string {
  for (const [key, langs] of Object.entries(FIXED_REPLIES))
    for (const [lang, t] of Object.entries(langs)) if (t === text) return `${key} (${lang})`;
  return "(not a fixed reply)";
}

function payload(from: string, wamid: string, text: string) {
  // "tap:<row id>" = the customer taps a row of a list message (WhatsApp sends an interactive list_reply)
  const tap = text.startsWith("tap:") ? text.slice(4) : null;
  const content = tap
    ? { type: "interactive", interactive: { type: "list_reply", list_reply: { id: tap, title: tap } } }
    : { type: "text", text: { body: text } };
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: PHONE_ID },
              contacts: [{ profile: { name: "Live Check" }, wa_id: from }],
              messages: [
                {
                  from,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  ...content,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function post(appPort: number, from: string, wamid: string, text: string) {
  const body = JSON.stringify(payload(from, wamid, text));
  const sig = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
  const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/Whatsapp/Webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  if (res.status !== 200) throw new Error(`webhook answered ${res.status}`);
}

async function waitFor(cond: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await sleep(250);
  }
  return false;
}

interface Row {
  state: string | null;
  tasks: { type: string; priority: string; summary: string }[];
  opt_out_at: Date | null;
  marketing_consent: boolean | null;
  outbox: string[];
  consent: Record<string, unknown> | null; // health-data consent columns
}

async function snapshot(db: Client, number: string): Promise<Row> {
  const c = (await db.query("select id from customer where wa_number = $1", [number])).rows[0];
  if (!c) return { state: null, tasks: [], opt_out_at: null, marketing_consent: null, outbox: [], consent: null };
  const conv = (await db.query("select state from conversation where customer_id = $1 order by created_on desc limit 1", [c.id])).rows[0];
  const tasks = (await db.query("select type, priority, summary from task where customer_id = $1 order by created_on", [c.id])).rows;
  const cons = (await db.query("select opt_out_at, marketing_consent, health_data_consent, notice_version, consent_timestamp, consent_source, health_refused_at, health_refused_version, notice_sent_version from consent where customer_id = $1", [c.id])).rows[0];
  const outbox = (await db.query("select action from crm_outbox where customer_id = $1 order by created_on", [c.id])).rows.map((r) => r.action);
  return { state: conv?.state ?? null, tasks, opt_out_at: cons?.opt_out_at ?? null, marketing_consent: cons?.marketing_consent ?? null, outbox, consent: cons ?? null };
}

interface Case {
  name: string;
  text: string; // the first (or only) message
  more?: string[]; // later messages from the same customer, one after the other
  twice?: boolean;
  check: (r: { replies: string[]; keys: string[]; row: Row; claude: number; sent: Sent[] }) => string[]; // problems
}

const only = (keys: string[], k: string) => (keys.length === 1 && keys[0].startsWith(k) ? [] : [`expected exactly one ${k} reply, got [${keys.join(", ")}]`]);
const must = (ok: boolean, msg: string) => (ok ? [] : [msg]);

const cases: Case[] = [
  {
    name: "1. emergency",
    text: "I have chest pain",
    check: ({ keys, row, claude }) => [
      ...only(keys, "emergency"),
      ...must(row.state === "pause", `state ${row.state}, expected pause`),
      ...must(row.tasks.length === 1 && row.tasks[0].type === "emergency" && row.tasks[0].priority === "urgent", "expected one urgent emergency task"),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "2. self-harm",
    text: "I want to die",
    check: ({ replies, keys, row, claude }) => [
      ...only(keys, "self_harm"),
      ...must(replies[0]?.includes("14416") ?? false, "reply has no 14416"),
      ...must(row.state === "pause", `state ${row.state}, expected pause`),
      ...must(row.tasks.length === 1 && row.tasks[0].type === "self_harm" && row.tasks[0].priority === "urgent", "expected one urgent self_harm task"),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "3. STOP",
    text: "STOP",
    check: ({ keys, row, claude }) => [
      ...only(keys, "opt_out"),
      ...must(row.state === "opted_out", `state ${row.state}, expected opted_out`),
      ...must(!!row.opt_out_at, "consent.opt_out_at not set"),
      ...must(row.marketing_consent === false, "marketing_consent not false"),
      ...must(row.outbox.includes("set_opt_out"), "no set_opt_out row in crm_outbox"),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "4. talk to a human",
    text: "I want to talk to a human",
    check: ({ keys, row, claude }) => [
      ...only(keys, "escalation"),
      ...must(row.state === "escalated", `state ${row.state}, expected escalated`),
      ...must(row.tasks.length === 1 && row.tasks[0].type === "escalation", "expected one escalation task"),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "5. STOP + emergency",
    text: "STOP, I have chest pain",
    check: ({ keys, row, claude }) => [
      ...only(keys, "emergency"),
      ...must(row.state === "opted_out", `state ${row.state}, expected opted_out`),
      ...must(!!row.opt_out_at && row.outbox.includes("set_opt_out"), "opt-out not fully recorded"),
      ...must(row.tasks.length === 1 && row.tasks[0].type === "emergency", "expected one emergency task"),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "6. same wamid twice",
    text: "I have chest pain",
    twice: true,
    check: ({ keys, row, claude }) => [
      ...only(keys, "emergency"),
      ...must(row.tasks.length === 1, `${row.tasks.length} tasks, expected 1`),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "7. normal message, no consent yet",
    text: "bus stop timing",
    check: ({ keys, row, claude }) => [
      ...only(keys, "health_notice"),
      ...must(claude === 0, `Claude was called ${claude}x before consent`),
      ...must(row.consent?.health_data_consent === false && row.consent?.notice_sent_version === NOTICE_VERSION, "notice not recorded"),
    ],
  },
  {
    name: "8. consent YES -> welcome + list, then a normal question",
    text: "hello",
    more: ["YES", "bus stop timing"],
    check: ({ keys, row, claude, sent }) => [
      ...must(keys[0]?.startsWith("health_notice"), `first reply was not the notice: [${keys.join(", ")}]`),
      ...must(sent[1]?.kind === "list" && sent[1].rows.length === 4, "after YES: expected the 4-row opening list"),
      ...must(row.consent?.health_data_consent === true, "health_data_consent not true"),
      ...must(row.consent?.notice_version === NOTICE_VERSION, "notice_version not the current one"),
      ...must(!!row.consent?.consent_timestamp && !!row.consent?.consent_source, "consent timestamp / source missing"),
      ...must(claude >= 1, "Claude not reached for free text after the list"),
      ...must(row.state === "discovery", `state ${row.state}, expected discovery`),
    ],
  },
  {
    name: "9. consent NO, then a normal question",
    text: "hello",
    more: ["no", "what plans do you have"],
    check: ({ keys, row }) => [
      ...must(keys[0]?.startsWith("health_notice") && keys[1]?.startsWith("health_consent_no"), `expected notice then consent_no, got [${keys.join(", ")}]`),
      ...must(row.consent?.health_data_consent === false && !!row.consent?.health_refused_at, "refusal not saved"),
      ...must(row.consent?.health_refused_version === NOTICE_VERSION, "refused version wrong"),
      ...must(keys.filter((k) => k.startsWith("health_notice")).length === 1, "the notice was asked again"),
    ],
  },
  {
    name: "10. tap list row menu_need -> need_discovery",
    text: "hello",
    more: ["YES", "tap:menu_need"],
    check: ({ sent, row, claude }) => [
      ...must(sent.length === 3, `expected 3 messages (notice, list, row reply), got ${sent.length}`),
      ...must(sent[1]?.kind === "list" && sent[1].rows.join() === "menu_need,menu_explain,menu_service,menu_followup", "opening list rows wrong"),
      ...must(sent[2]?.kind === "text", "row reply is not a text"),
      ...must(row.state === "need_discovery", `state ${row.state}, expected need_discovery`),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "11. tap list row menu_explain -> oxxy_explain",
    text: "hello",
    more: ["YES", "tap:menu_explain"],
    check: ({ sent, row, claude }) => [
      ...must(sent.length === 3, `expected 3 messages (notice, list, row reply), got ${sent.length}`),
      ...must(sent[1]?.kind === "list" && sent[1].rows.join() === "menu_need,menu_explain,menu_service,menu_followup", "opening list rows wrong"),
      ...must(sent[2]?.kind === "text", "row reply is not a text"),
      ...must(row.state === "oxxy_explain", `state ${row.state}, expected oxxy_explain`),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "12. tap list row menu_service -> service_or_escalation",
    text: "hello",
    more: ["YES", "tap:menu_service"],
    check: ({ sent, row, claude }) => [
      ...must(sent.length === 3, `expected 3 messages (notice, list, row reply), got ${sent.length}`),
      ...must(sent[1]?.kind === "list" && sent[1].rows.join() === "menu_need,menu_explain,menu_service,menu_followup", "opening list rows wrong"),
      ...must(sent[2]?.kind === "text", "row reply is not a text"),
      ...must(row.state === "service_or_escalation", `state ${row.state}, expected service_or_escalation`),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
  {
    name: "13. tap list row menu_followup -> follow_up_time",
    text: "hello",
    more: ["YES", "tap:menu_followup"],
    check: ({ sent, row, claude }) => [
      ...must(sent.length === 3, `expected 3 messages (notice, list, row reply), got ${sent.length}`),
      ...must(sent[1]?.kind === "list" && sent[1].rows.join() === "menu_need,menu_explain,menu_service,menu_followup", "opening list rows wrong"),
      ...must(sent[2]?.kind === "text", "row reply is not a text"),
      ...must(row.state === "follow_up_time", `state ${row.state}, expected follow_up_time`),
      ...must(claude === 0, `Claude was called ${claude}x`),
    ],
  },
];

async function main(): Promise<number> {
  if (!process.env.DB_USER || devDbName === dbName) throw new Error("DB admin login missing in .env");
  const admin = new Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: "postgres",
  });
  await admin.connect();
  let db: Client | null = null;
  let redisDb = 0;
  let redis: Redis | null = null;
  let failures = 0;
  try {
    // --- throwaway database + schema
    await admin.query(`create database "${dbName}"`);
    console.log(`throwaway database: ${dbName}   (dev database "${devDbName}" is never touched)`);

    redis = new Redis({ host: process.env.REDIS_HOST || "localhost", port: Number(process.env.REDIS_PORT) || 6379 });
    for (redisDb = 12; redisDb >= 8; redisDb--) {
      await redis.select(redisDb);
      if ((await redis.dbsize()) === 0) break;
    }
    if (redisDb < 8) throw new Error("no empty Redis db number found between 8 and 12");
    console.log(`redis db ${redisDb}, queue prefix ${queuePrefix}`);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DB_NAME: dbName,
      DB_SYNC: "true",
      DB_SEED: "false",
      REDIS_DB: String(redisDb),
      QUEUE_PREFIX: queuePrefix,
    };
    // schema: created from the entities by DB_SYNC=true (same as the dev setup; the SQL migrations need PostGIS)

    // --- mock WhatsApp + Anthropic, then the app
    const mockPort = await freePort();
    mock = await startMock(mockPort);
    const appPort = await freePort();
    // Windows: start the app from an upper-case drive path ("C:"). TypeORM's entity glob returns "C:\..." paths, so a
    // lower-case "c:" start path would load every entity file twice and the entities would have no DataSource.
    const cwd = process.cwd().replace(/^[a-z]:/, (m) => m.toUpperCase());
    app = spawn("node", ["dist/main"], {
      cwd,
      env: {
        ...env,
        PORT: String(appPort),
        WHATSAPP_APP_SECRET: APP_SECRET,
        WHATSAPP_VERIFY_TOKEN: "live-verify",
        WHATSAPP_ACCESS_TOKEN: "live-token",
        WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
        WHATSAPP_API_VERSION: API_VERSION,
        WHATSAPP_API_BASE: `http://127.0.0.1:${mockPort}`,
        ANTHROPIC_API_KEY: "live-fake-key",
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`,
        AUDIT_LOG: "false",
        CRM_ENABLED: "true", // the outbox only writes rows when the CRM is on; its HTTP target is the mock
        CRM_BASE_URL: `http://127.0.0.1:${mockPort}/crm`,
        CRM_API_KEY: "live-crm-key",
        INFLUX_URL: "http://127.0.0.1:1",
        INFLUX_TOKEN: "x",
        INFLUX_ORG: "x",
        INFLUX_BUCKET: "x",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    app.stdout?.on("data", (d) => (appLog += d));
    app.stderr?.on("data", (d) => (appLog += d));
    const up = await waitFor(() => /successfully started/i.test(appLog), 90_000);
    if (!up) throw new Error("app did not start:\n" + appLog.slice(-1500));
    console.log(`app up on :${appPort}, mock on :${mockPort}\n`);

    db = new Client({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: dbName,
    });
    await db.connect();

    // --- the cases (a fresh customer each)
    for (const [i, c] of cases.entries()) {
      const number = `9198000010${String(i + 1).padStart(2, "0")}`;
      const sentBefore = waSent.length;
      const claudeBefore = claudeCalls;
      const wamid = `wamid.LIVE.${Date.now()}.${i}`;
      const mine = () => waSent.slice(sentBefore).filter((s) => s.to === number);
      await post(appPort, number, wamid, c.text);
      if (c.twice) await post(appPort, number, wamid, c.text);
      await waitFor(() => mine().length >= 1, 30_000);
      for (const [k, more] of (c.more ?? []).entries()) {
        const have = mine().length;
        await post(appPort, number, `${wamid}.m${k}`, more);
        await waitFor(() => mine().length > have, 30_000);
      }
      await sleep(2500); // settle: a wrong second reply or task would show up now
      const replies = mine().map((s) => s.body);
      const keys = replies.map(replyKey);
      const row = await snapshot(db, number);
      const claude = claudeCalls - claudeBefore;

      const problems = c.check({ replies, keys, row, claude, sent: mine() });
      // no health words in the task rows (the type column is the label "emergency"/"self_harm", allowed)
      const taskText = JSON.stringify(row.tasks.map((t) => ({ priority: t.priority, summary: t.summary })));
      if (HEALTH_WORDS.test(taskText)) problems.push("health word in a task row");

      console.log(`${c.name}: "${[c.text, ...(c.more ?? [])].join(" / ")}"${c.twice ? "  (posted twice)" : ""}`);
      console.log(`  reply key sent : ${keys.length ? keys.join(" | ") : "(none)"}`);
      console.log(`  message kinds  : ${mine().map((m) => (m.kind === "list" ? `list[${m.rows.length} rows]` : m.kind)).join(" | ") || "(none)"}`);
      console.log(`  state          : ${row.state}`);
      console.log(`  tasks          : ${row.tasks.length ? row.tasks.map((t) => `${t.type}/${t.priority}/"${t.summary}"`).join("; ") : "(none)"}`);
      console.log(`  consent        : opt_out_at=${row.opt_out_at ? "set" : "null"}, marketing_consent=${row.marketing_consent}`);
      if (row.consent) {
        const k = row.consent;
        console.log(`  health consent : granted=${k.health_data_consent}, version=${k.notice_version ?? "-"}, at=${k.consent_timestamp ? "set" : "-"}, refused_at=${k.health_refused_at ? "set" : "-"}, notice_sent_version=${k.notice_sent_version ?? "-"}`);
      }
      console.log(`  crm_outbox     : ${row.outbox.join(", ") || "(none)"}`);
      console.log(`  Claude calls   : ${claude}`);
      console.log(`  result         : ${problems.length ? "FAIL - " + problems.join("; ") : "PASS"}\n`);
      failures += problems.length ? 1 : 0;
    }

    if (failures) {
      const bad = appLog.split(/\r?\n/).filter((l) => /ERROR|WARN|failed|Error/.test(l)).slice(0, 25);
      console.log(["--- app log (errors / warnings) ---", ...bad, "---"].join("\n"));
    }
    // --- no health words in the app log (message text, symptoms)
    const leaked = appLog.split(/\r?\n/).filter((l) => HEALTH_WORDS.test(l));
    console.log(`app log: ${appLog.split(/\r?\n/).length} lines, ${leaked.length} with a health word`);
    if (leaked.length) {
      failures++;
      leaked.slice(0, 5).forEach((l) => console.log("  LEAK: " + l.slice(0, 200)));
    }
  } catch (e) {
    failures++;
    console.error("live check error:", (e as Error).message);
    if (appLog) console.error("--- app log tail ---\n" + appLog.slice(-1500));
  } finally {
    // --- stop everything and clean up
    if (app && !app.killed) {
      if (process.platform === "win32" && app.pid) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"]);
      else app.kill("SIGTERM");
    }
    await sleep(1500);
    await new Promise<void>((r) => (mock ? mock.close(() => r()) : r()));
    try {
      if (redis) {
        await redis.select(redisDb);
        const keys = await redis.keys(`${queuePrefix}*`);
        if (keys.length) await redis.del(...keys);
        console.log(`redis: removed ${keys.length} keys`);
        redis.disconnect();
      }
    } catch {
      /* ignore */
    }
    try {
      await db?.end();
    } catch {
      /* ignore */
    }
    try {
      await admin.query(`drop database if exists "${dbName}" with (force)`);
      console.log(`dropped database ${dbName}`);
    } catch (e) {
      console.error("COULD NOT DROP " + dbName + ": " + (e as Error).message);
    }
    await admin.end();
  }
  console.log(failures ? `\nLIVE CHECK: ${failures} FAILED` : "\nLIVE CHECK: ALL PASSED");
  return failures ? 1 : 0;
}

main().then((code) => process.exit(code));
