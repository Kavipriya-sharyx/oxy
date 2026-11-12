import { Logger } from "@nestjs/common";
import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { fixedReply, NOTICE_VERSION, ReplyKey } from "@Helper/FixedReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

function setup(opts: { optedOut?: boolean; openBooking?: boolean; language?: string } = {}) {
  const cons = {
    opt_out_at: opts.optedOut ? new Date() : null,
    marketing_consent: true,
    health_data_consent: true, // consent already given: these tests are about the guardrails
    notice_version: NOTICE_VERSION,
    consent_timestamp: new Date(),
  };
  const conv = { id: "v1", state: opts.optedOut ? S.OptedOut : S.Discovery };
  const tasks: Record<string, unknown>[] = [];
  const out: Record<string, unknown>[] = [];
  const outbox: unknown[] = [];

  const send = jest.fn(async (...a: unknown[]) => {
    out.push({ direction: "out", reply_to_wa_message_id: a[3], text: (a[1] as { body: string }).body });
    return "wamid.OUT";
  });
  const claude = { generate: jest.fn() };
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string); // the real state machine
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
  stub(task, "findOne", async (...a) => {
    const w = (a[0] as { where: Record<string, unknown> }).where;
    return tasks.find((t) => t.type === w.type && t.summary === w.summary) ?? null;
  });
  stub(booking_request, "findOne", async () => (opts.openBooking ? { id: "b1" } : null));
  stub(activation, "findOne", async () => null);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    claude as never,
    {} as never,
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async (fn: Fn) => fn(mg) } as never,
    {
      enqueue: jest.fn(async (_m: unknown, action: string) => {
        outbox.push(action);
        return null;
      }),
      dispatch: jest.fn(),
    } as never,
    { transition } as never,
  );
  const saved = { customer: { id: "c1", language: opts.language }, conversation: conv } as never;
  const run = (text: string, wamid = "wamid.IN1") =>
    pipeline.process({ waNumber: "919800000001", waMessageId: wamid, text }, saved);
  return { run, send, claude, conv, cons, tasks, out, outbox };
}

afterEach(() => jest.restoreAllMocks());

describe("guardrail hits through the pipeline", () => {
  const table: [string, ReplyKey, S][] = [
    ["I have chest pain", "emergency", S.Pause],
    ["I want to die", "self_harm", S.Pause],
    ["STOP", "opt_out", S.OptedOut],
    ["I want to talk to a human", "escalation", S.Escalated],
  ];
  it.each(table)("%s -> reply %s, state %s, Claude not called", async (text, key, state) => {
    const t = setup();
    await t.run(text);
    expect(t.out.map((o) => o.text)).toEqual([fixedReply(key, "en")]);
    expect(t.conv.state).toBe(state);
    expect(t.claude.generate).not.toHaveBeenCalled();
  });

  it("uses the customer's language", async () => {
    const t = setup({ language: "hi" });
    await t.run("STOP");
    expect(t.out[0].text).toBe(fixedReply("opt_out", "hi"));
  });

  it("emergency and self-harm: one urgent task, only type + wamid, no message text", async () => {
    const cases: [string, string][] = [
      ["I have chest pain and my left arm hurts", "emergency"],
      ["I want to die", "self_harm"],
    ];
    for (const [text, type] of cases) {
      const t = setup();
      await t.run(text);
      expect(t.tasks).toHaveLength(1);
      expect(t.tasks[0]).toMatchObject({ type, priority: "urgent", summary: "wamid:wamid.IN1" });
      expect(Object.keys(t.tasks[0]).sort()).toEqual(
        ["conversation_id", "customer_id", "priority", "summary", "task_status", "type"],
      );
      expect(String(t.tasks[0].summary)).not.toMatch(/chest|left arm|want to/i);
    }
  });

  it("no health text reaches the logs", async () => {
    const spies = [
      jest.spyOn(Logger.prototype, "warn"),
      jest.spyOn(Logger.prototype, "log"),
      jest.spyOn(Logger.prototype, "error"),
    ];
    const t = setup();
    await t.run("I have chest pain");
    for (const s of spies) expect(JSON.stringify(s.mock.calls).toLowerCase()).not.toContain("chest");
  });

  it("STOP: consent, marketing flag, outbox set_opt_out; no task without an open case", async () => {
    const t = setup();
    await t.run("STOP");
    expect(t.cons.opt_out_at).toBeInstanceOf(Date);
    expect(t.cons.marketing_consent).toBe(false);
    expect(t.outbox).toContain("set_opt_out");
    expect(t.tasks).toHaveLength(0);
  });

  it("booking variant only when an open booking exists, plus a CRM task", async () => {
    const t = setup({ openBooking: true });
    await t.run("STOP");
    expect(t.out[0].text).toBe(fixedReply("opt_out_booking", "en"));
    expect(t.tasks).toHaveLength(1);
    const none = setup();
    await none.run("STOP");
    expect(none.out[0].text).toBe(fixedReply("opt_out", "en"));
  });

  it("STOP chest pain: emergency reply only, one task, one reply, final state opted_out", async () => {
    const t = setup();
    await t.run("STOP chest pain");
    expect(t.out.map((o) => o.text)).toEqual([fixedReply("emergency", "en")]);
    expect(t.tasks).toHaveLength(1);
    expect(t.tasks[0]).toMatchObject({ type: "emergency" });
    expect(t.conv.state).toBe(S.OptedOut);
    expect(t.cons.opt_out_at).toBeInstanceOf(Date);
    expect(t.outbox).toContain("set_opt_out");
  });

  it("'I want to die, stop messaging' -> self-harm reply first", async () => {
    const t = setup();
    await t.run("I want to die, stop messaging");
    expect(t.out.map((o) => o.text)).toEqual([fixedReply("self_harm", "en")]);
    expect(t.conv.state).toBe(S.OptedOut);
  });

  it("already opted out: STOP sends nothing and changes nothing", async () => {
    const t = setup({ optedOut: true });
    await t.run("STOP");
    expect(t.send).not.toHaveBeenCalled();
    expect(t.tasks).toHaveLength(0);
    expect(t.outbox).toHaveLength(0);
    expect(t.conv.state).toBe(S.OptedOut);
  });

  it("already opted out: an emergency still gets the safety reply and a task; state stays opted_out", async () => {
    const t = setup({ optedOut: true });
    await t.run("I have chest pain");
    expect(t.out.map((o) => o.text)).toEqual([fixedReply("emergency", "en")]);
    expect(t.tasks).toHaveLength(1);
    expect(t.conv.state).toBe(S.OptedOut);
  });

  it("talk to a person: escalation task, normal priority", async () => {
    const t = setup();
    await t.run("customer care please");
    expect(t.tasks[0]).toMatchObject({ type: "escalation", priority: "normal" });
  });

  it("repeated wamid: one reply, one task", async () => {
    const t = setup();
    await t.run("I have chest pain", "wamid.SAME");
    await t.run("I have chest pain", "wamid.SAME");
    expect(t.out).toHaveLength(1);
    expect(t.tasks).toHaveLength(1);
  });

  it("a normal message ('bus stop timing') is not a guardrail hit and reaches Claude", async () => {
    const t = setup();
    t.claude.generate.mockRejectedValue(new Error("x"));
    await t.run("bus stop timing").catch(() => undefined);
    expect(t.claude.generate).toHaveBeenCalled();
  });
});
