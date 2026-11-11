import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

function setup(saveImpl?: Fn) {
  const rows: Record<string, unknown>[] = [];
  const sendText = jest.fn(async () => "wamid.OUT1");
  const transaction = jest.fn(async (fn: (mg: unknown) => unknown) =>
    fn({ save: async (v: unknown) => v, create: (_c: unknown, v: unknown) => v }),
  );

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  });
  stub(message, "create", (v) => v);
  stub(message, "save", saveImpl ?? (async (v) => (rows.push(v as Record<string, unknown>), v)));
  stub(consent, "findOne", async () => ({ opt_out_at: null }));

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    {} as never,
    {} as never,
    { sendText } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction } as never,
    { enqueue: jest.fn(async () => null), dispatch: jest.fn() } as never,
  );
  const saved = {
    customer: { id: "c1" },
    conversation: { id: "v1", save: async () => undefined },
  } as never;
  // "chest pain" = emergency guardrail: a fixed reply, no Claude call
  const inbound = { waNumber: "919800000001", waMessageId: "wamid.IN1", text: "I have chest pain" };
  return { rows, sendText, transaction, pipeline, saved, inbound };
}

afterEach(() => jest.restoreAllMocks());

describe("no double reply", () => {
  it("sends once and stores the outbound row tagged with the inbound wamid", async () => {
    const t = setup();
    await t.pipeline.process(t.inbound, t.saved);
    expect(t.sendText).toHaveBeenCalledTimes(1);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({
      direction: "out",
      wa_message_id: "wamid.OUT1",
      reply_to_wa_message_id: "wamid.IN1",
    });
  });

  it("a retried job for the same inbound message does not send again", async () => {
    const t = setup();
    await t.pipeline.process(t.inbound, t.saved);
    await t.pipeline.process(t.inbound, t.saved); // retry / requeue
    expect(t.sendText).toHaveBeenCalledTimes(1);
    expect(t.rows).toHaveLength(1);
  });

  it("if a reply already exists, the job does nothing and finishes", async () => {
    const t = setup();
    t.rows.push({ direction: "out", reply_to_wa_message_id: "wamid.IN1" });
    await expect(t.pipeline.process(t.inbound, t.saved)).resolves.toBeUndefined();
    expect(t.sendText).not.toHaveBeenCalled();
    expect(t.transaction).not.toHaveBeenCalled(); // not even the emergency task is created again
  });

  it("a unique-constraint error while saving the reply is not a failure", async () => {
    const t = setup(async () => {
      throw Object.assign(new Error("dup"), { code: "23505" });
    });
    await expect(t.pipeline.process(t.inbound, t.saved)).resolves.toBeUndefined();
    expect(t.sendText).toHaveBeenCalledTimes(1);
  });

  it("a different inbound message still gets its own reply", async () => {
    const t = setup();
    await t.pipeline.process(t.inbound, t.saved);
    await t.pipeline.process({ ...t.inbound, waMessageId: "wamid.IN2" }, t.saved);
    expect(t.sendText).toHaveBeenCalledTimes(2);
  });
});
