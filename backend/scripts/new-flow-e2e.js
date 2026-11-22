// End-to-end test of the client's 20 Nov flows (sequences 1-3, booking, activation link, general rule) with
// NO real Meta / Google / LLM call. Same setup as scripts/flow-e2e.js (stub on 8799, backend on 8777, a fresh
// throwaway DB with the official links set on plan_catalog). Run: node scripts/new-flow-e2e.js
const crypto = require("crypto");
const fs = require("fs");
const B = "http://localhost:8777/api/v1";
const STUB = "http://localhost:8799";
const SECRET = "e2esecret";
const OUT = process.env.E2E_OUT || "new-flow-e2e.txt";
// a new prefix per run keeps the customers of an earlier run out of the way (same DB)
const PFX = process.env.E2E_PFX || "9198000004";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const P = (s) => { console.log(s); log.push(s); };
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; P(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${String(detail).slice(0, 300)}`}`); };

const api = async (method, path, token, body) => {
  const r = await fetch(B + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};
const sentTo = async (to) => (await (await fetch(STUB + "/_sent")).json()).filter((m) => m.to === to);
let seq = 0;
const inbound = async (from, msg) => {
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "910000000000", phone_number_id: "111" }, contacts: [{ wa_id: from, profile: { name: "E2E" } }], messages: [{ from, id: `wamid.FE2E${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }],
  });
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  const r = await fetch(B + "/Whatsapp/Webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, body: payload });
  return r.status;
};
const text = (body) => ({ type: "text", text: { body } });
const tap = (id, title = id) => ({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title } } });
const button = (id, title = id) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
const pin = (latitude, longitude) => ({ type: "location", location: { latitude, longitude } });
const bodyOf = (m) =>
  m.type === "text" ? m.text.body
  : m.type === "interactive" ? (m.interactive.body?.text ?? "")
  : m.type === "location" ? `[pin] ${m.location.name}`
  : m.type === "template" ? `[template ${m.template?.name}]` : `[${m.type}]`;
const opts = (m) => {
  if (m.type !== "interactive") return "";
  const a = m.interactive.action || {};
  if (a.buttons) return " {buttons: " + a.buttons.map((b) => b.reply?.title).join(" | ") + "}";
  if (a.sections) return ` {list "${a.button}": ` + a.sections.flatMap((s) => s.rows).map((r) => `${r.title}`).join(" | ") + "}";
  if (m.interactive.type === "cta_url") return ` {link: ${a.parameters?.display_text}}`;
  if (m.interactive.type === "location_request_message") return " {Send location}";
  return "";
};
const show = (m) => {
  const h = m.interactive?.header;
  const head = h ? (h.type === "text" ? `<${h.text}> ` : "<image> ") : "";
  return `[${m.type === "interactive" ? m.interactive.type : m.type}] ${head}${bodyOf(m)}${opts(m)}`;
};
const say = async (from, msg, label) => {
  const before = (await sentTo(from)).length;
  const status = await inbound(from, msg);
  let out = [];
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    if ((await sentTo(from)).length > before) { await sleep(1500); out = (await sentTo(from)).slice(before); break; }
  }
  P(`\n> ${label}${status !== 200 ? `   (webhook ${status})` : ""}`);
  for (const m of out) P("  < " + show(m).replace(/\n/g, "\n      "));
  if (!out.length) P("  < (no reply)");
  return out;
};
const all = (out) => out.map(bodyOf).join("\n");
const last = (out) => out[out.length - 1];
const buttonsOf = (m) => (m?.interactive?.action?.buttons || []).map((b) => b.reply?.title);
const rowsOf = (m) => (m?.interactive?.action?.sections || []).flatMap((s) => s.rows);

const sql = (q) =>
  require("child_process")
    .execFileSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", ["-h", "localhost", "-p", "5544", "-U", "postgres", "-d", process.env.E2E_DB || "oxxyflow", "-At", "-c", q], { env: { ...process.env, PGPASSWORD: "x" } })
    .toString()
    .trim();
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const inDays = (n) => { const d = new Date(Date.now() + n * 86400000 + 5.5 * 3600000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const convOf = (wa) => sql(`select c.state||'|'||coalesce(c.pending_action,'') from conversation c join customer u on u.id=c.customer_id where u.wa_number='${wa}' order by c.created_on desc limit 1`);
const tasksOf = (wa) => sql(`select coalesce(string_agg(t.type||':'||t.task_status, ','), '') from task t join customer u on u.id=t.customer_id where u.wa_number='${wa}'`);

(async () => {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + "/Health"); if (r.ok) break; } catch {} await sleep(1000); }
  const login = await api("POST", "/Auth/Login", null, { email: "admin@oxxy.com", password: "Login123!!" });
  const token = JSON.stringify(login).match(/"(ey[^"]+)"/)?.[1];
  check("console login", !!token, JSON.stringify(login).slice(0, 200));
  const c1 = await api("POST", "/Console/Centres", token, { name: "Velachery Care Hospital", branch: "", locality: "Velachery", city: "Chennai", address: "2 Main Road, Velachery", centre_type: "multispeciality", specialisations: ["general"], is_private: true, verified: true, active: true, latitude: 12.982, longitude: 80.219 });
  check("directory centre saved (or already there from an earlier run)", !!(c1?.id || c1?.Data?.id) || /already exists/.test(JSON.stringify(c1)), JSON.stringify(c1).slice(0, 200));

  // ===== 1. first card (sequence 3) -> sequence 1 -> calculator -> Learn More -> plans -> link
  P("\n==================== 1. Why Overpay -> Reduce My Bill -> calculator -> Learn More -> plan -> activation link ====================");
  const A = PFX + "01";
  let out = await say(A, text("Hi"), "Hi");
  check("1.1 (21 Nov) FIRST card: Reduce Your Medical Bill Now, picture, 3 buttons", out.length === 2 && /Reduce Your Medical Bill Now/.test(bodyOf(out[0])) && out[0]?.interactive?.header?.type === "image" && buttonsOf(out[0]).join() === "Calculate discount,Learn More,Activate Oxxy", show(out[0] || { type: "x" }));
  check("1.1a (21 Nov) SECOND card: Why Overpay, picture, 2 buttons", /Why Overpay Your Medical Bills\?/.test(bodyOf(out[1] || { type: "x" })) && out[1]?.interactive?.header?.type === "image" && buttonsOf(out[1]).join() === "Reduce My Bill,Book Appointment", show(out[1] || { type: "x" }));
  check("1.1b no health notice on the first message", !/Before sharing health details/.test(all(out)), all(out));
  const rescue = sql(`select f.kind||'|'||round(extract(epoch from (f.scheduled_for - now()))/60) from follow_up f join customer u on u.id=f.customer_id where u.wa_number='${A}' order by f.created_on desc limit 1`);
  check("1.1c general rule: a resend scheduled about 30 min after the first card", /^rescue\|(2[5-9]|30)$/.test(rescue), rescue || "(none)");
  out = await say(A, button("home_reduce", "Reduce My Bill"), "tap Reduce My Bill");
  check("1.2 (22 Nov) the bill card is already above: Reduce My Bill asks the bill amount, not the same card again", /enter your bill amount/i.test(all(out)) && !/Reduce Your Medical Bill Now/.test(all(out)), all(out));
  out = await say(A, button("bill_calc", "Calculate discount"), "tap Calculate discount");
  check("1.3 asks the bill amount", /enter your bill amount/i.test(all(out)), all(out));
  out = await say(A, text("1.5 lakh"), "type 1.5 lakh");
  check("1.4 estimate 30% of 1,50,000 = 45,000, pay 1,05,000, illustration note", /₹1,50,000/.test(all(out)) && /− ₹45,000/.test(all(out)) && /₹1,05,000/.test(all(out)) && /illustration only/.test(all(out)), all(out));
  out = await say(A, button("bill_learn", "Learn More"), "tap Learn More");
  check("1.5 Learn More: comparison picture + keep your insurance", !!last(out)?.interactive?.header?.image?.link?.endsWith("/oxxy-compare-card.jpg") && /keep your insurance/.test(all(out)) && /Oxxy is not insurance/.test(all(out)), JSON.stringify(last(out)?.interactive?.header) + " " + show(last(out)).slice(0, 200));
  out = await say(A, button("bill_activate", "Activate Oxxy"), "tap Activate Oxxy");
  check("1.6 four plans with yearly price incl. GST", rowsOf(last(out)).map((r) => r.id).join() === "plan_everyday,plan_vital,plan_thrive,plan_infinity,plan_features" && /₹35,400/.test(JSON.stringify(rowsOf(last(out)))), show(last(out)));
  check("1.6a (21 Nov) last row: View Plan Features", rowsOf(last(out)).at(-1)?.title === "View Plan Features", show(last(out)));
  out = await say(A, tap("plan_features", "View Plan Features"), "tap View Plan Features");
  check("1.6b (21 Nov) features of all four plans + Choose a Plan / Main Menu", /Oxxy Plan Features/.test(all(out)) && ["Everyday", "Vital", "Thrive", "Infinity"].every((p) => all(out).includes(`Oxxy ${p}`)) && /no age limit/.test(all(out)) && buttonsOf(last(out)).join() === "Choose a Plan,Main Menu", show(last(out)));
  out = await say(A, button("bill_activate", "Choose a Plan"), "tap Choose a Plan");
  check("1.6c Choose a Plan: the plans list again", rowsOf(last(out)).length === 5, show(last(out)));
  out = await say(A, tap("plan_thrive", "Oxxy Thrive"), "tap Oxxy Thrive");
  check("1.7 picked plan: yearly + monthly with GST, Activate buttons", /₹35,400/.test(all(out)) && /₹3,539/.test(all(out)) && buttonsOf(last(out)).join() === "Activate Yearly,Activate Monthly,Add Family Member", show(last(out)));
  out = await say(A, button("act_yearly", "Activate Yearly"), "tap Activate Yearly");
  check("1.8 disclosure (price, GST, renewal, time) + YES/NO before the link", /Plan cost: ₹30,000/.test(all(out)) && /GST \(18%\): ₹5,400/.test(all(out)) && /5 to 10 working days/.test(all(out)) && /Shall I send the official secure activation link\?/.test(all(out)) && !/healthplan\?plan_name/.test(all(out)), all(out).slice(0, 500));
  out = await say(A, button("yes", "Yes"), "tap Yes (no health consent yet)");
  check("1.9 YES sends the one official link, not the health notice (live bug 20 Nov)", /https:\/\/www\.oxxy\.in\/healthplan\?plan_name=oxxy_thrive/.test(all(out)) && !/^Before sharing health details/.test(bodyOf(out[0] || { type: "x" })), all(out));
  check("1.9b state moved to awaiting_payment", /^awaiting_payment\|/.test(convOf(A)), convOf(A));
  out = await say(A, text("DONE"), "type DONE");
  check("1.10 DONE: payment recorded for verification, not 'activated'", /verif|check the payment/i.test(all(out)) && !/is now active/i.test(all(out)), all(out));

  // ===== 2. Book Appointment with a pin (sequence 2)
  P("\n==================== 2. Book Appointment: pin -> list -> pick -> for -> date -> time -> Later ====================");
  const Bk = PFX + "02";
  out = await say(Bk, text("Hi"), "Hi");
  out = await say(Bk, button("home_book", "Book Appointment"), "tap Book Appointment (first card)");
  check("2.1 booking card: picture + Book Appointment", /\*Book Appointment\*/.test(all(out)) && !!last(out)?.interactive?.header?.image?.link?.endsWith("/oxxy-book-card.jpg") && buttonsOf(last(out)).join() === "Book Appointment", show(last(out)));
  check("2.1b (21 Nov) Select Centre / Appointment Date / Appointment Time above the button", /Select Centre\n.*Appointment Date\n.*Appointment Time$/.test(bodyOf(last(out))), bodyOf(last(out)));
  out = await say(Bk, button("appt_start", "Book Appointment"), "tap Book Appointment");
  check("2.2 location request (pin or typed area)", last(out)?.interactive?.type === "location_request_message", show(last(out)));
  out = await say(Bk, pin(12.9815, 80.218), "share a pin in Velachery");
  const rows = rowsOf(last(out));
  check("2.3 list: directory centre first, Google place, Other; max 5 + Other", rows[0]?.title === "Velachery Care Hospital" && rows.some((r) => r.title === "Stub Dental Care") && rows.at(-1)?.id === "appt_other" && rows.length <= 6, JSON.stringify(rows));
  check("2.3b no tie-up / partner / discount words in the list (Playbook 2.1)", !/partner|tie-?up|network|discount/i.test(JSON.stringify(last(out))), show(last(out)));
  check("2.3c government-looking names left out", !rows.some((r) => /General Hospital/.test(r.title)), JSON.stringify(rows));
  out = await say(Bk, tap("appt_opt_0", "Velachery Care Hospital"), "pick Velachery Care Hospital");
  check("2.4 booking for: Myself / Family member", /Who is this booking for\?/.test(all(out)) && buttonsOf(last(out)).join() === "Myself,Family member", show(last(out)));
  out = await say(Bk, button("appt_family", "Family member"), "tap Family member");
  check("2.5a (21 Nov) date question: blank line, example on its own line", all(out).includes("When do you want to go?\n\nPlease type the date.\nFor example: "), JSON.stringify(all(out)));
  check("2.5 no health consent: no specialisation question, the date next", /When do you want to go\?/.test(all(out)) && !/specialisation/.test(all(out)), all(out));
  out = await say(Bk, text("tomorrow"), "type tomorrow");
  check("2.6 tomorrow refused (3-day rule), earliest date said", /3-day|at least 3|on or after/i.test(all(out)), all(out));
  out = await say(Bk, text(inDays(10)), `type ${inDays(10)}`);
  check("2.7 date taken, time asked", /What time suits you\?/.test(all(out)), all(out));
  check("2.7a (21 Nov) time question spaced, example on its own line", /\n\nWhat time suits you\?\nFor example: 11 am/.test(all(out)), JSON.stringify(all(out)));
  out = await say(Bk, text("11 am"), "type 11 am");
  check("2.8 Trigger H: recorded, pending confirmation + one soft suggestion, Activate / Later", /Your booking request has been made for .+Velachery Care Hospital/.test(all(out)) && /pending confirmation/.test(all(out)) && /There is no pressure; your booking request is already recorded/.test(all(out)) && buttonsOf(last(out)).join() === "Activate,Later", all(out));
  const br = sql(`select b.booking_status||'|'||b.preferred_time from booking_request b join customer u on u.id=b.customer_id where u.wa_number='${Bk}'`);
  check("2.9 booking_request row: pending_confirmation, 11:00 AM", /^pending_confirmation\|11:00 AM$/.test(br), br || "(none)");
  check("2.10 tasks: booking confirmation + activation follow-up", /booking_confirm/.test(tasksOf(Bk)) && /activation_follow_up/.test(tasksOf(Bk)), tasksOf(Bk));
  out = await say(Bk, button("appt_later", "Later"), "tap Later");
  check("2.11 Later: decline reply, only Main Menu, no second pitch", /^Absolutely, no problem. Your booking request is recorded/.test(bodyOf(last(out))) && buttonsOf(last(out)).join() === "Main Menu", show(last(out)));
  check("2.12 activation follow-up closed after the decline", /activation_follow_up:done/.test(tasksOf(Bk)), tasksOf(Bk));
  out = await say(Bk, button("flow_menu", "Main Menu"), "tap Main Menu");
  check("2.13 Main Menu: both first cards again, bill card first", out.length === 2 && /Reduce Your Medical Bill Now/.test(bodyOf(out[0])) && /Why Overpay Your Medical Bills\?/.test(bodyOf(out[1] || { type: "x" })), all(out));

  // ===== 3. typed booking
  P("\n==================== 3. 'I want to book' -> typed area -> Other hospital -> typed name ====================");
  const Cn = PFX + "03";
  out = await say(Cn, text("Hi"), "Hi");
  out = await say(Cn, text("I want to book"), "type I want to book");
  check("3.1 'I want to book' starts the booking flow", last(out)?.interactive?.type === "location_request_message", show(last(out)));
  out = await say(Cn, text("Velachery, Chennai"), "type Velachery, Chennai");
  check("3.2 typed area -> the list", rowsOf(last(out)).length >= 2, show(last(out)));
  out = await say(Cn, tap("appt_other", "Other hospital"), "pick Other hospital");
  check("3.3 asks name, city, state", /hospital or diagnostic centre name, city and state/.test(all(out)), all(out));
  out = await say(Cn, text("Moolchand Hospital, New Delhi, Delhi"), "type Moolchand Hospital, New Delhi, Delhi");
  check("3.4 booking for asked with the typed hospital", /Hospital: Moolchand Hospital/.test(all(out)), all(out));
  out = await say(Cn, button("appt_self", "Myself"), "tap Myself");
  out = await say(Cn, text(inDays(20)), `type ${inDays(20)}`);
  out = await say(Cn, text("evening"), "type evening");
  check("3.5 not in the directory: the team checks the centre first, pending", /Our team will first check the centre and branch/.test(all(out)) && /pending confirmation/.test(all(out)), all(out));
  check("3.6 directory-verification task, no booking row", /directory_verification/.test(tasksOf(Cn)) && sql(`select count(*) from booking_request b join customer u on u.id=b.customer_id where u.wa_number='${Cn}'`) === "0", tasksOf(Cn));
  out = await say(Cn, button("appt_activate", "Activate"), "tap Activate");
  check("3.7 Activate after booking -> the four plans + View Plan Features", rowsOf(last(out)).length === 5, show(last(out)));

  // ===== 4. safety and opt-out inside the new flows
  P("\n==================== 4. emergency / STOP inside the new flows ====================");
  const D = PFX + "04";
  out = await say(D, text("Hi"), "Hi");
  out = await say(D, button("home_book", "Book Appointment"), "tap Book Appointment");
  out = await say(D, button("appt_start", "Book Appointment"), "tap Book Appointment");
  out = await say(D, text("I have severe chest pain"), "type I have severe chest pain");
  check("4.1 emergency in the middle of the booking: emergency reply", /emergency/i.test(all(out)), all(out));
  out = await say(D, text("STOP"), "type STOP");
  check("4.2 STOP: opt-out confirmed, no question", out.length > 0 && !/\?\s*$/.test(bodyOf(last(out))), all(out));
  out = await say(D, text("Hi"), "Hi after STOP");
  check("4.3 nothing after STOP", out.length === 0, all(out));

  // ===== 5. chat-start options (Meta conversation starters), each as a brand-new customer's first message
  P("\n==================== 5. chat-start options as the first message (21 Nov) ====================");
  const starters = [
    ["Reduce Your Medical Bill Now", (o) => /Reduce Your Medical Bill Now/.test(all(o)) && buttonsOf(last(o)).join() === "Calculate discount,Learn More,Activate Oxxy"],
    ["Why Overpay Your Medical Bills", (o) => /Why Overpay Your Medical Bills\?/.test(all(o))],
    ["Book Appointment", (o) => last(o)?.interactive?.type === "location_request_message"],
    ["Activate Oxxy Plan", (o) => rowsOf(last(o)).length === 5],
    ["Calculate Your Savings", (o) => /enter your bill amount/i.test(all(o))],
    ["Talk to Us", (o) => /advisor/i.test(all(o))],
  ];
  for (let i = 0; i < starters.length; i++) {
    const [said, ok] = starters[i];
    const who = PFX + "1" + i;
    out = await say(who, text(said), said);
    check(`5.${i + 1} '${said}' opens its own card, no health notice`, out.length > 0 && ok(out) && !/Before sharing health details/.test(all(out)), all(out));
    check(`5.${i + 1}b chat opened (intent_menu)`, /^intent_menu\|/.test(convOf(who)), convOf(who));
  }

  P(`\nnew flows: ${pass} passed, ${fail} failed`);
  fs.writeFileSync(OUT, log.join("\n"), "utf8");
  process.exit(fail ? 1 : 0);
})().catch((e) => { P("ERROR " + e.stack); fs.writeFileSync(OUT, log.join("\n"), "utf8"); process.exit(2); });
