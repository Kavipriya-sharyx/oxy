// Client chat, 17 Nov: after the button flow, "Activate" with no official link offers callback times; the
// customer's pick ("Tomorrow, 12-2 pm" = id "2") was read as the old opening-menu row 2 (state INTENT_MENU) and
// the bot asked for the city again. Real plan rows from the seed, no activation link (as on the server).
import { planSeeds } from "@Database/Seeds/OxxyData";
import { ChatPipelineService, asksKnownAgain } from "./ChatPipeline.service";
import { matchFaq } from "@Helper/FaqReplies";
import { GuardrailService } from "./Guardrail.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { assertTransition } from "./ConversationStateMachine";
import { DateWindowService } from "./DateWindow.service";
import { ValueCheckService } from "./ValueCheck.service";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NOTICE_VERSION } from "@Helper/FixedReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { asset_send } from "@Database/Table/Oxxy/asset_send";
import { centre } from "@Database/Table/Oxxy/centre";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";

const WITH_LINK = false;
type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const CATALOG = planSeeds().map((r) => ({
  ...r,
  id: `${r.plan}-${r.billing[0]}`,
  status: true,
  version: 1,
  gst_rate: 0.18,
  activation_link: WITH_LINK ? `https://pay.oxxy.in/${r.plan}-${r.billing[0]}` : null,
})) as Record<string, unknown>[];
const CENTRES = [
  { id: "ce1", name: "KMCH Hospital", branch: "Avinashi Road", locality: "Peelamedu", city: "Coimbatore", type: "Hospital", distance_km: 1.2 },
  { id: "ce2", name: "PSG Hospitals", branch: "Peelamedu", locality: "Peelamedu", city: "Coimbatore", type: "Hospital", distance_km: 2.0 },
];

function fmt(m: Record<string, unknown>): string {
  const body = String(m.log ?? m.body ?? (m.kind === "template" ? `[template ${m.name}]` : ""));
  let extra = "";
  if (m.kind === "buttons") extra = "  [buttons: " + (m.buttons as { id: string; title: string }[]).map((b) => `${b.title}(${b.id})`).join(" | ") + "]";
  if (m.kind === "list") extra = `  [list "${m.buttonLabel}": ` + (m.rows as { id: string; title: string }[]).map((r) => `${r.title}(${r.id})`).join(" | ") + "]";
  if (m.kind === "cta_url") extra = `  [link button: ${m.buttonText}]`;
  if (m.kind === "location_request") extra = "  [Send location button]";
  const h = m.header as { type: string; text?: string } | undefined;
  const head = h ? (h.type === "text" ? `{${h.text}} ` : "{image} ") : "";
  return `  BOT(${m.kind}): ${head}${body.replace(/\n/g, "\n       ")}${extra}`;
}

