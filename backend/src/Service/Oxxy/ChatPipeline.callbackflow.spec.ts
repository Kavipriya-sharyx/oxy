// Client chat, 17 Nov: after the button flow, "Activate" with no official link offers callback times; the
// customer's pick ("Tomorrow, 12-2 pm" = id "2") was read as the old opening-menu row 2 (state INTENT_MENU) and
// the bot asked for the city again. Real plan rows from the seed, no activation link (as on the server).
import { planSeeds } from "@Database/Seeds/OxxyData";
import { ChatPipelineService, asksKnownAgain } from "./ChatPipeline.service";
import { matchFaq } from "@Helper/FaqReplies";
import { asksWorksAtCentre } from "@Helper/PlanReplies";
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
    if (w?.reply_to_wa_message_id) return replied ? { id: "out" } : null;
    // the last bot message / a message with this body (lastBotText, the terms card sent once)
    const rawBody = (w as { body?: unknown } | undefined)?.body;
    const all = sent.map((x) => String((x as { log?: string }).log ?? (x as { body?: string }).body ?? ""));
    if (rawBody && typeof rawBody === "object") {
      // TypeORM Like("%text%"): contains
      const want = String((rawBody as { value?: string; _value?: string }).value ?? (rawBody as { _value?: string })._value ?? "").replace(/^%|%$/g, "");
      const hit = all.find((b) => b.includes(want));
      return hit ? { id: "out", body: hit } : null;
    }
    const body = rawBody as string | undefined;
    if (body) return all.includes(body) ? { id: "out", body } : null;
    if ((w as { direction?: string } | undefined)?.direction === "out" && all.length) return { id: "out", body: all[all.length - 1] };
    return null;
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
// the callback and follow-up times depend on the clock: every test runs at 17 Nov 2026, 10 pm IST
beforeEach(() =>
  jest.useFakeTimers({
    now: new Date("2026-11-17T16:30:00Z"),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout", "queueMicrotask", "hrtime", "performance"],
  }),
);
afterEach(() => jest.useRealTimers());

