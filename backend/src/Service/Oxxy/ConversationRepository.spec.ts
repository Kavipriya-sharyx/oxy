import {
  ConcurrentTransitionError,
  ConversationRepository,
} from "./ConversationRepository.service";
import { InvalidTransitionError } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { consent } from "@Database/Table/Oxxy/consent";

type QB = {
  update: () => QB;
  set: (v: Record<string, unknown>) => QB;
  where: (s: string, p: { id: string; from: string }) => QB;
  execute: () => Promise<{ affected: number }>;
};

function setup(initial: Partial<conversation> = {}, opts: { conflict?: boolean } = {}) {
  const conv = {
    id: "v1",
    customer_id: "c1",
    state: S.Discovery,
    resume_state: null,
    closed_at: null,
    ...initial,
  } as conversation;
  const writes: { set: Record<string, unknown>; from: string }[] = [];
  const calls = { update: jest.fn(), save: jest.fn(), create: jest.fn() };

  const manager = {
    findOne: jest.fn(async () => conv),
    createQueryBuilder: () => {
      let set: Record<string, unknown> = {};
      let from = "";
      const qb: QB = {
        update: () => qb,
        set: (v) => ((set = v), qb),
        where: (_s, p) => ((from = p.from), qb),
        // compare-and-set: nothing is written if the stored state is not the one we read
        execute: async () => {
          if (opts.conflict || conv.state !== from) return { affected: 0 };
          writes.push({ set, from });
          return { affected: 1 };
        },
      };
      return qb;
    },
    update: calls.update,
    create: calls.create.mockImplementation((_e: unknown, v: unknown) => v),
    save: calls.save.mockImplementation(async (v: unknown) => v),
  };
  const ds = {
    manager,
    transaction: async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager),
  };
  const repo = new ConversationRepository(ds as never);
  return { repo, conv, writes, manager, calls };
}

describe("ConversationRepository.transition", () => {
  it("a valid transition updates the state", async () => {
    const t = setup({ state: S.Discovery });
    const out = await t.repo.transition("v1", S.Routing);
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0].set).toMatchObject({ state: S.Routing });
    expect(t.writes[0].from).toBe(S.Discovery);
    expect(out.state).toBe(S.Routing);
  });

  it("an invalid transition throws and writes nothing", async () => {
    const t = setup({ state: S.New });
    await expect(t.repo.transition("v1", S.Activation)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(t.writes).toHaveLength(0);
    expect(t.conv.state).toBe(S.New);
  });

  it("the same state is a no-op", async () => {
    const t = setup({ state: S.PlanFit });
    await t.repo.transition("v1", S.PlanFit);
    expect(t.writes).toHaveLength(0);
  });

  it("zero affected rows (someone else moved it first) throws ConcurrentTransitionError", async () => {
    const t = setup({ state: S.Discovery }, { conflict: true });
    await expect(t.repo.transition("v1", S.Routing)).rejects.toBeInstanceOf(
      ConcurrentTransitionError,
    );
    expect(t.conv.state).toBe(S.Discovery); // the in-memory row is not touched either
  });

  it("closing sets closed_at and clears resume_state", async () => {
    const t = setup({ state: S.AwaitingPayment, resume_state: "plan_fit" });
    await t.repo.transition("v1", S.Closed);
    expect(t.writes[0].set.closed_at).toBeInstanceOf(Date);
    expect(t.writes[0].set.resume_state).toBeNull();
  });

  it("a normal transition out of OPTED_OUT is blocked", async () => {
    const t = setup({ state: S.OptedOut });
    await expect(t.repo.transition("v1", S.Discovery)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    await expect(t.repo.transition("v1", S.New)).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(t.writes).toHaveLength(0);
  });

  it("an old row (legacy state) is mapped first: 'recommend' counts as PLAN_FIT", async () => {
    const t = setup({ state: S.Recommend });
    await t.repo.transition("v1", S.Activation);
    expect(t.writes[0].from).toBe("recommend"); // the compare-and-set uses the stored value
    expect(t.writes[0].set.state).toBe(S.Activation);
  });
});