function setup(opts: { llm?: unknown[]; maps?: unknown } = {}) {
  const conv = { id: "v1", state: S.New, selected_product: null as string | null, recommended_plan: null as string | null, pending_action: null as string | null, outcome: null as string | null };
  const sent: Record<string, unknown>[] = [];
  let replied = false;
  const send = jest.fn(async (...a: unknown[]) => {
    sent.push(a[1] as Record<string, unknown>);
    replied = true;
    return "wamid.OUT";
  });
  const llm = [...(opts.llm ?? [])];
  const generate = jest.fn(async () => {
    const x = llm.shift();
    return typeof x === "object" && x ? x : { reply_text: (x as string) ?? "[LLM reply]", intent: "other", extracted_fields: {}, needs_human: false };
  });
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string);
    conv.state = to as S;
    return conv;
  });
  let consentRow: Record<string, unknown> | null = { opt_out_at: null, health_data_consent: true, notice_version: NOTICE_VERSION, consent_timestamp: new Date() };
  let actRow: Record<string, unknown> | null = null;
  const tasks: Record<string, unknown>[] = [];
  const mg = {
    save: jest.fn(async (v: Record<string, unknown>) => {
      if (v.__cls === consent) consentRow = v;
      if (v.__cls === activation) actRow = { ...v, id: "act1", created_on: new Date() };
      if (v.__cls === task) {
        const r = { ...v, id: `task${tasks.length + 1}`, created_on: new Date() };
        tasks.push(r);
        return r;
      }
      return { ...v, id: (v.id as string) ?? "new-id" };
    }),
    create: (c: unknown, v: Record<string, unknown>) => ({ ...v, __cls: c }),
    update: jest.fn(async (c: unknown, w: unknown, v: Record<string, unknown>) => {
      if (c === task) for (const t of tasks) if (t.id === (w as { id?: string })?.id) Object.assign(t, v);
    }),
    findOne: jest.fn(async () => null),
  };
  const needRow: Record<string, unknown> = { save: async () => undefined };
  stub(message, "findOne", async (o: unknown) => {
    const w = (o as { where?: { reply_to_wa_message_id?: string; type?: string } })?.where;
    if (w?.type === "location_request") return { id: "pin-asked" };
    return replied && w?.reply_to_wa_message_id ? { id: "out" } : null;
  });
  stub(message, "find", async () => []);
  stub(conversation, "findOne", async () => conv);
  stub(conversation, "update", async (_w: unknown, v: unknown) => { Object.assign(conv, v as object); return undefined; });
  stub(consent, "findOne", async () => consentRow);
  stub(task, "findOne", async (o: unknown) => {
    const id = (o as { where?: { id?: string } })?.where?.id;
    return (id ? tasks.find((t) => t.id === id) : tasks.at(-1)) ?? null;
  });
  stub(task, "find", async () => tasks);
  stub(task, "update", async (w: unknown, v: unknown) => {
    for (const t of tasks) if (t.id === (w as { id?: string })?.id || t.id === w) Object.assign(t, v as object);
    return undefined;
  });
  stub(booking_request, "findOne", async () => null);
  stub(activation, "findOne", async () => actRow);
  stub(plan_catalog, "find", async (o: unknown) => {
    const w = ((o as { where?: Record<string, unknown> })?.where ?? {}) as Record<string, unknown>;
    return CATALOG.filter((r) => (!w.plan || r.plan === w.plan) && (!w.product || r.product === w.product) && (!w.billing || r.billing === w.billing));
  });
  stub(plan_catalog, "findOne", async (o: unknown) => {
    const w = ((o as { where?: Record<string, unknown> })?.where ?? {}) as Record<string, unknown>;
    return CATALOG.find((r) => (!w.id || r.id === w.id) && (!w.plan || r.plan === w.plan) && (!w.billing || r.billing === w.billing) && (!w.product || r.product === w.product)) ?? null;
  });
  stub(approved_asset, "find", async () => []);
  stub(asset_send, "find", async () => []);
  stub(centre, "findOne", async (o: unknown) => CENTRES.find((c) => c.id === ((o as { where?: { id?: string } })?.where?.id)) ?? null);
  stub(centre, "find", async () => [{ city: "Coimbatore" }, { city: "Tiruppur" }]);
  stub(trigger_event, "findOne", async () => null);
  stub(trigger_event, "save", async (v: unknown) => v);
  stub(trigger_event, "create", (v: unknown) => v);
  jest.spyOn(need, "findOne").mockResolvedValue(needRow as never);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    new ReplyValidatorService(),
    { send } as never,
    new ValueCheckService() as never,
    { search: async () => CENTRES } as never,
    { create: async (b: object) => ({ ...b, id: "bk1" }) } as never,
    new DateWindowService() as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
    { transition } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    opts.maps as never,
  );
  const s = { customer: { id: "c1", language: "en", active_product: null, age: null as number | null, save: async () => undefined }, conversation: conv } as never;
  const log: string[] = [];
  let n = 0;
  const run = async (text: string, extra: Record<string, unknown> = {}) => {
    replied = false;
    const before = sent.length;
    const calls = generate.mock.calls.length;
    log.push(`> USER: ${text}`);
    try {
      await pipeline.process({ waNumber: "919800000001", waMessageId: `wamid.IN${++n}`, text, ...extra } as never, s);
    } catch (e) {
      log.push(`  !! THREW: ${(e as Error).message}`);
    }
    const now = sent.slice(before);
    if (!now.length) log.push("  (no reply)");
    for (const m of now) log.push(fmt(m));
    const llmUsed = generate.mock.calls.length > calls ? " LLM" : "";
    log.push(`  [state=${conv.state} pending=${conv.pending_action} plan=${conv.recommended_plan} tasks=${tasks.length}${llmUsed}]`);
  };
  return { run, log, conv, sent, needRow };
}

