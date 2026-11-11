import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { InvalidTransitionError } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

function setup(opts: { transition?: Fn; claude?: object } = {}) {
  const cons = { opt_out_at: null as Date | null, save: jest.fn() };
  const mg = { save: jest.fn(async (v: unknown) => v), create: (_c: unknown, v: unknown) => v };
  const transaction = jest.fn(async (fn: (m: typeof mg) => unknown) => fn(mg));
  const transition = jest.fn(
    opts.transition ?? (async (_id: unknown, to: unknown) => ({ state: to })),
  );
  const send = jest.fn(async () => "wamid.OUT");

  stub(message, "findOne", async () => null);
  stub(message, "find", async () => []);
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async () => undefined);
  stub(need, "findOne", async () => null);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    (opts.claude ?? {}) as never,
    { validate: async () => ({ ok: true, reasons: [] }) } as never,
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
    { transition } as never,
  );
  const saved = {
    customer: { id: "c1", save: async () => undefined },
    conversation: { id: "v1", state: S.New },
  } as never;
  return { pipeline, saved, transition, transaction, send, cons, mg };
}

afterEach(() => jest.restoreAllMocks());

describe("the pipeline changes state only through ConversationRepository", () => {
  it("STOP: opt-out and OPTED_OUT happen in one transaction, and no reply is sent", async () => {
    const t = setup();
    await t.pipeline.process(
      { waNumber: "919800000001", waMessageId: "wamid.IN1", text: "STOP" },
      t.saved,
    );
    expect(t.transition).toHaveBeenCalledWith(
      "v1",
      S.OptedOut,
      expect.objectContaining({ reason: "stop", manager: t.mg }),
    );
    expect(t.cons.opt_out_at).toBeInstanceOf(Date);
    expect(t.mg.save).toHaveBeenCalledWith(t.cons);
    expect(t.send).not.toHaveBeenCalled();
  });

  it("STOP still works when the state machine refuses the change", async () => {
    const t = setup({
      transition: async () => {
        throw new InvalidTransitionError("closed", "opted_out");
      },
    });
    await expect(
      t.pipeline.process(
        { waNumber: "919800000001", waMessageId: "wamid.IN1", text: "STOP" },
        t.saved,
      ),
    ).resolves.toBeUndefined();
    expect(t.mg.save).toHaveBeenCalledWith(t.cons); // the opt-out is saved anyway
  });

  it("the first message moves NEW -> DISCOVERY", async () => {
    const claude = {
      generate: async () => ({
        reply_text: "Hello! How can I help?",
        intent: "greeting",
        extracted_fields: {},
        needs_human: false,
      }),
    };
    const t = setup({ claude });
    await t.pipeline.process(
      { waNumber: "919800000001", waMessageId: "wamid.IN2", text: "hi" },
      t.saved,
    );
    expect(t.transition).toHaveBeenCalledWith("v1", S.Discovery);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("needs_human moves to ESCALATED", async () => {
    const claude = {
      generate: async () => ({
        reply_text: "A colleague will help you.",
        intent: "other",
        extracted_fields: {},
        needs_human: true,
      }),
    };
    const t = setup({ claude });
    await t.pipeline.process(
      { waNumber: "919800000001", waMessageId: "wamid.IN3", text: "I need a person" },
      t.saved,
    );
    expect(t.transition).toHaveBeenCalledWith("v1", S.Escalated);
  });

  it("a change the machine refuses is skipped, not forced, and the reply still goes out", async () => {
    const claude = {
      generate: async () => ({
        reply_text: "A colleague will help you.",
        intent: "other",
        extracted_fields: {},
        needs_human: true,
      }),
    };
    const t = setup({
      claude,
      transition: async (_id: unknown, to: unknown) => {
        if (to === S.Escalated) throw new InvalidTransitionError("closed", "escalated");
        return { state: to };
      },
    });
    await expect(
      t.pipeline.process(
        { waNumber: "919800000001", waMessageId: "wamid.IN4", text: "person please" },
        t.saved,
      ),
    ).resolves.toBeUndefined();
    expect(t.send).toHaveBeenCalledTimes(1);
  });
});