describe("resume_state", () => {
  it.each([S.Pause, S.Escalated, S.FollowUp])(
    "entering %s from PLAN_FIT remembers PLAN_FIT",
    async (to) => {
      const t = setup({ state: S.PlanFit });
      await t.repo.transition("v1", to);
      expect(t.writes[0].set.resume_state).toBe(S.PlanFit);
    },
  );

  it("moving between parked states keeps the first resume_state", async () => {
    const t = setup({ state: S.Escalated, resume_state: S.PlanFit });
    await t.repo.transition("v1", S.Pause); // an emergency while escalated
    expect("resume_state" in t.writes[0].set).toBe(false);
  });

  it("resolveSafetyEvent: PAUSE -> the remembered state", async () => {
    const t = setup({ state: S.Pause, resume_state: S.PlanFit });
    const out = await t.repo.resolveSafetyEvent("v1");
    expect(out.state).toBe(S.PlanFit);
    expect(t.writes[0].set).toMatchObject({ state: S.PlanFit, resume_state: null });
  });

  it("resolveEscalation: ESCALATED -> the remembered state, or DISCOVERY if none", async () => {
    const a = setup({ state: S.Escalated, resume_state: S.CentreSearch });
    expect((await a.repo.resolveEscalation("v1")).state).toBe(S.CentreSearch);
    const b = setup({ state: S.Escalated, resume_state: null });
    expect((await b.repo.resolveEscalation("v1")).state).toBe(S.Discovery);
  });

  it("resolve* only works from the right state", async () => {
    const t = setup({ state: S.Discovery });
    await expect(t.repo.resolveSafetyEvent("v1")).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(t.repo.resolveEscalation("v1")).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(t.writes).toHaveLength(0);
  });

  it("FOLLOW_UP: the customer comes back -> the remembered state", async () => {
    const t = setup({ state: S.FollowUp, resume_state: S.CutMediBillsFit });
    expect((await t.repo.resumeFromFollowUp("v1")).state).toBe(S.CutMediBillsFit);
  });

  it("returning to a normal state through transition() clears resume_state", async () => {
    const t = setup({ state: S.FollowUp, resume_state: S.PlanFit });
    await t.repo.transition("v1", S.Discovery);
    expect(t.writes[0].set.resume_state).toBeNull();
  });
});

describe("optIn", () => {
  it("OPTED_OUT -> NEW and the opt-out is cleared on the consent row", async () => {
    const t = setup({ state: S.OptedOut });
    const out = await t.repo.optIn("v1");
    expect(out.state).toBe(S.New);
    expect(t.calls.update).toHaveBeenCalledWith(
      consent,
      { customer_id: "c1" },
      { opt_out_at: null },
    );
  });

  it("goes back to the stored resume_state when there is one", async () => {
    const t = setup({ state: S.OptedOut, resume_state: S.PlanFit });
    expect((await t.repo.optIn("v1")).state).toBe(S.PlanFit);
  });

  it("only works for an opted-out conversation, and then touches nothing", async () => {
    const t = setup({ state: S.Discovery });
    await expect(t.repo.optIn("v1")).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(t.writes).toHaveLength(0);
    expect(t.calls.update).not.toHaveBeenCalled();
  });
});

describe("openNew", () => {
  it("returns the open conversation if there is one", async () => {
    const t = setup({ state: S.PlanFit });
    const out = await t.repo.openNew("c1");
    expect(out.id).toBe("v1");
    expect(t.calls.save).not.toHaveBeenCalled();
  });

  it("creates a NEW conversation when none is open", async () => {
    const t = setup();
    t.manager.findOne.mockResolvedValueOnce(null as never);
    await t.repo.openNew("c1");
    expect(t.calls.create).toHaveBeenCalledWith(conversation, { customer_id: "c1", state: S.New });
    expect(t.calls.save).toHaveBeenCalledTimes(1);
  });

  it("two writers at once: the loser gets the winner's conversation", async () => {
    const t = setup({ state: S.New });
    t.manager.findOne.mockResolvedValueOnce(null as never); // nothing open yet ...
    t.calls.save.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" })); // ... but the other writer was faster
    const out = await t.repo.openNew("c1");
    expect(out.id).toBe("v1");
  });
});
