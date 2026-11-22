import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { fixedReply, NOTICE_VERSION } from "@Helper/FixedReplies";
import { OVERPAY_CARD_TEXT } from "./BookCard";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { MENU_BUTTON, MENU_ROWS, WELCOME, matchMenuRow, openingList } from "@Helper/OpeningMenu";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

function setup(opts: { state?: S; language?: string; consented?: boolean } = {}) {
  const consented = opts.consented ?? true;
  const cons = {
    opt_out_at: null,
    whatsapp_consent: false,
    health_data_consent: consented,
    notice_version: consented ? NOTICE_VERSION : null,
    consent_timestamp: consented ? new Date() : null,
    consent_source: null as string | null,
    health_refused_at: null,
    health_refused_version: null,
    notice_sent_at: consented ? null : new Date(),
    notice_sent_version: consented ? null : NOTICE_VERSION,
  };
  const conv = { id: "v1", state: opts.state ?? S.New };
  const out: Record<string, unknown>[] = [];
  const send = jest.fn(async (...a: unknown[]) => {
    const msg = a[1] as {
      kind: string;
      body: string;
      rows?: { id: string; title: string }[];
      buttonLabel?: string;
    };
    out.push({ direction: "out", reply_to_wa_message_id: a[3], text: msg.body, msg });
    return "wamid.OUT";
  });
  const generate = jest.fn(async () => ({
    reply_text: "Sure.",
    intent: "other",
    extracted_fields: {},
    needs_human: false,
  }));
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string); // the real state machine
    conv.state = to as S;
    return conv;
  });
  const mg = { save: jest.fn(async (v: unknown) => v), create: (_c: unknown, v: unknown) => v };

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return out.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(message, "find", async () => []);
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async () => undefined);
  stub(need, "findOne", async () => null);
  stub(task, "findOne", async () => null);
  stub(booking_request, "findOne", async () => null);
  stub(activation, "findOne", async () => null);
  stub(booking_request, "find", async () => []);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    { validate: async () => ({ ok: true, reasons: [] }) } as never,
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
    { transition } as never,
  );
  const saved = {
    customer: { id: "c1", language: opts.language, save: async () => undefined },
    conversation: conv,
  } as never;
  let n = 0;
  const run = (text: string, wamid = `wamid.IN${++n}`, type?: string) =>
    pipeline.process({ waNumber: "919800000001", waMessageId: wamid, text, type }, saved);
  return { run, send, generate, conv, out, cons };
}

afterEach(() => jest.restoreAllMocks());

const last = (t: { out: Record<string, unknown>[] }) => t.out[t.out.length - 1];

describe("the opening list", () => {
  it("has 4 rows within the WhatsApp limits, in every language", () => {
    expect(MENU_ROWS).toHaveLength(4);
    for (const lang of ["en", "hi", "hinglish"] as const) {
      const list = openingList(lang);
      expect(list.rows).toHaveLength(4);
      for (const r of list.rows) expect([...r.title].length).toBeLessThanOrEqual(24);
      expect([...MENU_BUTTON[lang]].length).toBeLessThanOrEqual(20);
      expect(new Set(list.rows.map((r) => r.id)).size).toBe(4);
      expect(list.body).toBe(WELCOME[lang]);
    }
  });

  it("the four rows lead to the four states of the plan", () => {
    // Playbook 4.2: Reduce a medical bill / Find or book a centre / Understand Oxxy / Existing customer help
    expect(MENU_ROWS.map((r) => r.state)).toEqual([
      S.NeedDiscovery,
      S.CentreSearch,
      S.OxxyExplain,
      S.ServiceOrEscalation,
    ]);
    expect(MENU_ROWS.map((r) => r.title.en)).toEqual([
      "Reduce a medical bill",
      "Find or book a centre",
      "Understand Oxxy",
      "Existing customer help",
    ]);
  });

  it("matches a tap (id), a typed title in any language, and a typed number", () => {
    expect(matchMenuRow("menu_explain")?.state).toBe(S.OxxyExplain);
    expect(matchMenuRow("Understand Oxxy")?.state).toBe(S.OxxyExplain);
    expect(matchMenuRow("Oxxy ko samjhein")?.state).toBe(S.OxxyExplain);
    expect(matchMenuRow("2")?.state).toBe(S.CentreSearch);
    expect(matchMenuRow("4")?.state).toBe(S.ServiceOrEscalation);
    expect(matchMenuRow("5")).toBeNull();
    expect(matchMenuRow("I need a plan")).toBeNull();
  });
});