// the client's part (service -> Calculate Now -> spend), then ours (age -> city); medicines: no appointment offer
const FLOW = ["hi", "flow_start", "who_parent", "need_medicines", "calc_start", "spend_50000", "age_65", "Peelamedu, Coimbatore", "med_no"];
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
    // the same options may still be tapped once more to change the slot
    expect(t.conv.pending_action).toMatch(/^callback_set:/);
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
    for (const x of [...FLOW, "act_monthly", "2", "ok", "2"]) await t.run(x); // callback time 2, "ok", then a typed "2" (old menu row: find a centre)
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
    for (const x of ["hi", "flow_start", "who_parent", "need_medicines", "calc_start", "spend_50000", "age_65"]) await t.run(x);
    expect(t.conv.pending_action).toBe("flow:city");
    await t.run("[location message]", { type: "location", location: { latitude: 11.03, longitude: 77.03 } });
    expect(maps.reverseGeocode).toHaveBeenCalledWith({ latitude: 11.03, longitude: 77.03 });
    expect(t.needRow).toMatchObject({ city: "Coimbatore", locality: "Peelamedu" });
    expect(text(last(t))).toContain("Shall I check home delivery for your medicines?"); // medicines: the delivery offer next (Trigger K)
  });

  it("a LIVE location (Cloud API: unsupported) is never saved as the city; the question comes back with how to answer", async () => {
    const t = setup();
    for (const x of ["hi", "flow_start", "who_parent", "need_medicines", "calc_start", "spend_50000", "age_65"]) await t.run(x);
    await t.run("[unsupported message]", { type: "unsupported" });
    expect(t.needRow.city).toBeUndefined();
    expect(last(t)).toMatchObject({ kind: "location_request" });
    expect(text(last(t))).toContain("a live location cannot be shared with this chat");
    expect(t.conv.pending_action).toBe("flow:city");
  });

  it("the area given earlier in the chat skips the flow's city question", async () => {
    const t = setup();
    for (const x of ["hi", "flow_start", "who_parent", "need_medicines", "calc_start", "spend_50000"]) await t.run(x);
    Object.assign(t.needRow, { city: "Tiruppur", locality: null }); // typed earlier ("I am in Tiruppur")
    await t.run("age_65");
    expect(text(last(t))).toContain("Shall I check home delivery for your medicines?");
    expect(t.conv.pending_action).toBe("flow:med");
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
  const PARENTS = ["hi", "flow_start", "who_parents", "need_hospital", "calc_start", "spend_500000", "age_65", "Peelamedu, Coimbatore", "book_no"];
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

  it("'Does it work at apollo?' gets the approved answer, not the holding message", async () => {
    for (const q of ["Does it work at apollo?", "Does it work at apollo? Hospital", "can i use oxxy at KMCH", "Is PSG hospital accepted?"])
      expect(asksWorksAtCentre(q)).toBe("named");
    expect(asksWorksAtCentre("does it work in every hospital?")).toBe("every");
    expect(asksWorksAtCentre("does it work for dialysis?")).toBeNull();
    const t = setup();
    for (const x of [...FLOW, "Does it work at apollo?"]) await t.run(x);
    expect(text(last(t))).toContain("Let Oxxy help you with appointment booking first.");
    expect(t.sent.map(text).join(" ")).not.toMatch(/get back to you shortly|could not answer/);
  });

  it("'Can I know about oxxy' after the flow: the approved answer without asking the known need again", async () => {
    const t = setup();
    for (const x of [...FLOW, "Can I know about oxxy"]) await t.run(x);
    expect(text(last(t))).toMatch(/^Oxxy is /);
    expect(text(last(t))).not.toContain("What type of expense");
  });

  // Client, 17 Nov: "the knowledge base does not work". A question that IS one of the approved questions is
  // answered from it (the LLM gets it first), not by a fixed reply picked by one keyword.
  it("an approved question goes to the approved answer, not a keyword reply", async () => {
    const cases: [string, string][] = [
      ["Is the price inclusive of all taxes?", "The plans are subject to GST"],
      ["Which medicine should I take?", "I cannot prescribe or recommend"],
      ["Does it work in government hospitals?", "Oxxy is intended primarily for private healthcare"],
    ];
    for (const [q, start] of cases) {
      const { KB_QA } = await import("@Helper/KnowledgeBaseData");
      const e = (KB_QA as any[]).find((x) => x.q === q);
      expect(e?.a.startsWith(start.slice(0, 20))).toBe(true);
      const t = setup({ llm: [e.a, e.a] });
      (t.conv as any).state = S.Discovery;
      Object.assign(t.needRow, { beneficiary: "self", healthcare_need: "doctor consultations", city: "Coimbatore" });
      await t.run(q);
      expect(text(last(t))).toContain(e.a.slice(0, 40));
      jest.restoreAllMocks();
    }
  });

  it("'What about stroke rehabilitation?' is a care question, not the emergency reply", async () => {
    const t = setup({ llm: ["Stroke rehabilitation can be discussed under the applicable plan."] });
    (t.conv as any).state = S.Discovery;
    await t.run("What about stroke rehabilitation?");
    expect(t.sent.map(text).join(" ")).not.toContain("112");
  });

  it("insurance: 'I have no insurance' and 'which is better' get their own answers", async () => {
    let t = setup();
    (t.conv as any).state = S.Discovery;
    await t.run("I have no insurance.");
    expect(text(last(t))).toMatch(/^Oxxy can be useful for reducing eligible planned private-healthcare bills/);
    jest.restoreAllMocks();
    t = setup();
    (t.conv as any).state = S.Discovery;
    await t.run("Which is better - insurance or Oxxy?");
    expect(text(last(t))).toMatch(/^They solve different parts of healthcare cost/);
  });

  it("'How do I know this is not a scam?' is a trust question, not a complaint", async () => {
    const t = setup({ llm: ["It is sensible to verify any service before paying."] });
    (t.conv as any).state = S.Discovery;
    await t.run("How do I know this is not a scam?");
    expect(t.sent.map(text).join(" ")).not.toContain("raised an urgent request");
  });

  // Client feedback list, 17 Nov evening (7 problems from a real chat)
  const VISIT = ["hi", "flow_start", "who_family", "need_consult", "calc_start", "spend_50000", "age_65", "Peelamedu, Coimbatore"];

  it("1. the 'Get in Touch with Oxxy …' title only where the client's bot has it (who, service), never again", async () => {
    const t = setup();
    for (const x of [...VISIT, "book_no"]) await t.run(x);
    const titled = t.sent.filter((m) => /Get in Touch with Oxxy/.test(String((m.header as { text?: string } | undefined)?.text ?? "")));
    expect(titled).toHaveLength(2);
    expect(text(titled[0])).toContain("Who Are You Looking For Healthcare Support For?");
    expect(text(titled[1])).toContain("Regarding what are you looking for medical service?");
  });

  it("2. no Terms & Conditions card when the team sends the link (no official link step)", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_monthly"]) await t.run(x);
    expect(t.sent.map(text).join(" ")).not.toContain("terms and conditions");
  });

  it("3 + 4. a visit: hospital, then the appointment date and time (separate from the callback), then the flow goes on", async () => {
    const t = setup();
    for (const x of VISIT) await t.run(x);
    expect(text(last(t))).toContain("Would you like me to book the appointment too?");
    for (const x of ["book_yes", "KMCH Hospital", "Avinashi Road", "cardiology", "25 Nov", "morning"]) await t.run(x);
    const all = t.sent.map(text).join("\n");
    expect(all).toContain("Please share the centre and branch first.");
    expect(all).toContain("What date would you prefer?");
    expect(all).toContain("What time or time window would suit you?");
    expect(all).toContain("Your booking request has been made for 25 Nov 2026 at morning at KMCH Hospital");
    expect(text(last(t))).toContain("Would you like to activate your Oxxy care plan?");
    expect(t.conv.pending_action).toBe("flow:close:0");
  });

  it("5. a second tap on the callback options changes the slot and confirms the new one", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_monthly", "1"]) await t.run(x);
    expect(text(last(t))).toBe("I have requested a callback for Tomorrow, 10 am-12 pm. Reference: CB-TASK1.");
    await t.run("3");
    expect(text(last(t))).toBe("Updated. Your callback is now Tomorrow, 2-4 pm. Reference: CB-TASK1.");
    expect(t.sent.map(text).join(" ")).not.toContain("lifelong healthcare savings"); // "3" is not the old menu
    await t.run("thanks");
    expect(t.conv.pending_action).toBeNull();
  });

  it("7. 'Yes' to an open question asks what exactly is needed, never restarts", async () => {
    const t = setup({ llm: ["Happy to help. What type of expense do you need help with?"] });
    (t.conv as any).state = S.Discovery;
    Object.assign(t.needRow, { beneficiary: "family" });
    await t.run("I need help");
    await t.run("Yes");
    expect(text(last(t))).toBe("Could you please specify which medicine or healthcare service your family member needs?");
  });

  it("the appointment via 'near by me' and the centre list: YES / NO buttons, then back to the flow", async () => {
    const t = setup();
    for (const x of [...VISIT, "book_yes", "Near by me", "10 km", "1"]) await t.run(x);
    expect(last(t)).toMatchObject({ kind: "buttons" });
    expect(text(last(t))).toContain("May I do your booking at KMCH Hospital, Avinashi Road? Reply YES or NO");
    for (const x of ["yes", "cardiology", "25 Nov", "morning"]) await t.run(x);
    expect(t.sent.map(text).join("\n")).toContain("Your booking request has been made for 25 Nov 2026");
    expect(text(last(t))).toContain("Would you like to activate your Oxxy care plan?");
    expect(t.conv.pending_action).toBe("flow:close:0");
  });

  // Client, 17 Nov: "acknowledge every answer (age, monthly package, family member …) before the next question"
  it("every answer in the flow is said back first", async () => {
    const t = setup();
    const said: Record<string, RegExp> = {
      who_parent: /^Got it, this is for your father or mother\.\n\n/,
      need_pathlab: /^Noted: lab tests\.\n\n/,
      calc_start: /^Sure, let us work out your savings\.\n\n/,
      spend_30000: /You mentioned a yearly medical expense of about ₹30,000/,
      age_65: /^Thank you, noted the age \(61 – 70\)\.\n\n/,
      "Peelamedu, Coimbatore": /^Thank you, noted the area: Peelamedu, Coimbatore\.\n\n/,
      book_no: /^No problem, I can book the appointment any time later\.\n\n/,
      fam_2: /^Noted, 2 more members\.\n\n/,
      famb_monthly: /^Noted: the monthly price\.\n\n/,
      act_monthly: /^Great choice: the monthly plan\.\n\n/,
    };
    for (const x of ["hi", "flow_start", "who_parent", "need_pathlab", "calc_start", "spend_30000", "age_65", "Peelamedu, Coimbatore", "book_no", "flow_family", "fam_2", "famb_monthly", "act_monthly"]) {
      const before = t.sent.length;
      await t.run(x);
      if (said[x]) expect(text(t.sent[before])).toMatch(said[x]);
    }
  });

  // Client chat, 17 Nov night: "Book appointment" -> the welcome card again (the flow restarted)
  it("WhatsApp's request_welcome in the middle of the flow changes nothing (no welcome card, the step stays)", async () => {
    const t = setup();
    for (const x of VISIT) await t.run(x);
    expect(t.conv.pending_action).toBe("flow:book");
    const before = t.sent.length;
    await t.run("", { type: "request_welcome" });
    expect(t.sent.length).toBe(before);
    expect(t.conv.pending_action).toBe("flow:book");
    await t.run("book_yes");
    expect(text(last(t))).toContain("Please share the centre and branch first.");
    expect(last(t)).toMatchObject({ kind: "buttons", buttons: [{ title: "Suggest nearby" }] });
  });

  it("a new chat still gets the welcome card on request_welcome", async () => {
    const t = setup();
    await t.run("", { type: "request_welcome" });
    expect(text(last(t))).toContain("Welcome to Oxxy HealthCare!");
  });

  it("pin -> Book appointment -> Suggest nearby -> list -> Yes -> details -> booking saved -> the plan with GST", async () => {
    const maps = { enabled: true, reverseGeocode: jest.fn(async () => ({ latitude: 11.01, longitude: 76.92, formatted: "", locality: "Aishwarya Nagar", city: "P N Pudur", approximate: false })), geocode: jest.fn(async () => null), travel: jest.fn(async () => []), nearbyCandidates: jest.fn(async () => []) };
    const t = setup({ maps });
    for (const x of ["Hi", "flow_start", "who_parent", "need_consult", "calc_start", "spend_30000", "age_73"]) await t.run(x);
    await t.run("[location message]", { type: "location", location: { latitude: 11.0176, longitude: 76.9205 } });
    expect(text(last(t))).toMatch(/^Thank you, noted the area: Aishwarya Nagar, P N Pudur\.\n\nWould you like me to book the appointment too\?/);
    for (const x of ["book_yes", "suggest a centre near me", "10 km", "1", "yes", "general physician", "25 Nov", "morning"]) await t.run(x);
    const all = t.sent.map(text).join("\n");
    expect(all).toContain("Your booking request has been made for 25 Nov 2026 at morning at KMCH Hospital");
    expect(t.sent.filter((m) => text(m).startsWith("Welcome to Oxxy HealthCare!"))).toHaveLength(1); // never restarted
    expect(text(last(t))).toContain("Plan cost: ₹20,000\n+ GST (18%): ₹3,600\n= Final payable: ₹23,600 a year");
    expect(t.conv.pending_action).toBe("flow:close:0");
  });

  // Client, 17 Nov: "Additional Oxxy chatbot corrections" (Triggers K, A/L, M, N, P)
  const MEDS = ["hi", "flow_start", "who_self", "need_medicines", "calc_start", "spend_20000", "age_35", "Peelamedu, Coimbatore"];

  it("K in the flow: Check delivery -> the names -> the team checks delivery (nothing confirmed) -> the plan", async () => {
    const t = setup();
    for (const x of MEDS) await t.run(x);
    expect(last(t)).toMatchObject({ kind: "buttons", buttons: [{ title: "Check delivery" }, { title: "Not now" }] });
    await t.run("med_yes");
    expect(text(last(t))).toContain("Which medicines do you need?");
    expect(last(t).kind).toBe("text"); // typed names: no list under it
    await t.run("Metformin 500, Telma 40");
    const all = t.sent.map(text).join("\n");
    expect(all).toContain("Noted: Metformin 500, Telma 40, delivery to Peelamedu, Coimbatore. Our team will check home-delivery availability");
    expect(all).toContain("Nothing is confirmed yet.");
    expect(text(last(t))).toContain("Would you like to activate your Oxxy care plan?");
  });

  it("K in free text: names, then the city only because the chat does not have it", async () => {
    const t = setup();
    (t.conv as any).state = S.Discovery;
    await t.run("can I get medicines delivered at home?");
    expect(text(last(t))).toContain("Which medicines do you need?");
    await t.run("Dolo 650");
    expect(text(last(t))).toContain("Which city and area should the medicines be delivered to?");
    await t.run("Chennai, Adyar");
    expect(text(last(t))).toContain("Noted: Dolo 650, delivery to");
    expect(t.conv.pending_action).toBeNull();
  });

  it("M: the price objection keeps the plan shown and offers the monthly option with buttons; the benefit gets a CTA", async () => {
    const t = setup();
    for (const x of [...PARENTS, "too costly"]) await t.run(x);
    expect(t.conv.recommended_plan).toBe("infinity");
    expect(text(last(t))).toContain("The Oxxy Infinity plan is also available monthly at ₹3,999 + GST ₹720 = ₹4,719 monthly");
    expect(last(t)).toMatchObject({ kind: "buttons", buttons: [{ title: "Monthly plan" }, { title: "Follow up later" }] });
    await t.run("we are healthy, what is the use?");
    expect(text(last(t))).toMatch(/plan details, or should I follow up later\?$/);
    expect(last(t)).toMatchObject({ kind: "buttons", buttons: [{ title: "Plan details" }, { title: "Follow up later" }] });
  });

  it("N: 'follow up later' -> summary + two times as buttons; scheduled only when one is picked", async () => {
    const t = setup();
    for (const x of [...PARENTS, "follow up later"]) await t.run(x);
    expect(last(t)).toMatchObject({ kind: "buttons", buttons: [{ id: "1" }, { id: "2" }] });
    expect(t.conv.pending_action).toBe("follow_up_time");
    await t.run("2");
    expect(text(last(t))).toMatch(/^Thank you\. I will follow up on /);
  });

  it("P: 'I have done the payment' with the team's link: acknowledged, sent for checking, never confirmed", async () => {
    const t = setup();
    for (const x of [...FLOW, "act_yearly", "I have done the payment"]) await t.run(x);
    expect(text(last(t))).toBe("Thank you. Our team will check the payment and confirm your activation on WhatsApp. You do not need to share any card, UPI or bank details.");
    expect(t.sent.map(text).join(" ")).not.toMatch(/activation is (now )?(active|confirmed)|plan is active/i);
  });

  it("A: 'how do I know this is not a scam?' is a proof question", async () => {
    const t = setup();
    (t.conv as any).state = S.Discovery;
    await t.run("how do I know this is not a scam?");
    expect(t.sent.map(text).join(" ")).toContain("Official website");
  });

  // AI end-to-end test, 18 Nov 2026 (real LLM): three fixes
  it("after the plan card, an approved question goes to the approved answer (KB first while a flow step waits)", async () => {
    const t = setup({ llm: ["The plans are subject to GST as per government policies.", "x"] });
    for (const x of PARENTS) await t.run(x);
    expect(t.conv.pending_action).toBe("flow:close:0");
    await t.run("Is the price inclusive of all taxes?");
    expect(text(last(t))).toContain("The plans are subject to GST as per government policies.");
    expect(text(last(t))).not.toContain("Here are the four Oxxy plans");
  });

  it("'Which medicine should I take for my BP?' is not the medicine delivery answer", async () => {
    const t = setup({ llm: ["I cannot prescribe or recommend medicine. Please follow a qualified doctor's advice."] });
    for (const x of PARENTS) await t.run(x);
    await t.run("Which medicine should I take for my BP?");
    expect(text(last(t))).toContain("I cannot prescribe or recommend medicine.");
    expect(t.sent.map(text).join(" ")).not.toContain("home delivery at no additional charge, subject to service availability. Please share");
  });

  it("'so which plan was it again?' keeps the plan shown; only 'another / cheaper plan' picks again", async () => {
    const D = (reply_text: string, intent: string) => ({ reply_text, intent, extracted_fields: {}, needs_human: false });
    const t = setup({ llm: [D("It was the Oxxy Infinity plan.", "recommend")] });
    for (const x of PARENTS) await t.run(x);
    await t.run("so which plan was it again?");
    expect(t.conv.recommended_plan).toBe("infinity");
    expect(text(last(t))).toBe("It was the Oxxy Infinity plan.");
  });
});
