import { ChatPipelineService, HOLDING_MESSAGE } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { fixedReply, NOTICE_VERSION } from "@Helper/FixedReplies";
import { WELCOME } from "@Helper/OpeningMenu";
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

interface ConsentRow {
  opt_out_at: Date | null;
  whatsapp_consent: boolean;
  health_data_consent: boolean;
  notice_version: string | null;
  consent_timestamp: Date | null;
  consent_source: string | null;
  health_refused_at: Date | null;
  health_refused_version: string | null;
  notice_sent_at: Date | null;
  notice_sent_version: string | null;
}

const emptyConsent = (): ConsentRow => ({
  opt_out_at: null,
  whatsapp_consent: false,
  health_data_consent: false,
  notice_version: null,
  consent_timestamp: null,
  consent_source: null,
  health_refused_at: null,
  health_refused_version: null,
  notice_sent_at: null,
  notice_sent_version: null,
});

const draft = (reply_text: string, extracted_fields: Record<string, unknown> = {}, intent = "other") => ({
  reply_text,
  intent,
  extracted_fields,
  needs_human: false,
});

function setup(
  opts: { cons?: Partial<ConsentRow>; saveFails?: boolean; language?: string; claude?: Fn; state?: S } = {},
) {
  const cons: ConsentRow = { ...emptyConsent(), ...opts.cons };
  const conv = { id: "v1", state: opts.state ?? S.New };
  const out: Record<string, unknown>[] = [];
  const customerSaved: Record<string, unknown>[] = [];
  const needSaves: Record<string, unknown>[] = [];

  const send = jest.fn(async (...a: unknown[]) => {
    out.push({ direction: "out", reply_to_wa_message_id: a[3], text: (a[1] as { body: string }).body });
    return "wamid.OUT";
  });
  const generate = jest.fn(opts.claude ?? (async () => draft("Hello! How can I help?")));
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string); // the real state machine
    conv.state = to as S;
    return conv;
  });
  const mg = {
    save: jest.fn(async (v: unknown) => {
      if (opts.saveFails) throw new Error("db down");
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
  const saved = {
    customer: {
      id: "c1",
      language: opts.language,
      save: async () => undefined,
      first_name: null,
    },
    conversation: conv,
  } as never;
  let n = 0;
  const run = (text: string, wamid = `wamid.IN${++n}`) =>
    pipeline.process({ waNumber: "919800000001", waMessageId: wamid, text }, saved);
  void customerSaved;
  void needSaves;
  return { run, send, generate, cons, out, conv, mg };
}

const texts = (t: { out: Record<string, unknown>[] }) => t.out.map((o) => o.text);

afterEach(() => jest.restoreAllMocks());

describe("DPDP health-data consent gate", () => {
  it("1. a new customer gets the notice first, and nothing else in that turn", async () => {
    const t = setup();
    await t.run("hi");
    expect(texts(t)).toEqual([fixedReply("health_notice", "en")]);
    expect(t.cons.notice_sent_version).toBe(NOTICE_VERSION);
    expect(t.cons.notice_sent_at).toBeInstanceOf(Date);
    expect(t.cons.health_data_consent).toBe(false);
  });

  it("1b. the notice follows the customer's language", async () => {
    const t = setup({ language: "hinglish" });
    await t.run("hello");
    expect(texts(t)).toEqual([fixedReply("health_notice", "hinglish")]);
  });

  it("2. a health question before consent: notice only, Claude is never called", async () => {
    const t = setup();
    await t.run("I need a knee surgery, what will it cost, my yearly medical spend is high");
    expect(texts(t)).toEqual([fixedReply("health_notice", "en")]);
    expect(t.generate).not.toHaveBeenCalled();
    // and again while the notice is still unanswered
    await t.run("I have diabetes, which plan is good?");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.cons.health_data_consent).toBe(false);
  });

  it("3-5. YES saves consent = true, the current notice version, the timestamp and the wamid", async () => {
    const t = setup();
    await t.run("hi");
    await t.run("YES", "wamid.YES1");
    expect(t.cons.health_data_consent).toBe(true);
    expect(t.cons.notice_version).toBe(NOTICE_VERSION);
    expect(t.cons.consent_timestamp).toBeInstanceOf(Date);
    expect(t.cons.consent_source).toBe("wamid.YES1");
    // thanks + welcome + the 4-row opening list, in one message; still no health question
    expect(texts(t)[1]).toBe(`${fixedReply("health_consent_yes", "en")} ${WELCOME.en}`);
    expect(t.generate).not.toHaveBeenCalled(); // the YES turn itself asks no health question
  });

  it("YES is saved before any reply: if saving fails, nothing is sent and Claude is not called (fail closed)", async () => {
    const t = setup({ cons: { notice_sent_at: new Date(), notice_sent_version: NOTICE_VERSION } });
    t.mg.save.mockRejectedValue(new Error("db down"));
    await expect(t.run("yes")).rejects.toThrow("db down");
    expect(t.send).not.toHaveBeenCalled();
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("after YES, the next message reaches Claude and health questions are allowed", async () => {
    const t = setup();
    await t.run("hi");
    await t.run("yes");
    await t.run("I need help for my mother's knee");
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(t.generate.mock.calls[0][1] as string).health_questions_allowed).toBe(true);
  });

  it("6-7. NO saves the refusal and the closing message offers non-health help only", async () => {
    const t = setup();
    await t.run("hi");
    await t.run("No", "wamid.NO1");
    expect(t.cons.health_data_consent).toBe(false);
    expect(t.cons.health_refused_at).toBeInstanceOf(Date);
    expect(t.cons.health_refused_version).toBe(NOTICE_VERSION);
    expect(texts(t)[1]).toBe(fixedReply("health_consent_no", "en"));
    expect(t.generate).not.toHaveBeenCalled();
    // the notice is NOT asked again in the same conversation
    await t.run("what plans do you have?");
    expect(texts(t).filter((x) => x === fixedReply("health_notice", "en"))).toHaveLength(1);
  });

  it("7. after refusal, a reply that asks a health question is never sent", async () => {
    const t = setup({
      cons: { health_refused_at: new Date(), health_refused_version: NOTICE_VERSION },
      claude: async () => draft("Sure! What medical condition do you have?"),
    });
    await t.run("tell me about plans");
    expect(t.generate).toHaveBeenCalled();
    expect(texts(t).join(" ")).not.toMatch(/medical condition/);
    expect(texts(t)).toEqual([HOLDING_MESSAGE]); // the team is told instead (holding message)
  });

  it("7b. after refusal, a non-health reply goes out and Claude is told health questions are off", async () => {
    const t = setup({
      cons: { health_refused_at: new Date(), health_refused_version: NOTICE_VERSION },
      claude: async () => draft("We have a few plans. Which city are you in?"),
    });
    await t.run("what plans do you have?");
    expect(texts(t)).toEqual(["We have a few plans. Which city are you in?"]);
    expect(JSON.parse(t.generate.mock.calls[0][1] as string).health_questions_allowed).toBe(false);
  });

  it("8. unclear answers repeat the YES/NO question and never ask for health information", async () => {
    const t = setup();
    await t.run("hi");
    for (const msg of ["maybe", "ok", "what is this?", "I have a heart problem"]) await t.run(msg);
    expect(texts(t).slice(1)).toEqual(Array(4).fill(fixedReply("health_consent_unclear", "en")));
    expect(t.cons.health_data_consent).toBe(false);
    expect(t.cons.health_refused_at).toBeNull();
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("9. a changed notice version needs fresh consent: old consent is not valid", async () => {
    const t = setup({
      cons: { health_data_consent: true, notice_version: "dpdp-health-v0", consent_timestamp: new Date() },
    });
    await t.run("I need help for my knee");
    expect(texts(t)).toEqual([fixedReply("health_notice", "en")]);
    expect(t.generate).not.toHaveBeenCalled();
    await t.run("yes"); // fresh consent under the current version
    expect(t.cons.notice_version).toBe(NOTICE_VERSION);
    expect(t.cons.health_data_consent).toBe(true);
  });

  it("9b. a refusal made under an old version is asked again", async () => {
    const t = setup({ cons: { health_refused_at: new Date(), health_refused_version: "dpdp-health-v0" } });
    await t.run("hello");
    expect(texts(t)).toEqual([fixedReply("health_notice", "en")]);
  });

  it("10. existing valid consent (current version) lets the conversation reach Claude", async () => {
    const t = setup({
      cons: { health_data_consent: true, notice_version: NOTICE_VERSION, consent_timestamp: new Date() },
      state: S.Discovery, // past the opening list
    });
    await t.run("hi");
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(texts(t)).toEqual(["Hello! How can I help?"]);
  });

  it("11. Claude cannot override a refusal: its consent field is ignored, health fields are dropped", async () => {
    const t = setup({
      cons: { health_refused_at: new Date(), health_refused_version: NOTICE_VERSION },
      claude: async () =>
        draft("Great, let me help with plans.", {
          health_data_consent: true,
          healthcare_need: "knee surgery",
          annual_medical_spend: 90000,
          city: "Pune",
        }, "recommend"),
    });
    const created: Record<string, unknown>[] = [];
    jest.spyOn(need, "create").mockImplementation(((v: object) => {
      const o = { ...v, save: async () => undefined };
      created.push(o);
      return o;
    }) as never);
    await t.run("recommend a plan");
    expect(t.cons.health_data_consent).toBe(false);
    expect(t.cons.health_refused_at).toBeInstanceOf(Date);
    const stored = JSON.stringify(created);
    expect(stored).toContain("Pune"); // non-health data is still kept
    expect(stored).not.toMatch(/knee|90000|annual_medical_spend|healthcare_need/);
  });

  it("11b. Claude's output cannot grant consent for a customer who never answered", async () => {
    const t = setup({
      claude: async () => draft("ok", { health_data_consent: true }),
    });
    await t.run("hi");
    await t.run("hello again");
    expect(t.cons.health_data_consent).toBe(false);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("12. repeated messages do not get past the gate", async () => {
    const t = setup();
    await t.run("hi", "wamid.A");
    await t.run("hi", "wamid.A"); // same message delivered twice: still one reply
    expect(texts(t)).toEqual([fixedReply("health_notice", "en")]);
    await t.run("hi", "wamid.B");
    await t.run("hi", "wamid.C");
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.cons.health_data_consent).toBe(false);
  });

  it("silence or an unrelated message is never read as YES", async () => {
    const t = setup({ cons: { notice_sent_at: new Date(), notice_sent_version: NOTICE_VERSION } });
    await t.run("what is the price of the Vital plan?");
    expect(t.cons.health_data_consent).toBe(false);
    expect(texts(t)).toEqual([fixedReply("health_consent_unclear", "en")]);
  });

  it("a refusing customer can still ask for a human", async () => {
    const t = setup({ cons: { health_refused_at: new Date(), health_refused_version: NOTICE_VERSION } });
    t.conv.state = S.Discovery;
    jest.spyOn(task, "findOne").mockResolvedValue(null as never);
    await t.run("I want to talk to a human");
    expect(texts(t)).toEqual([fixedReply("escalation", "en")]);
    expect(t.conv.state).toBe(S.Escalated);
  });
});
