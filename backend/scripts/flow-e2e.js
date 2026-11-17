// End-to-end test of the WhatsApp button flow, the triggers and the payment check, with NO real Meta / Google /
// LLM call (client corrections, 17-18 Nov 2026). Run:
// 1. a throwaway Postgres (never the real one) with an empty database and the uuid-ossp extension
// 2. node scripts/maps-e2e-stub.js                       (Meta and Google, with reverse geocoding, on :8799)
// 3. the backend on :8777 against that database (from source, no build needed):
//      env PORT=8777 DB_HOST=localhost DB_PORT=<port> DB_USER=postgres DB_PASS=x DB_NAME=<db> DB_SYNC=false
//          DB_SEED=true NODE_ENV=development QUEUE_PREFIX=oxxye2e REDIS_DB=9
//          WHATSAPP_API_BASE=http://localhost:8799 WHATSAPP_APP_SECRET=e2esecret WHATSAPP_PHONE_NUMBER_ID=111
//          WHATSAPP_ACCESS_TOKEN=stub-token GOOGLE_MAPS_API_BASE=http://localhost:8799 GOOGLE_MAPS_API_KEY=test-key
//          GOOGLE_MAPS_BROWSER_KEY=browser-test CRM_ENABLED=false OPENAI_API_KEY= ANTHROPIC_API_KEY= GEMINI_API_KEY=
//          TS_NODE_PROJECT=tsconfig.json TS_NODE_TRANSPILE_ONLY=true
//          node -r ts-node/register -r tsconfig-paths/register src/main.ts > e2e-backend.log
// 4. node scripts/flow-e2e.js nolink                   (the team-link path: no official link in plan_catalog)
// 5. set activation_link / renewal_terms / activation_time on the oxxy rows of plan_catalog, then
//    BACKEND_LOG=e2e-backend.log node scripts/flow-e2e.js link
// Run once per fresh database. 18 Nov 2026: nolink 18 / 18, link 28 / 28.
const crypto = require("crypto");
const fs = require("fs");
const B = "http://localhost:8777/api/v1";
const STUB = "http://localhost:8799";
const SECRET = "e2esecret";
const OUT = process.env.E2E_OUT || "flow-e2e.txt";
const phase = process.argv[2] || "nolink";
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

