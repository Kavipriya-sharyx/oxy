import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { fixedReply, NOTICE_VERSION } from "@Helper/FixedReplies";
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
    const msg = a[1] as { kind: string; body: string; rows?: { id: string; title: string }[]; buttonLabel?: string };
    out.push({ direction: "out", reply_to_wa_message_id: a[3], text: msg.body, msg });
    return "wamid.OUT";
  });
  const generate = jest.fn(async () => ({ reply_text: "Sure.", intent: "other", extracted_fields: {}, needs_human: false }));
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
  const saved = { customer: { id: "c1", language: opts.language, save: async () => undefined }, conversation: conv } as never;
  let n = 0;
  const run = (text: string, wamid = `wamid.IN${++n}`) =>
    pipeline.process({ waNumber: "919800000001", waMessageId: wamid, text }, saved);
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
    expect(MENU_ROWS.map((r) => r.state)).toEqual([S.NeedDiscovery, S.OxxyExplain, S.ServiceOrEscalation, S.FollowUpTime]);
  });

  it("matches a tap (id), a typed title in any language, and a typed number", () => {
    expect(matchMenuRow("menu_explain")?.state).toBe(S.OxxyExplain);
    expect(matchMenuRow("What is Oxxy?")?.state).toBe(S.OxxyExplain);
    expect(matchMenuRow("Baad mein baat karein")?.state).toBe(S.FollowUpTime);
    expect(matchMenuRow("3")?.state).toBe(S.ServiceOrEscalation);
    expect(matchMenuRow("5")).toBeNull();
    expect(matchMenuRow("I need a plan")).toBeNull();
  });
});

describe("welcome + opening list through the pipeline", () => {
  it("a consenting customer's first message gets the welcome + the 4-row list, state INTENT_MENU, no Claude", async () => {
    const t = setup();
    await t.run("hi");
    const sent = (last(t).msg as { kind: string; rows: unknown[]; buttonLabel: string });
    expect(sent.kind).toBe("list");
    expect(sent.rows).toHaveLength(4);
    expect(last(t).text).toBe(WELCOME.en);
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

  it("the list follows the customer's language", async () => {
    const t = setup({ language: "hi" });
    await t.run("नमस्ते");
    expect(last(t).text).toBe(WELCOME.hi);
  });

  it.each(MENU_ROWS.map((r) => [r.id, r.state] as const))("tap %s -> state %s, fixed reply, no Claude", async (id, state) => {
    const t = setup({ state: S.IntentMenu });
    await t.run(id);
    expect(t.conv.state).toBe(state);
    expect(t.out).toHaveLength(1);
    expect((last(t).msg as { kind: string }).kind).toBe("text");
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("the whole journey: hi -> list -> each row, from a fresh conversation", async () => {
    for (const row of MENU_ROWS) {
      const t = setup();
      await t.run("hi");
      expect(t.conv.state).toBe(S.IntentMenu);
      await t.run(row.id);
      expect(t.conv.state).toBe(row.state);
      expect(t.out).toHaveLength(2);
    }
  });

  it("a typed row title or number also routes while the menu is open", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("2");
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
    expect(t.out).toHaveLength(1);
  });

  it("safety still wins: an emergency tapped or typed in the menu is not routed as a row", async () => {
    const t = setup({ state: S.IntentMenu });
    await t.run("I have chest pain");
    expect(last(t).text).toBe(fixedReply("emergency", "en"));
    expect(t.conv.state).toBe(S.Pause);
  });
});