describe("welcome + opening list through the pipeline", () => {
  it("the customer opens the chat for the first time (WhatsApp welcome event): the welcome + options at once", async () => {
    const t = setup({ state: S.New });
    await t.run("", "wamid.W1", "request_welcome");
    expect(t.out).toHaveLength(2); // client order, 21 Nov: the bill card, then Why Overpay
    expect((last(t).msg as { kind: string }).kind).toBe("buttons"); // the client's welcome card (17 Nov)
    expect(t.conv.state).toBe(S.IntentMenu);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a consenting customer's first message gets the client's first card (sequence 3, 20 Nov), state INTENT_MENU, no Claude", async () => {
    const t = setup();
    await t.run("hi");
    const sent = last(t).msg as { kind: string; buttons: { title: string }[] };
    expect(sent.kind).toBe("buttons");
    // Why Overpay: ① the bill card (sequence 1), ② Book Appointment (sequence 2)
    expect(sent.buttons.map((b) => b.title)).toEqual(["Reduce My Bill", "Book Appointment"]);
    expect(last(t).text).toBe(OVERPAY_CARD_TEXT("en"));
    expect(last(t).text).not.toMatch(/Talk to us/);
    expect(t.conv.state).toBe(S.IntentMenu);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("right after the YES: consent thanks + welcome + list in ONE message, state INTENT_MENU", async () => {
    const t = setup({ consented: false });
    await t.run("YES");
    expect((last(t).msg as { kind: string }).kind).toBe("list");
    expect(last(t).text).toBe(`${fixedReply("health_consent_yes", "en")} ${WELCOME.en}`);
    expect(t.conv.state).toBe(S.IntentMenu);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a Hindi greeting gets the first card in Hindi", async () => {
    const t = setup({ language: "hi" });
    await t.run("नमस्ते");
    expect(last(t).text).toBe(OVERPAY_CARD_TEXT("hi"));
  });

  it.each(MENU_ROWS.map((r) => [r.id, r.state] as const))(
    "tap %s -> state %s, fixed reply, no Claude",
    async (id, state) => {
      const t = setup({ state: S.IntentMenu });
      await t.run(id);
      expect(t.conv.state).toBe(state);
      expect(t.out).toHaveLength(1);
      // a question with known answers comes with options to tap (client, 16 Nov 2026)
      expect(["text", "list", "buttons"]).toContain((last(t).msg as { kind: string }).kind);
      if (id === "menu_need") expect((last(t).msg as { kind: string }).kind).toBe("list");
      expect(t.generate).not.toHaveBeenCalled();
    },
  );

  it("the whole journey: hi -> list -> each row, from a fresh conversation", async () => {
    for (const row of MENU_ROWS) {
      const t = setup();
      await t.run("hi");
      expect(t.conv.state).toBe(S.IntentMenu);
      await t.run(row.id);
      expect(t.conv.state).toBe(row.state);
      expect(t.out).toHaveLength(3); // two first cards + the row's reply
    }
  });

  it("a typed row title or number also routes while the menu is open", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("3");
    expect(t.conv.state).toBe(S.OxxyExplain);
  });

  it("free text while the menu is open is a normal conversation (INTENT_MENU -> DISCOVERY)", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("I need help for my mother");
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.conv.state).toBe(S.Discovery);
  });

  it("no list before consent: the notice comes first", async () => {
    const t = setup({ consented: false });
    await t.run("hi"); // notice already sent, this is not a YES/NO
    expect(last(t).text).toBe(fixedReply("health_consent_unclear", "en"));
    expect(t.conv.state).toBe(S.New);
  });

  it("the same message delivered twice sends one list", async () => {
    const t = setup();
    await t.run("hi", "wamid.SAME");
    await t.run("hi", "wamid.SAME");
    expect(t.out).toHaveLength(2); // the two first cards once, nothing for the repeat
  });

  it("safety still wins: an emergency tapped or typed in the menu is not routed as a row", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("I have chest pain");
    expect(last(t).text).toBe(fixedReply("emergency", "en"));
    expect(t.conv.state).toBe(S.Pause);
  });
});