afterEach(() => jest.restoreAllMocks());

const FLOW = ["hi", "flow_start", "who_parent", "need_medicines", "age_65", "Peelamedu, Coimbatore", "spend_50000"];
const last = (t: { sent: Record<string, unknown>[] }) => t.sent.at(-1) as Record<string, unknown>;
const text = (m: Record<string, unknown>) => String(m.log ?? m.body ?? "");

describe("17 Nov client chat: callback times after the button flow", () => {
  it("Activate with no official link -> callback buttons; the tapped time is saved, not read as menu row 2", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_monthly"]) await t.run(x);
    const offer = t.sent.find((m) => /our team will send you the official secure activation link/.test(text(m)))!;
    expect(text(offer)).toContain("To activate the Oxxy Everyday plan, our team");
    expect(text(offer)).not.toContain("plan plan");
    expect((offer.buttons as { id: string; title: string }[]).map((b) => b.title)).toEqual([
      "Tomorrow 10am-12pm",
      "Tomorrow, 12-2 pm",
      "Tomorrow, 2-4 pm",
    ]);
    expect(t.conv.pending_action).toMatch(/^callback_time:/);
    await t.run("2");
    expect(text(last(t))).toBe("I have requested a callback for Tomorrow, 12-2 pm. Reference: CB-TASK1.");
    expect(t.conv.pending_action).toBeNull();
    expect(t.conv.state).not.toBe(S.CentreSearch);
  });

  it("a typed time works too, and the summary carries the callback", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_yearly", "tomorrow evening"]) await t.run(x);
    expect(text(last(t))).toContain("I have requested a callback for Tomorrow, 6-7 pm. Reference: CB-TASK1.");
    await t.run("thanks");
    expect(t.sent.map(text).join(" ")).toContain("Callback: Tomorrow, 6-7 pm (CB-TASK1).");
  });

  it("follow-up times '2' in INTENT_MENU is the follow-up, not the opening menu", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_monthly", "I will discuss with my family"]) await t.run(x);
    expect(t.conv.pending_action).toBe("follow_up_time");
    await t.run("2");
    expect(text(last(t))).toMatch(/^Thank you\. I will follow up on .* at 5 pm\./);
  });

  it("menu row \"find a centre\" after the flow asks how far near the known area, not the city again", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_monthly", "2", "2"]) await t.run(x); // callback time 2, then a typed "2" (old menu row: find a centre)
    expect(text(last(t))).toBe("Near Peelamedu, Coimbatore. How far can the patient travel for this? For example 5 km, 10 km or 20 km.");
    expect(t.conv.pending_action).toBe("centre_radius");
    expect(t.sent.slice(-2).map(text).join(" ")).not.toMatch(/which city/i);
  });

  it("the AI may not ask the city again when only the city is known", () => {
    expect(asksKnownAgain("Sure. Which city and locality does the patient live in?", { city: "Coimbatore", locality: null })).toContain(
      "the city is Coimbatore",
    );
    expect(asksKnownAgain("Which area of Coimbatore is the patient in?", { city: "Coimbatore", locality: null })).toBeNull();
  });

  it("a shared pin at the flow's city question saves its area and city (no location question later)", async () => {
    const maps = { enabled: true, reverseGeocode: jest.fn(async () => ({ latitude: 11.03, longitude: 77.03, formatted: "", locality: "Peelamedu", city: "Coimbatore", approximate: false })) };
    const t = setup({ maps });
    for (const x of ["hi", "flow_start", "who_parent", "need_medicines", "age_65"]) await t.run(x);
    expect(t.conv.pending_action).toBe("flow:city");
    await t.run("[location message]", { type: "location", location: { latitude: 11.03, longitude: 77.03 } });
    expect(maps.reverseGeocode).toHaveBeenCalledWith({ latitude: 11.03, longitude: 77.03 });
    expect(t.needRow).toMatchObject({ city: "Coimbatore", locality: "Peelamedu" });
    expect(text(last(t))).toContain("How much will your annual medical expense be next year?");
  });

  it("a LIVE location (Cloud API: unsupported) is never saved as the city; the question comes back with how to answer", async () => {
    const t = setup();
    for (const x of ["hi", "flow_start", "who_parent", "need_medicines", "age_65"]) await t.run(x);
    await t.run("[unsupported message]", { type: "unsupported" });
    expect(t.needRow.city).toBeUndefined();
    expect(last(t)).toMatchObject({ kind: "location_request" });
    expect(text(last(t))).toContain("a live location cannot be shared with this chat");
    expect(t.conv.pending_action).toBe("flow:city");
  });

  it("the area given earlier in the chat skips the flow's city question", async () => {
    const t = setup();
    for (const x of ["hi", "flow_start", "who_parent", "need_medicines"]) await t.run(x);
    Object.assign(t.needRow, { city: "Tiruppur", locality: null }); // typed earlier ("I am in Tiruppur")
    await t.run("age_65");
    expect(text(last(t))).toContain("How much will your annual medical expense be next year?");
    expect(t.conv.pending_action).toBe("flow:spend");
  });

  it("'any hospital near me?' after the flow uses the area from the chat", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_monthly", "2", "any hospital near me?"]) await t.run(x);
    expect(text(last(t))).toBe("Near Peelamedu, Coimbatore. How far can the patient travel for this? For example 5 km, 10 km or 20 km.");
    expect(t.conv.pending_action).toBe("centre_radius");
  });

  it("'can i know about oxxy' is the approved 'what is Oxxy' answer", () => {
    for (const q of ["can i know about oxxy", "about oxxy?", "more details about oxxy", "oxxy ke baare mein batao"])
      expect(matchFaq(q)).toBe("what_is_oxxy");
  });

  it("a draft that asks a known thing twice keeps its answer (no 'Sorry, I could not answer that here')", async () => {
    const d = "Oxxy helps families save on eligible consultations, tests and medicines. What type of expense do you need help with?";
    const t = setup({ llm: [d, d] });
    for (const x of [...FLOW, "act_monthly", "2", "how does this work for my parents?"]) await t.run(x);
    expect(text(last(t))).toBe("Oxxy helps families save on eligible consultations, tests and medicines.");
    expect(t.sent.map(text).join(" ")).not.toContain("could not answer");
  });

  // Client chat, 17 Nov evening: the plan card said Infinity; "Does it support dialysis?" came back as "I recommend
  // the Thrive plan … yearly healthcare spend of about ₹5,00,000" with the spend ranges again, and "Can I buy for
  // my parents" got only the activation text.
  const PARENTS = ["hi", "flow_start", "who_parents", "need_hospital", "age_65", "Peelamedu, Coimbatore", "spend_500000"];
  const D = (reply_text: string, intent: string, extracted_fields: object = {}) => ({ reply_text, intent, extracted_fields, needs_human: false });

  it("a coverage question tagged 'recommend' keeps the flow's plan and its answer", async () => {
    const dial = D("Yes. Kidney disease is listed, and Oxxy also works on dialysis.", "recommend", { healthcare_need: "dialysis" });
    const t = setup({ llm: [dial] });
    for (const x of [...PARENTS, "Does it support dialysis?"]) await t.run(x);
    expect(t.conv.recommended_plan).toBe("infinity");
    expect(text(last(t))).toBe("Yes. Kidney disease is listed, and Oxxy also works on dialysis.");
    expect(last(t).kind).toBe("text"); // no spend-range list
  });

  it("a question with the activate intent is answered first, then the activation step", async () => {
    const buy = D("Yes, you can take the plan for your parents. Infinity has no age limit.", "activate");
    const t = setup({ llm: [buy] });
    for (const x of [...PARENTS, "Can I buy for my parents"]) await t.run(x);
    expect(text(last(t))).toMatch(/^Yes, you can take the plan for your parents\. Infinity has no age limit\.\n\nTo activate the Oxxy Infinity plan/);
  });

  it("'what oxxy will do' is the approved answer", () => {
    expect(matchFaq("what oxxy will do")).toBe("what_is_oxxy");
  });
});