(async () => {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + "/Health"); if (r.ok) break; } catch {} await sleep(1000); }
  await sleep(3000);
  const login = await api("POST", "/Auth/Login", null, { email: "admin@oxxy.com", password: "Login123!!" });
  const token = JSON.stringify(login).match(/"(ey[^"]+)"/)?.[1];
  check("console login", !!token, JSON.stringify(login).slice(0, 200));

  if (phase === "nolink") {
    // centres for the booking
    const c1 = await api("POST", "/Console/Centres", token, { name: "ABC Hospital", branch: "", locality: "Peelamedu", city: "Coimbatore", address: "12 Avinashi Road", centre_type: "multispeciality", specialisations: ["general", "orthopaedics"], is_private: true, verified: true, active: true });
    check("centre ABC Hospital saved", !!c1?.id || !!c1?.Data?.id, JSON.stringify(c1).slice(0, 200));

    // ===== C: the team's link (no official link yet), request_welcome in the middle, callback changed, "paid"
    P("\n==================== C. team link, request_welcome mid-flow, callback re-tap, payment said ====================");
    const C = "919800000301";
    let out = await say(C, text("Hi"), "Hi");
    check("C1 welcome card with 3 buttons", /Welcome to Oxxy HealthCare!/.test(all(out)) && buttonsOf(last(out)).length === 3, all(out));
    out = await say(C, button("flow_start", "Get Started"), "tap Get Started");
    check("C2 who list with the client's title + words", /Who Are You Looking For Healthcare Support For\?/.test(all(out)) && last(out)?.interactive?.header?.text === "Get in Touch with Oxxy To Reduce Your Medical Expenses", show(last(out)));
    out = await say(C, tap("who_self", "For Self/Spouse"), "tap For Self/Spouse");
    if (/YES or NO/.test(all(out))) out = await say(C, button("yes", "Yes"), "consent YES");
    check("C3 consent then the service list (client's question)", /Regarding what are you looking for medical service\?/.test(all(out)), all(out));
    out = await say(C, tap("need_consult", "Doctor Consultations"), "tap Doctor Consultations");
    check("C4 verify card (2 buttons) + calculator card", /Verify Our Healthcare Services/.test(all(out)) && out.some((m) => buttonsOf(m).join() === "Customer Testimonial,News Articles") && /Calculator\nSee how much you can save/.test(all(out)), all(out).slice(0, 300));
    out = await say(C, button("calc_start", "Calculate Now"), "tap Calculate Now");
    check("C5 spend list with the client's ranges", rowsOf(last(out)).map((r) => r.title).join("|") === "Below 5000|10,000-20,000|20,000-30,000|30,000-50,000|50,000-1,00,000|1,00,000-5,00,000|5,00,000-10,00,000|Above 10,00,000", show(last(out)));
    out = await say(C, tap("spend_30000", "30,000-50,000"), "tap 30,000-50,000");
    check("C6 savings ₹9,000 (30%) then the age question", /save up to ₹9,000/.test(all(out)) && /May I know the patient's age\?/.test(all(out)), all(out));
    out = await say(C, tap("age_35", "Below 40"), "tap Below 40");
    check("C7 age acknowledged + location question", /^Thank you, noted the age \(Below 40\)\./.test(bodyOf(last(out))) && last(out)?.interactive?.type === "location_request_message", show(last(out)));
    out = await say(C, button("book_yes", "Book appointment"), "[tap an old 'Book appointment' button at the city question]");
    check("C7b a button is never taken as the area", /Please type the area and city first/.test(all(out)) && !/noted the area: book_yes/.test(all(out)), all(out));
    out = await say(C, pin(20.5, 79.0), "[share a pin the map cannot read]");
    check("C7c unreadable pin: said, area asked typed (not the same question silently)", /could not read the area from it/.test(all(out)), all(out));
    out = await say(C, text("Peelamedu, Coimbatore"), "type Peelamedu, Coimbatore");
    check("C8 area acknowledged + appointment offer", /Thank you, noted the area/.test(all(out)) && /book the appointment too/.test(all(out)), all(out));
    out = await say(C, { type: "request_welcome" }, "[WhatsApp request_welcome while the offer waits]");
    check("C9 request_welcome mid-flow: no welcome card", !/Welcome to Oxxy HealthCare/.test(all(out)), all(out));
    out = await say(C, button("book_no", "Not now"), "tap Not now");
    check("C10 plan card with Plan cost / GST / Final payable", /Plan cost: ₹/.test(all(out)) && /= Final payable: ₹/.test(all(out)) && buttonsOf(last(out)).includes("Activate Monthly"), all(out).slice(0, 400));
    out = await say(C, button("act_monthly", "Activate Monthly"), "tap Activate Monthly");
    check("C11 no link: team will send it + 3 callback times as buttons, no T&C card", /our team will send you the official secure activation link/.test(all(out)) && buttonsOf(last(out)).length === 3 && !/terms and conditions/i.test(all(out)), all(out));
    out = await say(C, button("1", "Tomorrow 10am-12pm"), "tap time 1");
    const firstRef = (all(out).match(/CB-[A-Z0-9]+/) || [])[0];
    check("C12 callback saved with a reference", /I have requested a callback for .*Reference: CB-/.test(all(out)), all(out));
    out = await say(C, button("3", "Tomorrow, 2-4 pm"), "tap time 3 (changed)");
    check("C13 changed slot: updated, same reference, not the old menu", /^Updated\. Your callback is now .*2-4 pm\. Reference: /.test(all(out)) && all(out).includes(firstRef) && !/lifelong/.test(all(out)), all(out));
    out = await say(C, text("I have done the payment"), "type I have done the payment");
    check("C14 paid: acknowledged, checked by the team, not confirmed", /Our team will check the payment and confirm your activation/.test(all(out)) && !/is (now )?active/i.test(all(out)), all(out));
  }

  if (phase === "link") {
    // ===== A: the official link, appointment via the centre list, family, payment and confirmation
    P("\n==================== A. website -> visit -> appointment via list -> plan -> family -> link -> paid -> confirmed ====================");
    const A = "919800000101";
    let out = await say(A, text("Hi"), "Hi");
    out = await say(A, button("flow_website", "Visit Our Website"), "tap Visit Our Website");
    check("A1 website card + who list", out.some((m) => m.interactive?.type === "cta_url") && /Who Are You Looking For/.test(all(out)), all(out));
    out = await say(A, tap("who_parents", "Parents"), "tap Parents");
    if (/YES or NO/.test(all(out))) out = await say(A, button("yes", "Yes"), "consent YES");
    out = await say(A, tap("need_consult", "Doctor Consultations"), "tap Doctor Consultations");
    out = await say(A, button("verify_stories", "Customer Testimonial"), "tap Customer Testimonial");
    check("A2 testimonial link card, the flow step stays", out.some((m) => m.interactive?.type === "cta_url" && /customers say/.test(bodyOf(m))), all(out));
    out = await say(A, button("calc_start", "Calculate Now"), "tap Calculate Now");
    out = await say(A, tap("spend_50000", "50,000-1,00,000"), "tap 50,000-1,00,000");
    out = await say(A, tap("age_65", "61 – 70"), "tap 61 – 70");
    out = await say(A, pin(11.0261, 77.0006), "[share location pin in Peelamedu]");
    check("A3 pin -> area saved + appointment offer", /Thank you, noted the area: Peelamedu, Coimbatore/.test(all(out)) && /book the appointment too/.test(all(out)), all(out));
    out = await say(A, button("book_yes", "Book appointment"), "tap Book appointment");
    check("A4 hospital question with Suggest nearby", /Please share the centre and branch first/.test(all(out)) && buttonsOf(last(out)).includes("Suggest nearby"), show(last(out)));
    out = await say(A, button("suggest a centre near me", "Suggest nearby"), "tap Suggest nearby");
    if (/How far/.test(all(out))) out = await say(A, button("10 km", "Up to 10 km"), "tap Up to 10 km");
    check("A5 verified centre list (names in the list rows)", rowsOf(last(out)).some((r) => /ABC Hospital/.test(r.title)) || /ABC Hospital/.test(all(out)), show(last(out)));
    out = await say(A, tap("1", "ABC Hospital"), "tap 1 (ABC Hospital)");
    check("A6 map pin first, then the YES/NO offer with buttons", out[0]?.type === "location" && buttonsOf(last(out)).join() === "Yes,No", out.map(show).join(" || "));
    out = await say(A, button("yes", "Yes"), "tap Yes");
    check("A7 centre acknowledged + specialisation", /^Noted: ABC Hospital/.test(bodyOf(last(out))) && /specialisation/.test(all(out)), all(out));
    out = await say(A, tap("general physician", "General physician"), "tap General physician");
    const day = rowsOf(last(out))[2];
    check("A8 specialisation acknowledged + date list", /^Noted: general physician\./.test(bodyOf(last(out))) && !!day, all(out));
    out = await say(A, tap(day.id, day.title), `tap ${day.title}`);
    check("A9 date acknowledged + time buttons", /^Noted .*\d{4}\./.test(bodyOf(last(out))) && buttonsOf(last(out)).includes("Morning"), all(out));
    out = await say(A, button("morning (9 am to 12 pm)", "Morning"), "tap Morning");
    check("A10 booking saved (pending confirmation) then the plan card", /booking request has been made/.test(all(out)) && /pending confirmation/.test(all(out)) && /Infinity plan fits best/.test(all(out)) && /Plan cost: ₹40,000\n\+ GST \(18%\): ₹7,200\n= Final payable: ₹47,200 a year/.test(all(out)), all(out).slice(0, 500));
    out = await say(A, button("flow_family", "Add Family Member"), "tap Add Family Member");
    out = await say(A, button("fam_2", "2 more"), "tap 2 more");
    check("A11 count acknowledged + yearly/monthly", /^Noted, 2 more members\./.test(bodyOf(last(out))) && buttonsOf(last(out)).join() === "Yearly,Monthly", all(out));
    out = await say(A, button("famb_yearly", "Yearly"), "tap Yearly");
    check("A12 family breakdown (doc 9) total ₹1,13,280", /− 30% discount: ₹12,000/.test(all(out)) && /Total for 3 members: ₹1,13,280 a year/.test(all(out)), all(out));
    out = await say(A, button("act_yearly", "Activate"), "tap Activate");
    check("A13 ack + family total + disclosure (final payable) + T&C card once", /^Great choice: the yearly plan\./.test(all(out)) && /Final payable: ₹47,200 a year/.test(all(out)) && /Reply YES or NO/.test(all(out)) && out.filter((m) => /terms and conditions/i.test(bodyOf(m))).length === 1, all(out));
    out = await say(A, button("yes", "Yes"), "tap Yes (send the link)");
    check("A14 official link sent", /official secure activation link: https:\/\/pay\.oxxy\.test\/infinity-y/.test(all(out)), all(out));
    out = await say(A, text("I have done the payment"), "type I have done the payment");
    check("A15 paid: acknowledged + checked, not confirmed", /Our team will check the payment/.test(all(out)), all(out));
    const acts = await api("GET", "/Console/Activations", token);
    const rows = acts?.rows ?? acts?.Data?.rows ?? [];
    const act = rows.find((r) => String(r.wa_number || r.customer_wa_number || "").includes("800000101")) || rows[0];
    check("A16 the activation is in the console list (link sent, pending)", !!act, JSON.stringify(acts).slice(0, 300));
    if (act) {
      const before = (await sentTo(A)).length;
      const r = await api("PUT", `/Console/Activations/${act.id}`, token, { result: "paid" });
      await sleep(4000);
      const after = (await sentTo(A)).slice(before);
      P(`\n> [console: payment recorded as paid]  ${JSON.stringify(r).slice(0, 120)}`);
      for (const m of after) P("  < " + show(m));
      // a proactive template: sent at once in the day, queued for 09:00 IST in quiet hours (Playbook)
      const logTxt = fs.existsSync(process.env.BACKEND_LOG || "") ? fs.readFileSync(process.env.BACKEND_LOG, "utf8") : "";
      const queued = /activation_confirmed for [0-9a-f-]+ queued for .* \(quiet hours\)/.test(logTxt);
      check(`A17 only after verification: activation_confirmed ${queued ? "queued for 09:00 IST (quiet hours)" : "sent"}`, queued || after.some((m) => /activation_confirmed/.test(JSON.stringify(m))), after.map(show).join(" || ") || "(nothing sent, nothing queued)");
    }
    out = await say(A, text("thanks"), "type thanks");
    check("A18 closing summary with plan + price", /summary of our chat/.test(all(out)), all(out));

    // ===== B: medicines, objections, proof, follow-up
    P("\n==================== B. medicines -> delivery check -> plan -> price / benefit / proof -> follow-up ====================");
    const Bn = "919800000201";
    out = await say(Bn, text("Hi"), "Hi");
    out = await say(Bn, button("flow_start", "Get Started"), "tap Get Started");
    out = await say(Bn, tap("who_self", "For Self/Spouse"), "tap For Self/Spouse");
    if (/YES or NO/.test(all(out))) out = await say(Bn, button("yes", "Yes"), "consent YES");
    out = await say(Bn, tap("need_medicines", "Medicines"), "tap Medicines");
    out = await say(Bn, button("calc_start", "Calculate Now"), "tap Calculate Now");
    out = await say(Bn, tap("spend_20000", "20,000-30,000"), "tap 20,000-30,000");
    out = await say(Bn, tap("age_35", "Below 40"), "tap Below 40");
    out = await say(Bn, text("Gandhipuram, Coimbatore"), "type Gandhipuram, Coimbatore");
    check("B1 medicines: delivery offer with buttons", /Shall I check home delivery/.test(all(out)) && buttonsOf(last(out)).join() === "Check delivery,Not now", all(out));
    out = await say(Bn, button("med_yes", "Check delivery"), "tap Check delivery");
    check("B2 the medicine names are asked (no list)", /Which medicines do you need\?/.test(all(out)) && last(out)?.type === "text", show(last(out)));
    out = await say(Bn, text("Metformin 500, Telma 40"), "type Metformin 500, Telma 40");
    check("B3 delivery checked by the team, nothing confirmed, then the plan", /Our team will check home-delivery availability/.test(all(out)) && /Nothing is confirmed yet/.test(all(out)) && /Would you like to activate your Oxxy care plan\?/.test(all(out)), all(out).slice(0, 400));
    out = await say(Bn, text("too costly"), "type too costly");
    check("B4 price objection: same plan, monthly option + buttons", /also available monthly at/.test(all(out)) && buttonsOf(last(out)).join() === "Monthly plan,Follow up later", all(out));
    out = await say(Bn, text("we are healthy, what is the use?"), "type we are healthy, what is the use?");
    check("B5 benefit objection: value + Plan details / Follow up later", /plan details, or should I follow up later\?/.test(all(out)) && buttonsOf(last(out)).join() === "Plan details,Follow up later", all(out));
    out = await say(Bn, text("is this genuine?"), "type is this genuine?");
    check("B6 proof: links the first time, a pointer when already shared", /Official website|shared Oxxy's official website/.test(all(out)), all(out));
    out = await say(Bn, text("is this genuine?"), "type is this genuine? (again)");
    check("B7 proof asked again: no duplicate links", /shared Oxxy's official website/.test(all(out)) && !/https?:\/\//.test(all(out)), all(out));
    out = await say(Bn, button("follow up later", "Follow up later"), "tap Follow up later");
    check("B8 summary + two follow-up times as buttons", /summary/.test(all(out)) && buttonsOf(last(out)).length === 2, all(out));
    out = await say(Bn, button("2", "second time"), "tap the second time");
    check("B9 follow-up scheduled only after the pick", /I will follow up on/.test(all(out)), all(out));
  }

  P(`\n${phase}: ${pass} passed, ${fail} failed`);
  fs.writeFileSync(OUT, log.join("\n"), "utf8");
  process.exit(fail ? 1 : 0);
})().catch((e) => { P("ERROR " + e.stack); fs.writeFileSync(OUT, log.join("\n"), "utf8"); process.exit(2); });
