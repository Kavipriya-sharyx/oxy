// Full Development Plan 12.10: messages are handled strictly in order. A retried or recovered job that
// arrives after a newer message was answered must not be read as the answer to the current question.
import { ChatPipelineService } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { task } from "@Database/Table/Oxxy/task";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { NOTICE_VERSION } from "@Helper/FixedReplies";

type Fn = (...a: unknown[]) => unknown;

function setup(newerAnswered: number) {
  const qb: Record<string, Fn> = {};
  for (const k of ["where", "andWhere"]) qb[k] = () => qb;
  qb.getCount = async () => newerAnswered;
  jest.spyOn(message, "createQueryBuilder").mockReturnValue(qb as never);
  jest.spyOn(message, "findOne").mockResolvedValue(null as never);
  jest.spyOn(message, "find").mockResolvedValue([] as never);
  jest.spyOn(task, "findOne").mockResolvedValue(null as never);
  jest.spyOn(conversation, "update").mockResolvedValue({} as never);
  const update = jest.spyOn(message, "update").mockResolvedValue({} as never);
  jest.spyOn(consent, "findOne").mockResolvedValue({
    opt_out_at: null,
    health_data_consent: true,
    notice_version: NOTICE_VERSION,
    consent_timestamp: new Date(),
  } as never);
  const send = jest.fn(async () => "wamid.OUT");
  const generate = jest.fn();
  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    new ReplyValidatorService(),
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async (fn: Fn) => fn({ save: async (v: unknown) => v, create: (_c: unknown, v: unknown) => v }) } as never,
    { enqueue: async () => null, dispatch: jest.fn() } as never,
    { transition: async () => ({ state: "opted_out" }) } as never,
  );
  const s = {
    customer: { id: "c1", language: "en", active_product: null },
    conversation: { id: "v1", state: "cut_medi_bills_fit", pending_action: "cmb_gate:centre:e1" },
    message: { id: "m-old", conversation_id: "v1", created_on: new Date("2026-11-13T10:00:00Z") },
  } as never;
  const run = (text: string) =>
    pipeline.process({ waNumber: "919800000001", waMessageId: "wamid.OLD", text }, s);
  return { run, send, generate, update };
}

afterEach(() => jest.restoreAllMocks());

describe("strict order (12.10)", () => {
  it("skips an old message once a newer one was answered, and marks it for the team", async () => {
    const t = setup(1);
    await t.run("yes");
    expect(t.send).not.toHaveBeenCalled();
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.update).toHaveBeenCalledWith("m-old", { message_status: "stale" });
  });

  it("still runs the safety reply for an old emergency message", async () => {
    const t = setup(1);
    await t.run("my father has chest pain");
    expect(t.send).toHaveBeenCalledTimes(1);
  });
});