describe("client sequence 1: the Reduce Your Medical Bill card (20 Nov)", () => {
  const PRICES: Record<string, number> = {
    everyday: 10000,
    vital: 20000,
    thrive: 30000,
    infinity: 40000,
  };
  const prices = () =>
    stub(plan_catalog, "find", async (...a) => {
      const plan = (a[0] as { where: { plan: string } }).where.plan;
      return [
        { plan, billing: "yearly", price: PRICES[plan] },
        { plan, billing: "monthly", price: Math.round(PRICES[plan] / 10) },
      ];
    });

  it("Calculate discount -> the bill amount -> the estimate at 30%, no Claude", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("bill_calc");
    expect(last(t).text).toMatch(/enter your bill amount/i);
    expect(t.conv).toMatchObject({ pending_action: "bill_amount" });
    await t.run("10000");
    const card = last(t).msg as { kind: string; body: string; buttons: { id: string }[] };
    expect(card.kind).toBe("buttons");
    expect(card.body).toMatch(/Bill amount: ₹10,000/);
    expect(card.body).toMatch(/Instant discount \(up to 30%\): − ₹3,000/);
    expect(card.body).toMatch(/You could pay: ₹7,000/);
    expect(card.body).toMatch(/illustration only/);
    expect(card.buttons.map((b) => b.id)).toEqual(["bill_activate", "bill_learn", "flow_menu"]);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a word that is not an amount asks once more; a question goes to the normal conversation", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("bill_calc");
    await t.run("hmm");
    expect(last(t).text).toMatch(/could not read an amount/);
    await t.run("does it work at apollo hospital in chennai?");
    expect(last(t).text).not.toMatch(/could not read an amount/);
  });

  it("Learn More: the rows of the client's comparison picture (22 Nov), Oxxy never called insurance", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("bill_learn");
    const body = String(last(t).text);
    expect(body).toMatch(/Why Choose Oxxy Medical Discount Plans\?/);
    expect(body).toContain("*Claims*\n✅ No claims, no paperwork");
    expect(body.length).toBeLessThanOrEqual(1024);
    expect(body).toMatch(/No age limit/);
    expect(body).toMatch(/Oxxy is not insurance/);
  });

  it("View Plan Features (21 Nov) -> the features card; a plan tap still works after it", async () => {
    prices();
    const t = setup({ state: S.IntentMenu });
    await t.run("bill_activate");
    await t.run("plan_features");
    expect(String(last(t).text)).toMatch(/Oxxy Plan Features/);
    expect(t.generate).not.toHaveBeenCalled();
    await t.run("plan_vital");
    expect(String(last(t).text)).toMatch(/Vital/);
  });

  it("Activate Oxxy -> the four plans -> the picked plan with price + GST and the activate buttons", async () => {
    prices();
    const t = setup({ state: S.IntentMenu });
    await t.run("bill_activate");
    const list = last(t).msg as { kind: string; rows: { id: string; description: string }[] };
    expect(list.kind).toBe("list");
    expect(list.rows.map((r) => r.id)).toEqual([
      "plan_everyday",
      "plan_vital",
      "plan_thrive",
      "plan_infinity",
      "plan_features",
    ]);
    expect(list.rows[1].description).toBe("Up to 25% off bills · ₹23,600/year incl. GST");
    await t.run("plan_vital");
    const card = last(t).msg as { kind: string; body: string; buttons: { id: string }[] };
    expect(card.body).toMatch(/Oxxy Vital: up to 25% off/);
    expect(card.body).toMatch(/₹23,600/);
    expect(card.buttons.map((b) => b.id)).toEqual(["act_yearly", "act_monthly", "flow_family"]);
    expect(t.conv).toMatchObject({ pending_action: "flow:close:0", recommended_plan: "vital" });
  });

  it("the template's quick replies arrive as text and work the same way", async () => {
    prices();
    const t = setup({ state: S.IntentMenu });
    await t.run("Learn More");
    expect(last(t).text).toMatch(/Why Choose Oxxy Medical Discount Plans/);
    await t.run("Activate Oxxy");
    expect((last(t).msg as { kind: string }).kind).toBe("list");
    await t.run("Calculate discount");
    expect(last(t).text).toMatch(/enter your bill amount/i);
  });

  it("Main Menu brings the first card back (Why Overpay, sequence 3)", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("flow_menu");
    expect(last(t).text).toBe(OVERPAY_CARD_TEXT("en"));
  });
});

