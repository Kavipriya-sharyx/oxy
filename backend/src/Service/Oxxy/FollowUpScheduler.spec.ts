import { FollowUpSchedulerService } from "./FollowUpScheduler.service";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { activation } from "@Database/Table/Oxxy/activation";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";

const job = {
  customerId: "c1",
  conversationId: "v1",
  kind: "trigger_q" as const,
  templateName: "activation_reminder",
};

function setup(o: { triggers?: string[]; unpaid?: boolean; active?: string | null; hourUtc?: number } = {}) {
  jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 10, 13, o.hourUtc ?? 6, 0, 0))); // 06:00 UTC = 11:30 IST
  jest.spyOn(consent, "findOne").mockResolvedValue({} as never);
  jest.spyOn(conversation, "findOne").mockResolvedValue({ id: "v1", state: "follow_up", rescue_count: 0 } as never);
  jest.spyOn(customer, "findOne").mockResolvedValue({ id: "c1", active_product: o.active ?? null } as never);
  jest.spyOn(activation, "findOne").mockResolvedValue((o.unpaid === false ? null : { id: "a1" }) as never);
  jest
    .spyOn(trigger_event, "findOne")
    .mockImplementation((async (q: any) => ((o.triggers ?? []).includes(q.where.trigger_id) ? { id: "t" } : null)) as never);
  const save = jest.spyOn(trigger_event, "save").mockResolvedValue({} as never);
  jest.spyOn(trigger_event, "create").mockImplementation(((x: unknown) => x) as never);
  const wa = { send: jest.fn().mockResolvedValue("wamid") };
  const svc = new FollowUpSchedulerService(wa as never);
  const schedule = jest.spyOn(svc, "schedule").mockResolvedValue();
  return { svc, wa, save, schedule };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Trigger Q reminder (plan 12.5 / 12.8)", () => {
  it("sends once while the link is unpaid and records Q", async () => {
    const { svc, wa, save } = setup();
    await svc.execute(job);
    expect(wa.send).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ trigger_id: "Q" }));
  });

  it.each([
    ["already reminded", { triggers: ["Q"] }],
    ["customer said DONE", { triggers: ["P"] }],
    ["link no longer unpaid", { unpaid: false }],
    ["a product is active", { active: "oxxy" }],
  ])("skips when %s", async (_n, o) => {
    const { svc, wa } = setup(o as never);
    await svc.execute(job);
    expect(wa.send).not.toHaveBeenCalled();
  });

  it("moves a quiet-hours send to the next morning instead of dropping it", async () => {
    const { svc, wa, schedule } = setup({ hourUtc: 17 }); // 22:30 IST
    await svc.execute(job);
    expect(wa.send).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

describe("conversation rescue (Playbook 15: at most two in a row)", () => {
  const rescue = { customerId: "c1", conversationId: "v1", kind: "rescue" as const, templateName: "conversation_rescue_1" };
  it("after the first rescue the second is scheduled; after the second, nothing more", async () => {
    const { svc, wa } = setup();
    const upd = jest.spyOn(conversation, "update").mockResolvedValue({} as never);
    const create = jest.spyOn(svc, "create").mockResolvedValue({} as never);
    await svc.execute(rescue);
    expect(wa.send).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "conversation_rescue_1" }), "proactive");
    expect(upd).toHaveBeenCalledWith("v1", { rescue_count: 1 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: "rescue", templateName: "conversation_rescue_2" }));

    jest.spyOn(conversation, "findOne").mockResolvedValue({ id: "v1", state: "discovery", rescue_count: 1 } as never);
    create.mockClear();
    await svc.execute({ ...rescue, templateName: "conversation_rescue_2" });
    expect(upd).toHaveBeenCalledWith("v1", { rescue_count: 2 });
    expect(create).not.toHaveBeenCalled();
  });
  it("a third is never sent", async () => {
    const { svc, wa } = setup();
    jest.spyOn(conversation, "findOne").mockResolvedValue({ id: "v1", state: "discovery", rescue_count: 2 } as never);
    await svc.execute(rescue);
    expect(wa.send).not.toHaveBeenCalled();
  });
});
