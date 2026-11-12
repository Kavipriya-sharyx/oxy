import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { FIXED_REPLIES } from "@Helper/FixedReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

function setup(opts: { optedOut?: boolean; openBooking?: boolean; language?: string; state?: S } = {}) {
  const cons = { opt_out_at: opts.optedOut ? new Date() : null, marketing_consent: true } as Record<string, unknown>;
  const replies: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  const states: string[] = [];
  const outbox: unknown[] = [];

  const send = jest.fn(async (...a: unknown[]) => {
    replies.push({ direction: "out", reply_to_wa_message_id: a[3], body: (a[1] as { body: string }).body });
    return "wamid.OUT";
  });
  const mg = {
    save: jest.fn(async (v: Record<string, unknown>) => {
      if ("type" in v && "priority" in v) tasks.push({ ...v, id: `t${tasks.length + 1}` });
      return v;
    }),
    create: (_c: unknown, v: unknown) => v,
  };
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    states.push(to as string);
    return { state: to };
  });
  const claude = { generate: jest.fn() };

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return replies.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(message, "find", async () => {
    throw new Error("context must not be loaded on a guardrail hit");
  });
  stub(consent, "findOne", async () => cons);
  stub(task, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return tasks.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
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
    { transaction: async (fn: (m: typeof mg) => unknown) => fn(mg) } as never,
    {
      enqueue: jest.fn(async (_m: unknown, action: unknown) => {
        outbox.push(action);
        return null;
      }),
      dispatch: jest.fn(),
    } as never,
    { transition } as never,
  );
  const saved = {
    customer: { id: "c1", language: opts.language ?? "en" },
    conversation: { id: "v1", state: opts.state ?? S.Discovery },
  } as never;
  const run = (text: string, wamid = "wamid.IN1") =>
    pipeline.process({ waNumber: "919800000001", waMessageId: wamid, text }, saved);
  return { run, send, replies, tasks, states, cons, claude, outbox };
}

afterEach(() => jest.restoreAllMocks());

describe("guardrail turns", () => {
  it.each([
    ["I have chest pain", "emergency", S.Pause, "emergency", "urgent"],
    ["I want to die", "self_harm", S.Pause, "self_harm", "urgent"],
    ["I want to talk to a human", "escalation", S.Escalated, "escalation", "normal"],
  ])("%s -> reply %s, state %s, one task", async (text, key, state, taskType, priority) => {
    const t = setup();
    await t.run(text);
    expect(t.replies.map((r) => r.body)).toEqual([FIXED_REPLIES[key as "emergency"].en]);
    expect(t.states).toEqual([state]);
    expect(t.tasks).toHaveLength(1);
    expect(t.tasks[0]).toMatchObject({ type: taskType, priority });
    expect(t.claude.generate).not.toHaveBeenCalled();
  });

  it("STOP: opt-out reply, opt-out saved, marketing off, CRM set_opt_out queued, state OPTED_OUT, no task", async () => {
    const t = setup();
    await t.run("STOP");
    expect(t.replies.map((r) => r.body)).toEqual([FIXED_REPLIES.opt_out.en]);
    expect(t.states).toEqual([S.OptedOut]);
    expect(t.cons.opt_out_at).toBeInstanceOf(Date);
    expect(t.cons.marketing_consent).toBe(false);
    expect(t.outbox).toEqual(["set_opt_out"]);
    expect(t.tasks).toHaveLength(0);
    expect(t.claude.generate).not.toHaveBeenCalled();
  });

  it("STOP with an open booking: booking variant and one CRM task", async () => {
    const t = setup({ openBooking: true });
    await t.run("STOP");
    expect(t.replies[0].body).toBe(FIXED_REPLIES.opt_out_booking.en);
    expect(t.tasks).toHaveLength(1);
  });

  it("reply language follows customer.language", async () => {
    const t = setup({ language: "hi" });
    await t.run("STOP");
    expect(t.replies[0].body).toBe(FIXED_REPLIES.opt_out.hi);
  });

  it("'STOP chest pain': emergency reply only, one task, PAUSE then OPTED_OUT, opt-out recorded", async () => {
    const t = setup();
    await t.run("STOP chest pain");
    expect(t.replies.map((r) => r.body)).toEqual([FIXED_REPLIES.emergency.en]);
    expect(t.tasks).toHaveLength(1);
    expect(t.states).toEqual([S.Pause, S.OptedOut]);
    expect(t.cons.opt_out_at).toBeInstanceOf(Date);
    expect(t.outbox).toEqual(["create_task", "set_opt_out"]);
  });

  it("'I want to die, stop messaging': self-harm reply first", async () => {
    const t = setup();
    await t.run("I want to die, stop messaging");
    expect(t.replies.map((r) => r.body)).toEqual([FIXED_REPLIES.self_harm.en]);
    expect(t.states).toEqual([S.Pause, S.OptedOut]);
  });

  it("already opted out: STOP sends nothing and changes nothing", async () => {
    const t = setup({ optedOut: true });
    await t.run("STOP");
    expect(t.send).not.toHaveBeenCalled();
    expect(t.states).toEqual([]);
    expect(t.tasks).toHaveLength(0);
    expect(t.outbox).toEqual([]);
  });

  it("already opted out: talk to a person sends nothing", async () => {
    const t = setup({ optedOut: true });
    await t.run("talk to a person");
    expect(t.send).not.toHaveBeenCalled();
    expect(t.tasks).toHaveLength(0);
  });

  it("already opted out: emergency still gets the safety reply and a task, state unchanged", async () => {
    const t = setup({ optedOut: true });
    await t.run("I have chest pain");
    expect(t.replies.map((r) => r.body)).toEqual([FIXED_REPLIES.emergency.en]);
    expect(t.tasks).toHaveLength(1);
    expect(t.states).toEqual([]);
  });

  it("the task holds only type, priority and the wamid: no message text", async () => {
    const t = setup();
    await t.run("I have chest pain since morning, my heart attack history");
    expect(JSON.stringify(t.tasks)).not.toMatch(/chest|heart|morning|pain/i);
    expect(t.tasks[0].summary).toBe("wamid:wamid.IN1");
  });

  it("no health text in the logs", async () => {
    const spies = ["log", "warn", "error", "debug"].map((m) =>
      jest.spyOn(console, m as "log").mockImplementation(() => undefined),
    );
    const t = setup();
    await t.run("I have chest pain");
    expect(JSON.stringify(spies.map((s) => s.mock.calls))).not.toMatch(/chest|pain/i);
  });

  it("the same wamid twice: one reply, one task", async () => {
    const t = setup();
    await t.run("I have chest pain");
    await t.run("I have chest pain");
    expect(t.replies).toHaveLength(1);
    expect(t.tasks).toHaveLength(1);
  });

  it("a retry after a failed send creates no second task", async () => {
    const t = setup();
    t.send.mockRejectedValueOnce(new Error("WhatsApp did not answer"));
    await expect(t.run("I have chest pain")).rejects.toThrow();
    await t.run("I have chest pain");
    expect(t.replies).toHaveLength(1);
    expect(t.tasks).toHaveLength(1);
  });
});