describe("chat-start options (Meta conversation starters, client 21 Nov)", () => {
  it.each([
    ["Reduce Your Medical Bill Now", /Reduce Your Medical Bill Now/],
    ["Why Overpay Your Medical Bills", /Why Overpay Your Medical Bills\?/],
    ["Book Appointment", null],
    ["Activate Oxxy Plan", null],
    ["Calculate Your Savings", /bill amount/i],
    ["Talk to Us", null],
  ])("'%s' as the very first message opens its own card, no health notice, no Claude", async (said, body) => {
    stub(plan_catalog, "find", async () => []);
    const t = setup({ state: S.New, consented: false });
    await t.run(said);
    expect(t.out).toHaveLength(1);
    const sent = last(t).msg as { kind: string; rows?: unknown[] };
    if (body) expect(String(last(t).text)).toMatch(body);
    if (said === "Book Appointment") expect(sent.kind).toBe("location_request");
    if (said === "Activate Oxxy Plan") expect(sent.kind).toBe("list");
    if (said === "Talk to Us") expect(String(last(t).text)).toMatch(/advisor/i);
    expect(String(last(t).text)).not.toMatch(/Before sharing health details/);
    expect(t.conv.state).toBe(S.IntentMenu);
    expect(t.generate).not.toHaveBeenCalled();
  });
});

describe("replies to the voice-call templates (client 21 Nov)", () => {
  const prices = () =>
    stub(plan_catalog, "find", async (...a) => {
      const plan = (a[0] as { where: { plan: string } }).where?.plan ?? "vital";
      return [
        { plan, billing: "yearly", price: 20000 },
        { plan, billing: "monthly", price: 1999 },
      ];
    });

  it("'yes' after plan_recommendation_status -> that plan's cost card with the activate buttons, no Claude", async () => {
    prices();
    const t = setup({ state: S.IntentMenu, consented: false });
    Object.assign(t.conv, { pending_action: "voice_plan:vital" });
    await t.run("Yes, please share the link");
    const card = last(t).msg as { kind: string; body: string; buttons: { id: string }[] };
    expect(card.body).toMatch(/Oxxy Vital/);
    expect(card.buttons.map((b) => b.id)).toEqual(["act_yearly", "act_monthly", "flow_family"]);
    expect(t.conv).toMatchObject({ pending_action: "flow:close:0" });
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("the quick reply https://www.oxxy.in/#plan -> the four plans; News Articles -> the news page", async () => {
    prices();
    const t = setup({ state: S.IntentMenu });
    await t.run("https://www.oxxy.in/#plan");
    expect((last(t).msg as { kind: string }).kind).toBe("list");
    await t.run("News Articles");
    expect(JSON.stringify(last(t).msg)).toMatch(/media_article/);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a question after the plan template is answered normally and the plan step stays; 'no' ends it", async () => {
    prices();
    const t = setup({ state: S.IntentMenu });
    Object.assign(t.conv, { pending_action: "voice_plan:vital" });
    await t.run("Is this insurance?");
    expect(String(last(t).text)).toMatch(/not insurance/);
    expect((t.conv as { pending_action?: string }).pending_action).toBe("voice_plan:vital");
    await t.run("No thanks");
    expect((t.conv as { pending_action?: string }).pending_action).not.toBe("voice_plan:vital");
  });
});
