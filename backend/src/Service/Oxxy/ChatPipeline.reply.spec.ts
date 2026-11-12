import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { task } from "@Database/Table/Oxxy/task";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

// the fake WhatsappClient.send() behaves like the real one: it saves the outbound row
function setup(sendImpl?: Fn) {
  const rows: Record<string, unknown>[] = [];
  const send = jest.fn(
    sendImpl ??
      (async (...a: unknown[]) => {
        rows.push({ direction: "out", reply_to_wa_message_id: a[3], wa_message_id: "wamid.OUT1" });
        return "wamid.OUT1";
      }),
  );
  const transaction = jest.fn(async (fn: (mg: unknown) => unknown) =>
    fn({ save: async (v: unknown) => v, create: (_c: unknown, v: unknown) => v }),
  );

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(consent, "findOne", async () => ({ opt_out_at: null }));
  stub(task, "findOne", async () => null);

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    {} as never,
    {} as never,
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
    { transition: async (_id: unknown, to: unknown) => ({ state: to }) } as never,
  );
  const saved = {
    customer: { id: "c1" },
    conversation: { id: "v1", save: async () => undefined },
  } as never;
  // "chest pain" = emergency guardrail: a fixed reply, no Claude call
  const inbound = { waNumber: "919800000001", waMessageId: "wamid.IN1", text: "I have chest pain" };
  return { rows, send, transaction, pipeline, saved, inbound };
}

afterEach(() => jest.restoreAllMocks());

describe("no double reply", () => {
  it("sends one text reply, tagged with the inbound wamid", async () => {
    const t = setup();
    await t.pipeline.process(t.inbound, t.saved);
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ kind: "text" }),
      "reply",
      "wamid.IN1",
    );
    expect(t.rows).toHaveLength(1);
  });

  it("a retried job for the same inbound message does not send again", async () => {
    const t = setup();
    await t.pipeline.process(t.inbound, t.saved);
    await t.pipeline.process(t.inbound, t.saved); // retry / requeue
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("if a reply already exists, the job does nothing and finishes", async () => {
    const t = setup();
    t.rows.push({ direction: "out", reply_to_wa_message_id: "wamid.IN1" });
    await expect(t.pipeline.process(t.inbound, t.saved)).resolves.toBeUndefined();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.transaction).not.toHaveBeenCalled(); // not even the emergency task is created again
  });

  it("a unique-constraint error while saving the reply is not a failure", async () => {
    const t = setup(async () => {
      throw Object.assign(new Error("dup"), { code: "23505" });
    });
    await expect(t.pipeline.process(t.inbound, t.saved)).resolves.toBeUndefined();
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("a send error (e.g. WhatsApp down) fails the job so it is retried", async () => {
    const t = setup(async () => {
      throw new Error("WhatsApp did not answer");
    });
    await expect(t.pipeline.process(t.inbound, t.saved)).rejects.toThrow("did not answer");
  });

  it("a different inbound message still gets its own reply", async () => {
    const t = setup();
    await t.pipeline.process(t.inbound, t.saved);
    await t.pipeline.process({ ...t.inbound, waMessageId: "wamid.IN2" }, t.saved);
    expect(t.send).toHaveBeenCalledTimes(2);
  });
});
