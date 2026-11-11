import { InboundQueueService, LostMessage } from "./InboundQueue.service";
import { consent } from "@Database/Table/Oxxy/consent";
import { message } from "@Database/Table/Oxxy/message";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

const lost = (wamid: string, customerId = "c1"): LostMessage => ({
  messageId: `m-${wamid}`,
  wamid,
  conversationId: "v1",
  customerId,
});

function setup(lostRows: LostMessage[], jobs: Record<string, string> = {}, optedOut: string[] = []) {
  const remove = jest.fn(async () => undefined);
  const add = jest.fn(async () => undefined);
  const queue = {
    getJob: jest.fn(async (id: string) => (jobs[id] ? { getState: async () => jobs[id], remove } : undefined)),
    add,
  };
  const svc = new InboundQueueService({} as never);
  (svc as unknown as { queue: typeof queue }).queue = queue;
  jest.spyOn(svc, "findLostMessages").mockResolvedValue(lostRows);
  stub(consent, "findOne", async (...a) => {
    const id = (a[0] as { where: { customer_id: string } }).where.customer_id;
    return { opt_out_at: optedOut.includes(id) ? new Date() : null };
  });
  return { svc, add, remove };
}

afterEach(() => jest.restoreAllMocks());

describe("lost-job recovery", () => {
  it("requeues a lost message with jobId = wa_message_id", async () => {
    const t = setup([lost("wamid.1")]);
    expect(await t.svc.recover()).toBe(1);
    expect(t.add).toHaveBeenCalledTimes(1);
    expect(t.add).toHaveBeenCalledWith(
      "inbound",
      { messageId: "m-wamid.1", conversationId: "v1", customerId: "c1" },
      expect.objectContaining({ jobId: "wamid.1", attempts: 3 }),
    );
  });

  it("does not requeue a message that is already waiting, active or delayed", async () => {
    const t = setup([lost("w1"), lost("w2"), lost("w3")], { w1: "waiting", w2: "active", w3: "delayed" });
    expect(await t.svc.recover()).toBe(0);
    expect(t.add).not.toHaveBeenCalled();
    expect(t.remove).not.toHaveBeenCalled();
  });

  it("removes a finished (completed/failed) job first, then adds it again", async () => {
    const t = setup([lost("w1"), lost("w2")], { w1: "completed", w2: "failed" });
    expect(await t.svc.recover()).toBe(2);
    expect(t.remove).toHaveBeenCalledTimes(2);
    expect(t.add).toHaveBeenCalledTimes(2);
  });

  it("never requeues messages of opted-out customers", async () => {
    const t = setup([lost("w1", "c-out"), lost("w2", "c-ok")], {}, ["c-out"]);
    expect(await t.svc.recover()).toBe(1);
    expect(t.add).toHaveBeenCalledTimes(1);
    expect(t.add).toHaveBeenCalledWith("inbound", expect.objectContaining({ customerId: "c-ok" }), expect.anything());
  });

  it("one failing message does not stop the others", async () => {
    const t = setup([lost("w1"), lost("w2")]);
    t.add.mockRejectedValueOnce(new Error("redis down"));
    expect(await t.svc.recover()).toBe(1);
    expect(t.add).toHaveBeenCalledTimes(2);
  });

  it("the query asks for: inbound, received, older than 1 minute, no outbound reply", async () => {
    const parts: string[] = [];
    const qb: Record<string, unknown> = {};
    for (const k of ["innerJoin", "select", "addSelect", "where", "andWhere", "orderBy", "limit"])
      qb[k] = (...a: unknown[]) => (parts.push(a.map(String).join(" ")), qb);
    qb.getRawMany = async () => [];
    stub(message, "createQueryBuilder", () => qb);
    const svc = new InboundQueueService({} as never);
    await svc.findLostMessages();
    const sql = parts.join("\n");
    expect(sql).toContain("m.direction = 'in'");
    expect(sql).toContain("m.message_status = 'received'");
    expect(sql).toContain("interval '1 minute'");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("reply_to_wa_message_id = m.wa_message_id");
  });
});
