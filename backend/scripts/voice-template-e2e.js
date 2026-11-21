// End-to-end test of the client's voice-call templates (21 Nov): POST /Actions/SendTemplate during a call, then the
// customer's replies on WhatsApp, plus a regression of the older voice call (StartConversation) and a normal chat.
// NO real Meta / LLM call: stub on 8799 (scripts/maps-e2e-stub.js), backend on 8777 with ACTIONS_API_KEY=e2e-actions-key,
// throwaway DB on 5544. Run: node scripts/voice-template-e2e.js
const crypto = require("crypto");
const fs = require("fs");
const B = "http://localhost:8777/api/v1";
const STUB = "http://localhost:8799";
const SECRET = "e2esecret";
const KEY = process.env.E2E_KEY || "e2e-actions-key";
const PFX = process.env.E2E_PFX || `91970${String(Date.now()).slice(-5)}`;
const OUT = process.env.E2E_OUT || "voice-template-e2e.txt";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const P = (s) => { console.log(s); log.push(s); };
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; P(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${String(detail).slice(0, 400)}`}`); };

const action = async (path, body, key = KEY) => {
  const r = await fetch(B + "/Actions/" + path, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { /* none */ }
  return { status: r.status, body: j };
};
const sentTo = async (to) => (await (await fetch(STUB + "/_sent")).json()).filter((m) => m.to === to);
let seq = 0;
const inbound = async (from, msg) => {
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "910000000000", phone_number_id: "111" }, contacts: [{ wa_id: from, profile: { name: "E2E" } }], messages: [{ from, id: `wamid.VT${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }],
  });
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return (await fetch(B + "/Whatsapp/Webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, body: payload })).status;
};
const text = (body) => ({ type: "text", text: { body } });
// a tap on a template's quick reply arrives as type "button" with the button's text
const quick = (t) => ({ type: "button", button: { text: t, payload: t } });
const bodyOf = (m) =>
  m.type === "text" ? m.text.body
  : m.type === "interactive" ? (m.interactive.body?.text ?? "")
  : m.type === "template" ? `[template ${m.template?.name}]` : `[${m.type}]`;
const say = async (from, msg, label) => {
  const before = (await sentTo(from)).length;
  await inbound(from, msg);
  let out = [];
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    if ((await sentTo(from)).length > before) { await sleep(1500); out = (await sentTo(from)).slice(before); break; }
  }
  P(`\n> ${label}`);
  for (const m of out) P("  < " + bodyOf(m).replace(/\n/g, "\n      "));
  if (!out.length) P("  < (no reply)");
  return out;
};
const sql = (q) =>
  require("child_process")
    .execFileSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", ["-h", "localhost", "-p", "5544", "-U", "postgres", "-d", process.env.E2E_DB || "oxxyflow", "-At", "-c", q], { env: { ...process.env, PGPASSWORD: "x" } })
    .toString()
    .split(String.fromCharCode(13)).join("")
    .trim();
const convOf = (wa) =>
  sql(`select v.state || '|' || coalesce(v.pending_action,'') || '|' || coalesce(v.recommended_plan,'') || '|' || (v.call_context is not null) from conversation v join customer c on c.id = v.customer_id where c.wa_number = '${wa}' order by v.created_on desc limit 1`);

(async () => {
  const A = `${PFX}1`, V = `${PFX}2`, L = `${PFX}3`, N = `${PFX}4`;
  P(`voice-call templates e2e  ${new Date().toISOString()}  numbers ${A} ${V} ${L} ${N}`);

  P("\n== 1. the two templates are listed (migration)");
  const listed = sql(`select name || ':' || category from wa_template where name in ('oxxy_verification_links','plan_recommendation_status') order by name`);
  check("1.1 both in wa_template as UTILITY", listed === "oxxy_verification_links:UTILITY\nplan_recommendation_status:UTILITY", listed);

  P("\n== 2. plan_recommendation_status during the call");
  const planReq = {
    wa_number: A, template: "plan_recommendation_status",
    params: { customer_name: "Priya", requirement: "OPD consultations for your parents", plan: "Vital", reason: "it covers members up to 75 years" },
    whatsapp_consent: true, consent_source: "voice_call", call_id: "call_e2e_1", first_name: "Priya",
  };
  const r1 = await action("SendTemplate", planReq);
  P(JSON.stringify(r1));
  check("2.1 201 sent", r1.status === 201 && r1.body?.status === "sent", JSON.stringify(r1));
  const t1 = (await sentTo(A)).find((m) => m.type === "template");
  P(JSON.stringify(t1?.template));
  check("2.2 Meta got the template, en", t1?.template?.name === "plan_recommendation_status" && t1?.template?.language?.code === "en", JSON.stringify(t1));
  const comps = t1?.template?.components ?? [];
  check("2.3 logo header", comps[0]?.type === "header" && comps[0]?.parameters?.[0]?.image?.link === "https://oxxy.example.in/logo.png", JSON.stringify(comps));
  check("2.4 four body values in order", JSON.stringify(comps[1]?.parameters?.map((p) => p.text)) === JSON.stringify(["Priya", "OPD consultations for your parents", "Oxxy Vital", "it covers members up to 75 years"]), JSON.stringify(comps[1]));
  const st = convOf(A);
  check("2.5 chat: intent_menu, waits for yes on vital, plan saved, call context", st === "intent_menu|voice_plan:vital|vital|true", st);
  const hist = sql(`select body from message m join conversation v on v.id = m.conversation_id join customer c on c.id = v.customer_id where c.wa_number='${A}' and m.template_name='plan_recommendation_status'`);
  check("2.6 history shows the filled-in text", /recommended option for you is Oxxy Vital because it covers members up to 75 years\./.test(hist), hist);
  const r2 = await action("SendTemplate", planReq);
  check("2.7 same template again within 10 minutes: 409 duplicate, nothing sent", r2.status === 409 && r2.body?.code === "duplicate" && (await sentTo(A)).length === 1, JSON.stringify(r2));
  const calls = sql(`select count(*) from follow_up f join customer c on c.id = f.customer_id where c.wa_number='${A}' and f.kind='voice_call'`);
  check("2.8 no 60-second voice call queued", calls === "0", calls);

  P("\n== 3. the customer's replies");
  let out = await say(A, text("Yes please share the link"), "Yes please share the link");
  const card = out[0];
  check("3.1 'yes' -> Oxxy Vital cost card with Activate buttons", /Oxxy Vital/.test(bodyOf(card ?? {})) && (card?.interactive?.action?.buttons ?? []).length === 3, bodyOf(card ?? {}));
  check("3.2 no first cards, no health notice", !out.some((m) => /Reduce Your Medical Bill|Why Overpay|Before sharing health/i.test(bodyOf(m))), out.map(bodyOf).join(" || "));
  out = await say(A, quick("https://www.oxxy.in/#plan"), "[quick reply] https://www.oxxy.in/#plan");
  check("3.3 the plan quick reply -> the four plans list", out[0]?.interactive?.type === "list", JSON.stringify(out[0]));

  P("\n== 4. oxxy_verification_links + News Articles");
  const r3 = await action("SendTemplate", { wa_number: V, template: "oxxy_verification_links", whatsapp_consent: true, consent_source: "voice_call" });
  check("4.1 201 sent", r3.status === 201, JSON.stringify(r3));
  const t3 = (await sentTo(V)).find((m) => m.type === "template");
  check("4.2 no header, Hello there", JSON.stringify(t3?.template?.components) === JSON.stringify([{ type: "body", parameters: [{ type: "text", text: "there" }] }]), JSON.stringify(t3?.template));
  out = await say(V, quick("News Articles"), "[quick reply] News Articles");
  check("4.3 News Articles -> the news page", /media_article/.test(JSON.stringify(out)), JSON.stringify(out));

  P("\n== 5. refused");
  const bad = await action("SendTemplate", { ...planReq, wa_number: L, params: { ...planReq.params, reason: "it is only ₹999 a month" } });
  check("5.1 a price in the reason: 422 invalid_params", bad.status === 422 && bad.body?.code === "invalid_params", JSON.stringify(bad));
  const plan = await action("SendTemplate", { ...planReq, wa_number: L, params: { ...planReq.params, plan: "Gold" } });
  check("5.2 unknown plan: 422", plan.status === 422, JSON.stringify(plan));
  const unk = await action("SendTemplate", { ...planReq, wa_number: L, template: "lead_intro" });
  check("5.3 another template: 400 unknown_template", unk.status === 400 && unk.body?.code === "unknown_template", JSON.stringify(unk));
  const noc = await action("SendTemplate", { ...planReq, wa_number: L, whatsapp_consent: false });
  check("5.4 no consent: 400 consent_required", noc.status === 400 && noc.body?.code === "consent_required", JSON.stringify(noc));
  const key = await action("SendTemplate", planReq, "wrong-key");
  check("5.5 wrong API key: 401", key.status === 401, JSON.stringify(key));
  check("5.6 nothing went to the refused number", (await sentTo(L)).length === 0);

  P("\n== 6. nothing else changed");
  const s = await action("StartConversation", { wa_number: L, first_name: "Ravi", whatsapp_consent: true, consent_source: "voice_ai" });
  const lead = (await sentTo(L)).find((m) => m.type === "template");
  // its own rule is unchanged: at night (21:00-09:00 IST) lead_intro is queued for 09:00 instead of sent
  check(
    "6.1 StartConversation unchanged (lead_intro sent, or queued for 09:00 at night)",
    s.status === 201 && (lead?.template?.name === "lead_intro" || (s.body?.status === "queued" && s.body?.template === "lead_intro")),
    JSON.stringify(s),
  );
  out = await say(N, text("hi"), "hi (a normal new chat)");
  check("6.2 a normal chat still gets the two first cards", /Reduce Your Medical Bill/.test(bodyOf(out[0] ?? {})) && /Why Overpay/.test(bodyOf(out[1] ?? {})), out.map(bodyOf).join(" || "));

  P(`\n${pass} passed, ${fail} failed`);
  fs.writeFileSync(OUT, log.join("\n") + "\n");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
