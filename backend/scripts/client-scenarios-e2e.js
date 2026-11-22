// Extra scenarios of the client's 20-21 Nov requirements that new-flow-e2e.js / voice-template-e2e.js do not cover:
// the welcome event, the templates' quick-reply taps as a first message, the calculator's inputs, Hindi, Talk to Us
// in the middle of a booking, a repeated delivery, the night rules, STOP / START, a random first question.
// Same setup: stub on 8799, backend on 8777, throwaway DB on 5544, NO real Meta / LLM call.
// Run: node scripts/client-scenarios-e2e.js
const crypto = require("crypto");
const fs = require("fs");
const B = "http://localhost:8777/api/v1";
const STUB = "http://localhost:8799";
const SECRET = "e2esecret";
const PFX = process.env.E2E_PFX || `91972${String(Date.now()).slice(-5)}`;
const OUT = process.env.E2E_OUT || "client-scenarios-e2e.txt";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const P = (s) => { console.log(s); log.push(s); };
let pass = 0, fail = 0;
const fails = [];
const check = (name, ok, detail = "") => {
  ok ? pass++ : (fail++, fails.push(name));
  P(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${String(detail).slice(0, 400)}`}`);
};

const sentTo = async (to) => (await (await fetch(STUB + "/_sent")).json()).filter((m) => m.to === to);
let seq = 0;
const inbound = async (from, msg, id) => {
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "910000000000", phone_number_id: "111" }, contacts: [{ wa_id: from, profile: { name: "E2E" } }], messages: [{ from, id: id ?? `wamid.CS${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }],
  });
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return (await fetch(B + "/Whatsapp/Webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, body: payload })).status;
};
const text = (body) => ({ type: "text", text: { body } });
const quick = (t) => ({ type: "button", button: { text: t, payload: t } });
const tap = (id, title = id) => ({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title } } });
const button = (id, title = id) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
const bodyOf = (m) =>
  !m ? "" : m.type === "text" ? m.text.body
  : m.type === "interactive" ? (m.interactive.body?.text ?? "")
  : m.type === "template" ? `[template ${m.template?.name}]` : `[${m.type}]`;
const kindOf = (m) => (m?.type === "interactive" ? m.interactive.type : m?.type);
const buttonsOf = (m) => (m?.interactive?.action?.buttons || []).map((b) => b.reply?.title);
const say = async (from, msg, label, { wait = 40, id } = {}) => {
  const before = (await sentTo(from)).length;
  await inbound(from, msg, id);
  let out = [];
  for (let i = 0; i < wait; i++) {
    await sleep(400);
    if ((await sentTo(from)).length > before) { await sleep(1800); out = (await sentTo(from)).slice(before); break; }
  }
  P(`\n> ${label}`);
  for (const m of out) P(`  < [${kindOf(m)}] ` + bodyOf(m).replace(/\n/g, "\n      ") + (buttonsOf(m).length ? `  {${buttonsOf(m).join(" | ")}}` : ""));
  if (!out.length) P("  < (no reply)");
  return out;
};
const all = (out) => out.map(bodyOf).join("\n");
const sql = (q) =>
  require("child_process")
    .execFileSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", ["-h", "localhost", "-p", "5544", "-U", "postgres", "-d", process.env.E2E_DB || "oxxyflow", "-At", "-c", q], { env: { ...process.env, PGPASSWORD: "x" } })
    .toString()
    .split(String.fromCharCode(13)).join("")
    .trim();
const conv = (wa, col) =>
  sql(`select coalesce(v.${col}::text,'') from conversation v join customer c on c.id = v.customer_id where c.wa_number='${wa}' order by v.created_on desc limit 1`);
const istHour = new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
const NIGHT = istHour >= 21 || istHour < 9;

(async () => {
  const n = (i) => `${PFX}${String(i).padStart(2, "0")}`;
  P(`client scenarios e2e  ${new Date().toISOString()}  IST hour ${istHour} (${NIGHT ? "night" : "day"})  numbers ${n(1)}..${n(14)}`);

  P("\n== A. The chat is opened for the first time (WhatsApp welcome event)");
  let out = await say(n(1), { type: "request_welcome" }, "[welcome event] first open");
  check("A1 two cards at once: Reduce Your Medical Bill Now, then Why Overpay", /Reduce Your Medical Bill Now/.test(bodyOf(out[0])) && /Why Overpay/.test(bodyOf(out[1])), all(out));
  check("A2 no health notice, no question", !/Before sharing health|consent/i.test(all(out)), all(out));
  out = await say(n(1), { type: "request_welcome" }, "[welcome event] opened again", { wait: 12 });
  check("A3 opened again: nothing sent again", out.length === 0, all(out));

  P("\n== B. A template's quick reply tapped as the first message (outside the chatbot cards)");
  const taps = [
    ["Reduce My Bill", (o) => /Reduce Your Medical Bill Now/.test(all(o))],
    ["Book Appointment", (o) => kindOf(o[0]) === "location_request" || /location|area/i.test(all(o))],
    ["Calculate discount", (o) => /bill amount/i.test(all(o))],
    ["Activate Oxxy", (o) => kindOf(o[0]) === "list"],
    ["Learn More", (o) => /Insurance vs Oxxy|Why Choose Oxxy/i.test(all(o))],
    ["Main Menu", (o) => /Reduce Your Medical Bill Now/.test(all(o)) && /Why Overpay/.test(all(o))],
  ];
  let i = 2;
  for (const [t, ok] of taps) {
    const wa = n(i++);
    out = await say(wa, quick(t), `[quick reply] ${t}`);
    check(`B ${t}: its own card`, ok(out), all(out));
    check(`B ${t}: no health notice first`, !/Before sharing health/i.test(bodyOf(out[0])), bodyOf(out[0]));
  }

  P("\n== C. Calculator inputs");
  const C = n(8);
  await say(C, text("Calculate Your Savings"), "Calculate Your Savings");
  out = await say(C, text("50k"), "50k");
  check("C1 50k -> 30% = 15,000", /15,000/.test(all(out)), all(out));
  await say(C, button("bill_calc", "Calculate discount"), "[tap] Calculate discount");
  out = await say(C, text("1.5 lakh"), "1.5 lakh");
  check("C2 1.5 lakh -> 45,000", /45,000/.test(all(out)), all(out));
  await say(C, button("bill_calc", "Calculate discount"), "[tap] Calculate discount");
  out = await say(C, text("abc"), "abc");
  check("C3 not an amount: asks again", /amount/i.test(all(out)), all(out));
  out = await say(C, text("₹25,000"), "₹25,000");
  check("C4 ₹25,000 -> 7,500", /7,500/.test(all(out)), all(out));

  P("\n== D. Hindi customer");
  out = await say(n(9), text("नमस्ते"), "नमस्ते");
  check("D1 the first cards in Hindi", /मेडिकल बिल/.test(all(out)), all(out));

  P("\n== E. Talk to Us in the middle of a booking");
  const E = n(10);
  await say(E, text("Book Appointment"), "Book Appointment");
  out = await say(E, text("Talk to Us"), "Talk to Us (while the booking asks for the area)");
  check("E1 Talk to Us is not read as an area: the advisor card", /advisor/i.test(all(out)) && !/hospital|centre near/i.test(bodyOf(out[0])), all(out));
  const advisorTask = sql(`select count(*) from task t join customer c on c.id = t.customer_id where c.wa_number='${E}' and t.type='human_handoff'`);
  check("E2 a task for the team", Number(advisorTask) >= 1, advisorTask);

  P("\n== F. The same message delivered twice");
  const F = n(11);
  const dupId = `wamid.CSDUP${Date.now()}`;
  await say(F, text("hi"), "hi", { id: dupId });
  const afterFirst = (await sentTo(F)).length;
  await inbound(F, text("hi"), dupId);
  await sleep(5000);
  check("F1 one set of replies only", (await sentTo(F)).length === afterFirst, `${afterFirst} -> ${(await sentTo(F)).length}`);

  P(`\n== G. Rescue and 60-second call timing (${NIGHT ? "night: 09:00 IST" : "day: +30 min"})`);
  const rescue = sql(`select f.scheduled_for at time zone 'Asia/Kolkata' from follow_up f join customer c on c.id = f.customer_id where c.wa_number='${F}' and f.kind='rescue' order by f.created_on limit 1`);
  P(`  rescue scheduled for (IST): ${rescue}`);
  {
    // the row says +30 min; at send time a 21:00-09:00 time is moved to 09:00 IST (FollowUpScheduler, unit-tested)
    const mins = Number(sql(`select round(extract(epoch from (f.scheduled_for - f.created_on))/60) from follow_up f join customer c on c.id = f.customer_id where c.wa_number='${F}' and f.kind='rescue' order by f.created_on limit 1`));
    check("G1 the resend is booked about 30 minutes later (at night the scheduler moves it to 09:00 when it is due)", mins >= 28 && mins <= 32, mins);
  }
  const call = sql(`select count(*) from follow_up f join customer c on c.id = f.customer_id where c.wa_number='${F}' and f.kind='voice_call'`);
  check("G2 the 60-second call is not queued while SharyX is off (SHARYX_ENABLED=false)", call === "0", call);

  P("\n== H. STOP and START");
  const H = n(12);
  await say(H, text("hi"), "hi");
  out = await say(H, text("STOP"), "STOP");
  check("H1 STOP confirmed", /stop|opted|no more|do not want further/i.test(all(out)), all(out));
  out = await say(H, text("hello?"), "hello? (after STOP)", { wait: 12 });
  check("H2 nothing after STOP", out.length === 0, all(out));
  out = await say(H, text("START"), "START");
  check("H3 START: back in", out.length > 0 && /welcome back|start|again/i.test(all(out)), all(out));

  P("\n== I. A random question as the first message (no LLM key in this test: shows what the customer gets)");
  out = await say(n(13), text("What are your office timings?"), "What are your office timings?", { wait: 60 });
  check("I1 answered (not silent)", out.length > 0, all(out));

  P("\n== J. Typed answers in the plans list");
  const J = n(14);
  await say(J, text("Activate Oxxy Plan"), "Activate Oxxy Plan");
  out = await say(J, text("view plan features"), "view plan features (typed)");
  check("J1 typed 'view plan features' -> the features card", /Oxxy Plan Features/.test(all(out)), all(out));
  out = await say(J, text("vital"), "vital (typed)");
  check("J2 typed plan name -> Oxxy Vital cost card", /Oxxy Vital/.test(all(out)) && /GST/.test(all(out)), all(out));
  out = await say(J, text("hi"), "hi (in the middle)");
  check("J3 'hi' in the middle -> the two first cards, no health notice", /Reduce Your Medical Bill Now/.test(bodyOf(out[0])) && /Why Overpay/.test(bodyOf(out[1])) && !/Before sharing health/i.test(all(out)), all(out));

  P("\n== K. Client's live chat, 22 Nov: the same cards again, Learn More text");
  const K = n(15);
  out = await say(K, text("Hi"), "Hi");
  out = await say(K, button("home_reduce", "Reduce My Bill"), "[tap] Reduce My Bill (the bill card is already above)");
  check("K1 Reduce My Bill right after the cards: the bill amount question, not the same card again", /bill amount/i.test(all(out)) && !/Reduce Your Medical Bill Now/.test(all(out)), all(out));
  out = await say(K, text("200000"), "200000");
  check("K2 the amount is read: 60,000 discount", /60,000/.test(all(out)), all(out));
  out = await say(K, button("bill_learn", "Learn More"), "[tap] Learn More");
  const lm = bodyOf(out[0]);
  check("K3 Learn More: the picture's rows (cost, waiting, age, claims), one message under 1024", /Why Choose Oxxy Medical Discount Plans/.test(lm) && /Cost to you/.test(lm) && /3–5 working days/.test(lm) && /No claims, no paperwork/.test(lm) && lm.length <= 1024 && out[0]?.interactive?.header?.type === "image", lm.length + " " + lm);
  out = await say(K, button("flow_menu", "Main Menu"), "[tap] Main Menu");
  check("K4 Main Menu: the two first cards", /Reduce Your Medical Bill Now/.test(bodyOf(out[0])) && /Why Overpay/.test(bodyOf(out[1])), all(out));
  const Q = n(16);
  out = await say(Q, quick("Reduce My Bill"), "[template quick reply] Reduce My Bill as the first message");
  check("K5 Reduce My Bill with no card shown before: the bill card", /Reduce Your Medical Bill Now/.test(all(out)), all(out));

  P(`\n${pass} passed, ${fail} failed${fails.length ? `\nFAILED: ${fails.join(" · ")}` : ""}`);
  fs.writeFileSync(OUT, log.join("\n") + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
