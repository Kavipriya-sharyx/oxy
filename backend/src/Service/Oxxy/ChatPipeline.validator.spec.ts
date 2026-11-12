import { Logger } from "@nestjs/common";
import { ChatPipelineService, HOLDING_MESSAGE } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NEUTRAL_SAVINGS_LINE, NOTICE_VERSION } from "@Helper/FixedReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const catalog = [
  { plan: "vital", product: "oxxy", price: 1999, gst_rate: 0.18 },
  { plan: "cut_medi_bills", product: "cut_medi_bills", price: 999, gst_rate: 0.18 },
];

const draft = (reply_text: string, extra: Record<string, unknown> = {}) => ({
  reply_text,
  intent: "other",
  extracted_fields: {},
  needs_human: false,
  ...extra,
});

function setup(drafts: unknown[], opts: { activeProduct?: string | null; recommend?: boolean } = {}) {
  const cons = {
    opt_out_at: null,
    health_data_consent: true,
    notice_version: NOTICE_VERSION,
    consent_timestamp: new Date(),
  };
  const conv = { id: "v1", state: S.Discovery, selected_product: null as string | null };
  const out: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const send = jest.fn(async (...a: unknown[]) => {
    out.push({ direction: "out", reply_to_wa_message_id: a[3], text: (a[1] as { body: string }).body });
    return "wamid.OUT";
  });
  const generate = jest.fn();
  for (const d of drafts) generate.mockResolvedValueOnce(d);
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string);
    conv.state = to as S;
    return conv;
  });
  const mg = {
    save: jest.fn(async (v: Record<string, unknown>) => {
      if ("type" in v) tasks.push(v);
      return v;
    }),
    create: (_c: unknown, v: unknown) => v,
  };

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return out.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(message, "find", async () => []);
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async () => undefined);
  stub(task, "findOne", async () => null);
  stub(booking_request, "findOne", async () => null);
  stub(activation, "findOne", async () => null);
  stub(plan_catalog, "find", async () => catalog);
  jest.spyOn(need, "findOne").mockResolvedValue(null as never);
  jest.spyOn(need, "create").mockImplementation(((v: object) => ({ ...v, save: async () => undefined })) as never);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    new ReplyValidatorService(), // the real validator
    { send } as never,
    { recommend: async () => (opts.recommend ? { plan: "vital", price: 1999 } : null) } as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
    { transition } as never,
  );
  const saved = {
    customer: { id: "c1", language: "en", active_product: opts.activeProduct ?? null, age: 40, save: async () => undefined },
    conversation: conv,
  } as never;
  const run = (text = "tell me about plans") =>
    pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.IN1", text }, saved);
  return { run, send, generate, out, tasks };
}

afterEach(() => jest.restoreAllMocks());

describe("a failed draft is replaced by the fixed template and logged", () => {
  const badDrafts: [string, string, string | undefined][] = [
    ["an unknown plan name", "The Platinum plan is perfect for you.", undefined],
    ["a price that is not in the catalog", "Vital costs ₹1,500 a year.", undefined],
    ["the word insurance", "It works like health insurance.", undefined],
    ["a saving promise", "You will save 30% every year.", undefined],
    ["a second product", "Cut Medi Bills is also available.", "oxxy"],
  ];

  it.each(badDrafts)("%s: nothing is sent but the holding message, a task is opened, the reason is logged", async (_n, text, active) => {
    const warn = jest.spyOn(Logger.prototype, "warn");
    const t = setup([draft(text), draft(text)], { activeProduct: active });
    await t.run();
    expect(t.out.map((o) => o.text)).toEqual([HOLDING_MESSAGE]);
    expect(t.generate).toHaveBeenCalledTimes(2); // one retry with the reasons, then the fixed template
    expect(t.tasks.map((x) => x.type)).toContain("holding_message");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toMatch(/draft rejected/);
    expect(logged).toMatch(/replaced by the fixed holding message/);
    expect(logged).not.toContain(text); // the reasons are logged, never the draft text
  });

  it("a bad first draft that is fixed on the retry is sent (and the first one is logged)", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn");
    const t = setup([draft("The Platinum plan is perfect."), draft("The Vital plan is a good fit.")]);
    await t.run();
    expect(t.out.map((o) => o.text)).toEqual(["The Vital plan is a good fit."]);
    expect(JSON.stringify(warn.mock.calls)).toMatch(/plan name not in catalog: platinum/);
  });

  it("a clean draft goes out unchanged", async () => {
    const t = setup([draft("The Vital plan is a good fit. Which city are you in?")]);
    await t.run();
    expect(t.out.map((o) => o.text)).toEqual(["The Vital plan is a good fit. Which city are you in?"]);
  });

  it("a plan suggestion carries the system's price and the neutral savings line, never a promise", async () => {
    const t = setup(
      [draft("Based on what you shared, here is a suggestion.", { intent: "recommend", extracted_fields: { annual_medical_spend: 90000 } })],
      { recommend: true },
    );
    await t.run("recommend a plan");
    const text = String(t.out[0].text);
    expect(text).toContain("VITAL");
    expect(text).toContain("1999");
    expect(text).toContain(NEUTRAL_SAVINGS_LINE.en);
  });
});
