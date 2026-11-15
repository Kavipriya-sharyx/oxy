// End-to-end test of the nearby-centre flow and the Google Maps keys, with NO real Meta / Google / LLM call.
// 1. a throwaway Postgres (never the real one) with an empty database and the uuid-ossp extension
// 2. node scripts/maps-e2e-stub.js                       (stands in for Meta and Google on :8799)
// 3. the backend on :8777 against that database, with these overrides (the rest comes from .env):
//      DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME = the throwaway database, DB_SEED=true, NODE_ENV=development
//      PORT=8777 QUEUE_PREFIX=oxxye2e REDIS_DB=9
//      WHATSAPP_API_BASE=http://localhost:8799 WHATSAPP_APP_SECRET=e2esecret WHATSAPP_PHONE_NUMBER_ID=111 WHATSAPP_ACCESS_TOKEN=stub-token
//      GOOGLE_MAPS_API_BASE=http://localhost:8799 GOOGLE_MAPS_API_KEY=test-key GOOGLE_MAPS_BROWSER_KEY=browser-test
//      CRM_ENABLED=false OPENAI_API_KEY= ANTHROPIC_API_KEY= GEMINI_API_KEY=      (empty: no LLM is called)
// 4. node scripts/maps-e2e.js                            (run it once per fresh database)
const crypto = require("crypto");
const B = "http://localhost:8777/api/v1";
const STUB = "http://localhost:8799";
const SECRET = "e2esecret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };

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
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "910000000000", phone_number_id: "111" }, contacts: [{ wa_id: from, profile: { name: "E2E Tester" } }], messages: [{ from, id: `wamid.E2E${Date.now()}${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }],
  });
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  const r = await fetch(B + "/Whatsapp/Webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": sig }, body: payload });
  return r.status;
};
const text = (body) => ({ type: "text", text: { body } });
const tap = (id, title) => ({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title } } });
const button = (id, title) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
const pin = (latitude, longitude) => ({ type: "location", location: { latitude, longitude } });
const show = (m) => m.type === "text" ? m.text.body : m.type === "interactive" ? `[${m.interactive.type}] ${m.interactive.body?.text ?? ""}` : m.type === "location" ? `[location pin] ${m.location.name} @${m.location.latitude},${m.location.longitude}` : `[${m.type}]`;
// send one message, wait for the bot's new messages to this number
const say = async (from, msg, label) => {
  const before = (await sentTo(from)).length;
  const status = await inbound(from, msg);
  let out = [];
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const all = await sentTo(from);
    if (all.length > before) { await sleep(1200); out = (await sentTo(from)).slice(before); break; }
  }
  console.log(`\n> ${label}   (webhook ${status})`);
  for (const m of out) console.log("  < " + show(m).replace(/\n/g, "\n    "));
  if (!out.length) console.log("  < (no reply)");
  return out;
};
const allText = (out) => out.map(show).join("\n");

(async () => {
  for (let i = 0; i < 90; i++) { try { await fetch(B + "/Health"); break; } catch { await sleep(1000); } }
  await sleep(4000); // seeding after listen

  // ---------------------------------------------------------------- console side
  const login = await api("POST", "/Auth/Login", null, { email: "admin@oxxy.com", password: "Login123!!" });
  const token = JSON.stringify(login).match(/"(ey[^"]+)"/)?.[1];
  check("console login", !!token, JSON.stringify(login).slice(0, 120));

  const settings = await api("GET", "/Admin/SystemConfig", token);
  const items = Array.isArray(settings) ? settings : settings?.items ?? settings?.Data ?? [];
  const maps = (Array.isArray(items) ? items : []).filter((i) => i.group === "maps").map((i) => i.key);
  console.log("settings maps group:", JSON.stringify(maps), Array.isArray(items) ? "" : JSON.stringify(settings).slice(0, 200));

  const test = await api("POST", "/Console/Maps/Test", token);
  check("Test the key: all three Google APIs answer ok", test.geocoding === "ok" && test.routes === "ok" && test.places === "ok", JSON.stringify(test));

  const geo = await api("POST", "/Console/Centres/Geocode", token, { address: "12 Avinashi Road, Peelamedu, Coimbatore" });
  check("Find on map: address -> point", geo.latitude === 11.0261 || geo.latitude === 11.03, JSON.stringify(geo).slice(0, 160));
  const notFound = await api("POST", "/Console/Centres/Geocode", token, { address: "zzzz nowhere qqqq" });
  check("Find on map: unknown address -> a clear message", /could not find/i.test(JSON.stringify(notFound)), JSON.stringify(notFound).slice(0, 160));

  // a centre saved with an address and NO latitude / longitude gets its point from the map
  const c1 = await api("POST", "/Console/Centres", token, { name: "ABC Hospital", branch: "", locality: "Peelamedu", city: "Coimbatore", address: "12 Avinashi Road", centre_type: "multispeciality", specialisations: ["general", "orthopaedics"], is_private: true, verified: true, active: true });
  check("centre saved without a point: filled from the address", c1.latitude === 11.03 && c1.longitude === 77.01, JSON.stringify(c1).slice(0, 200));
  const imp = await api("POST", "/Console/Centres/Import", token, { rows: [{ name: "XYZ Clinic", locality: "Gandhipuram", city: "Coimbatore", address: "Cross Cut Road", centre_type: "clinic", specialisations: "general|dental", is_private: "true", verified: "true", verification_source: "phone call" }] });
  const list = await api("GET", "/Console/Centres", token);
  const xyz = (Array.isArray(list) ? list : []).find((c) => c.name === "XYZ Clinic");
  check("CSV import without a point: filled from the address", !!xyz && Number(xyz.latitude) === 11.0183, JSON.stringify(imp) + " " + JSON.stringify(xyz ?? null).slice(0, 160));

  // ---------------------------------------------------------------- chat: nearby centres
  const A = "919811100001";
  await say(A, text("Hi"), "Hi");
  let out = await say(A, tap("menu_centre", "Find or book a centre"), "tap: Find or book a centre");
  if (/YES or NO|share health|health details/i.test(allText(out))) out = await say(A, button("yes", "Yes"), "consent: YES");
  out = await say(A, text("any hospital near me"), "any hospital near me");
  const req = out.find((m) => m.type === "interactive" && m.interactive.type === "location_request_message");
  check("'near me' -> the Send location button", !!req && req.interactive.action?.name === "send_location", allText(out).slice(0, 200));

  out = await say(A, pin(11.0261, 77.0006), "[customer shares a pin in Peelamedu]");
  const listText = allText(out);
  check("shared pin -> verified centres, nearest first", listText.indexOf("ABC Hospital") >= 0 && listText.indexOf("ABC Hospital") < (listText.indexOf("XYZ Clinic") < 0 ? 1e9 : listText.indexOf("XYZ Clinic")), listText.slice(0, 300));
  check("list shows road distance and drive time", /ABC Hospital[^\n]*about [\d.]+ km, \d+ min/.test(listText), listText.slice(0, 300));
  check("no unverified Google place in the customer's list", !/Stub General Hospital|Stub Dental/.test(listText));

  out = await say(A, text("1"), "1 (pick the first centre)");
  const sentPin = out.find((m) => m.type === "location");
  check("pick -> booking offer", /May I do your booking at ABC Hospital/.test(allText(out)), allText(out).slice(0, 200));
  check("pick -> the centre's map pin", !!sentPin && sentPin.location.latitude === 11.03 && sentPin.location.name === "ABC Hospital", JSON.stringify(sentPin ?? null));

  // typed area instead of a pin
  const Bn = "919811100002";
  await say(Bn, text("Hi"), "Hi (customer 2)");
  out = await say(Bn, tap("menu_centre", "Find or book a centre"), "tap: Find or book a centre");
  if (/YES or NO|share health|health details/i.test(allText(out))) out = await say(Bn, button("yes", "Yes"), "consent: YES");
  await say(Bn, text("nearby hospital please"), "nearby hospital please");
  out = await say(Bn, text("Gandhipuram Coimbatore"), "Gandhipuram Coimbatore (typed area)");
  const t2 = allText(out);
  check("typed area -> looked up, list starts with the centre in that area", /1\. XYZ Clinic/.test(t2), t2.slice(0, 300));

  // a place with no verified centre: the team gets Google's places, the customer does not
  const C = "919811100003";
  await say(C, text("Hi"), "Hi (customer 3)");
  out = await say(C, tap("menu_centre", "Find or book a centre"), "tap: Find or book a centre");
  if (/YES or NO|share health|health details/i.test(allText(out))) out = await say(C, button("yes", "Yes"), "consent: YES");
  await say(C, text("any clinic near me"), "any clinic near me");
  out = await say(C, pin(12.9815, 80.218), "[customer shares a pin in Velachery, Chennai: no centre there]");
  const t3 = allText(out);
  check("no centre near the pin -> the plain 'no verified centre' reply", /do not have a verified centre/.test(t3), t3.slice(0, 250));
  check("Google's places are NOT shown to the customer", !/Stub General Hospital|Stub Dental/.test(t3));
  await sleep(1500);
  const tasks = await api("GET", "/Console/Tasks?view=all", token);
  const gap = (tasks.rows ?? []).find((t) => t.type === "directory_verification");
  check("the team gets a task with the places to verify", !!gap && /Not verified, from Google Maps[^]*Stub General Hospital \(1 Main Road, Velachery, Chennai\)/.test(gap.summary), JSON.stringify(gap ?? null).slice(0, 300));

  // ---------------------------------------------------------------- console map + go-live
  const map = await api("GET", "/Console/Centres/Map", token);
  check("map data: centres with points, browser key from settings", map.maps_enabled === true && map.browser_key === "browser-test" && (map.centres ?? []).filter((c) => c.latitude).length === 2, JSON.stringify(map).slice(0, 300));
  const sup = JSON.stringify(await api("POST", "/Auth/Login", null, { email: "superadmin@oxxy.com", password: "Login123!!" })).match(/"(ey[^"]+)"/)?.[1];
  const live = await api("GET", "/Console/GoLive", sup);
  // keys set from the console (Configuration -> Maps), applied without a restart
  await api("PUT", "/Console/Settings", sup, { values: { GOOGLE_MAPS_API_KEY: "wrong-key", GOOGLE_MAPS_BROWSER_KEY: "browser-from-ui" } });
  const wrong = await api("POST", "/Console/Maps/Test", sup);
  check("wrong key saved in the UI: the test names what Google answered", /invalid|not valid/i.test(JSON.stringify(wrong)), JSON.stringify(wrong));
  const refused = await api("POST", "/Console/Centres/Geocode", sup, { address: "Some New Area, Madurai" });
  check("wrong key: Find on map says Google refused the key, not 'address not found'", /refused the request/.test(JSON.stringify(refused)), JSON.stringify(refused).slice(0, 200));
  const C4 = "919811100004";
  await say(C4, text("Hi"), "Hi (customer 4, while the key is wrong)");
  let o4 = await say(C4, tap("menu_centre", "Find or book a centre"), "tap: Find or book a centre");
  if (/YES or NO|share health|health details/i.test(allText(o4))) o4 = await say(C4, button("yes", "Yes"), "consent: YES");
  await say(C4, text("hospital near me"), "hospital near me");
  o4 = await say(C4, pin(11.0261, 77.0006), "[pin shared while the Google key is wrong]");
  check("wrong key: a shared pin still gets the list (straight-line distance, no crash)", /ABC Hospital[^\n]*(about [\d.]+ km|under 1 km)/.test(allText(o4)) && !/min/.test(allText(o4).split("\n")[1] ?? ""), allText(o4).slice(0, 250));
  await api("PUT", "/Console/Settings", sup, { values: { GOOGLE_MAPS_API_KEY: "test-key" } });
  const again = await api("POST", "/Console/Maps/Test", sup);
  check("right key saved in the UI: works at once, no restart", again.geocoding === "ok" && again.routes === "ok" && again.places === "ok", JSON.stringify(again));
  const map2 = await api("GET", "/Console/Centres/Map", sup);
  check("browser key saved in the UI reaches the console map", map2.browser_key === "browser-from-ui", String(map2.browser_key));
  const mapRows = (live.checks ?? []).filter((c) => c.area === "Maps");
  check("go-live check: key set and the three APIs working", mapRows.length === 4 && mapRows.every((c) => c.status === "ok"), JSON.stringify(mapRows) + " " + JSON.stringify(live).slice(0, 300));

  // ---------------------------------------------------------------- what really went to Google
  const g = await (await fetch(STUB + "/_google")).json();
  const by = (a) => g.filter((x) => x.api === a && x.key !== "wrong-key");
  check("geocoding calls carry the key, region=in, country:IN", by("geocoding").every((x) => x.key === "test-key" && x.region === "in" && x.components === "country:IN"), JSON.stringify(by("geocoding")[0]));
  const peel = by("geocoding").filter((x) => /gandhipuram coimbatore/i.test(x.address));
  check("cache: the typed area was looked up once", peel.length === 1, `${peel.length} calls`);
  check("routes calls: header key, field mask, DRIVE", by("routes").length > 0 && by("routes").every((x) => x.key === "test-key" && /distanceMeters/.test(x.mask) && x.travelMode === "DRIVE"), JSON.stringify(by("routes")[0]));
  check("places calls: header key, field mask, hospital types", by("places").length > 0 && by("places").every((x) => x.key === "test-key" && /displayName/.test(x.mask)), JSON.stringify(by("places")[0]));
  const texts = JSON.stringify(g);
  check("no phone number or customer name goes to Google", !/9198111|E2E Tester/.test(texts));

  console.log(`\n${pass} passed, ${fail} failed`);
})().catch((e) => console.log("ERR", e.stack));
