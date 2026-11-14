// The high-priority Playbook fixes through the pipeline: approved FAQ answers (13), existing-customer help
// (3), the one-product block (3.1), one acknowledgement while a person has the case (3), the 7-day decision
// journey (1.3) and the CRM sync (Full Plan 3.2).
import { ChatPipelineService, ESCALATED_ACK_T, journeyExpired } from "./ChatPipeline.service";
import { GuardrailService } from "./Guardrail.service";
import { assertTransition } from "./ConversationStateMachine";
import { ConversationState as S } from "@Helper/Enum/ConversationState";
import { NOTICE_VERSION } from "@Helper/FixedReplies";
import { faqAnswer } from "@Helper/FaqReplies";
import { message } from "@Database/Table/Oxxy/message";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { need } from "@Database/Table/Oxxy/need";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { eligibility } from "@Database/Table/Oxxy/eligibility";

type Fn = (...a: unknown[]) => unknown;
const stub = (cls: unknown, name: string, impl: Fn) =>
  jest.spyOn(cls as Record<string, Fn>, name).mockImplementation(impl);

function setup(
  opts: {
    state?: S;
    pending?: string | null;
    active?: string | null;
    plan?: string | null;
    takenOver?: string | null;
    draft?: Record<string, unknown>;
    consented?: boolean;
    crm?: Record<string, unknown> | null;
  } = {},
) {
  const consented = opts.consented ?? true;
  const cons = {
    opt_out_at: null as Date | null,
    health_data_consent: consented,
    notice_version: consented ? NOTICE_VERSION : null,
    consent_timestamp: consented ? new Date() : null,
    notice_sent_at: consented ? null : new Date(),
    notice_sent_version: consented ? null : NOTICE_VERSION,
    health_refused_at: null,
    health_refused_version: null,
  };
  const conv = {
    id: "v1",
    state: opts.state ?? S.Discovery,
    pending_action: opts.pending ?? (null as string | null),
    selected_product: null as string | null,
    recommended_plan: null as string | null,
    taken_over_by_id: opts.takenOver ?? null,
  };
  const cust = {
    id: "c1",
    wa_number: "919800000001",
    language: "en",
    active_product: opts.active ?? null,
    active_plan: opts.plan ?? null,
    crm_customer_id: null as string | null,
    save: async () => undefined,
  };
  const out: string[] = [];
  const saved: Record<string, unknown>[] = [];
  const replied = new Set<string>();
  const send = jest.fn(async (...a: unknown[]) => {
    replied.add(String(a[3]));
    out.push(String((a[1] as { body: string }).body));
    return "wamid.OUT";
  });
  const generate = jest.fn(async () => ({
    reply_text: "Sure.",
    intent: "other",
    extracted_fields: {},
    needs_human: false,
    ...opts.draft,
  }));
  const transition = jest.fn(async (_id: unknown, to: unknown) => {
    assertTransition(conv.state, to as string);
    conv.state = to as S;
    return conv;
  });
  const mg = {
    save: jest.fn(async (v: Record<string, unknown>) => {
      saved.push(v);
      return { ...v, id: "t1" };
    }),
    create: (_c: unknown, v: unknown) => v,
  };
  const outbox = {
    enqueue: jest.fn(async () => null),
    dispatch: jest.fn(),
    emit: jest.fn(async () => undefined),
    lookupCustomer: jest.fn(async () => opts.crm ?? null),
  };

  stub(message, "findOne", async (...a) => {
    const where = (a[0] as { where: Record<string, unknown> }).where;
    return where.reply_to_wa_message_id && out.length && where.direction === "out" && replied.has(String(where.reply_to_wa_message_id))
      ? { id: "o1" }
      : null;
  });
  stub(message, "find", async () => []);
  const qb: Record<string, Fn> = {};
  for (const k of ["where", "andWhere"]) qb[k] = () => qb;
  qb.getCount = async () => 0; // never stale here
  stub(message, "createQueryBuilder", () => qb);
  const statusUpdates: unknown[][] = [];
  stub(message, "update", async (...a) => {
    statusUpdates.push(a);
    return undefined;
  });
  stub(consent, "findOne", async () => cons);
  stub(conversation, "update", async () => undefined);
  stub(customer, "update", async () => undefined);
  stub(need, "findOne", async () => null);
  stub(task, "findOne", async () => null);
  stub(booking_request, "findOne", async () => null);
  stub(booking_request, "find", async () => [
    { preferred_date: "2026-11-25", centre: { name: "Sample Care Hospital" } },
  ]);
  stub(activation, "findOne", async () => null);
  stub(eligibility, "findOne", async () => ({ id: "e1" }));

  const pipeline = new ChatPipelineService(
    new GuardrailService(),
    { generate } as never,
    { validate: async () => ({ ok: true, reasons: [] }) } as never,
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async (f: Fn) => f(mg) } as never,
    outbox as never,
    { transition } as never,
  );
  let n = 0;
  const run = (text: string) => {
    const wamid = `wamid.IN${++n}`;
    const s = { customer: cust, conversation: conv, message: { id: `m${n}` } } as never;
    return pipeline.process({ waNumber: cust.wa_number, waMessageId: wamid, text }, s);
  };
  return { run, out, generate, conv, cust, saved, outbox, cons, statusUpdates };
}

afterEach(() => jest.restoreAllMocks());

describe("Playbook 13: approved FAQ answers, never the LLM", () => {
  it("'What is Oxxy?' gets the approved answer (it used to be rejected for the word savings)", async () => {
    const t = setup();
    await t.run("What is Oxxy?");
    expect(t.out).toEqual([faqAnswer("what_is_oxxy", {}, "en")]);
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a question in the middle of the Cut Medi Bills gate: answer without its own question, then the same gate step", async () => {
    const t = setup({ state: S.CutMediBillsFit, pending: "cmb_gate:booking:e1" });
    await t.run("Who pays the bill?");
    expect(t.out[0]).toContain(faqAnswer("who_pays", {}, "en"));
    expect(t.out[0]).toMatch(/booked an appointment there yourself/);
    expect(t.conv.pending_action).toBe("cmb_gate:booking:e1");
  });

  it("'Are you a bot?' gets the 4.4 identity answer", async () => {
    const t = setup();
    await t.run("are you a bot?");
    expect(t.out[0]).toMatch(/automated WhatsApp assistant/);
  });
});

describe("Playbook 3: existing customer help", () => {
  it("the row looks the customer up and says what is on record", async () => {
    const t = setup({ state: S.IntentMenu, active: "oxxy", plan: "vital" });
    await t.run("menu_service");
    expect(t.out[0]).toMatch(/Your Oxxy Vital plan is active\./);
    expect(t.out[0]).toMatch(/Sample Care Hospital.*pending confirmation/);
    expect(t.conv.state).toBe(S.ServiceOrEscalation);
  });

  it("the customer's question then goes to a person: servicing task, ESCALATED, callback options", async () => {
    const t = setup({ state: S.ServiceOrEscalation });
    await t.run("my renewal date is wrong");
    expect(t.saved.some((v) => v.type === "servicing")).toBe(true);
    expect(t.conv.state).toBe(S.Escalated);
    expect(t.out[0]).toMatch(/precise answer rather than guess/);
    expect(t.generate).not.toHaveBeenCalled();
  });
});

describe("Playbook 3.1: an active product blocks another activation", () => {
  it("activate with an active product: the block message and a servicing task", async () => {
    const t = setup({ active: "oxxy", plan: "everyday", draft: { intent: "activate" } });
    await t.run("I want to activate another plan please");
    expect(t.out[0]).toMatch(/already have an active Oxxy Everyday plan/);
    expect(t.saved.some((v) => v.type === "servicing")).toBe(true);
  });
});

describe("Playbook 3: one acknowledgement while a person has the case", () => {
  it("ESCALATED: one acknowledgement, then quiet", async () => {
    const t = setup({ state: S.Escalated });
    await t.run("hello?");
    await t.run("anyone there?");
    expect(t.out).toEqual([ESCALATED_ACK_T.en]);
  });
  it("a message left without a reply on purpose is marked no_reply (no requeue loop)", async () => {
    const t = setup({ state: S.Escalated });
    await t.run("hello?"); // acknowledged
    await t.run("anyone there?"); // quiet
    expect(t.statusUpdates).toContainEqual([{ id: "m2", message_status: "received" }, { message_status: "no_reply" }]);
    expect(t.statusUpdates.some((u) => (u[0] as { id: string }).id === "m1")).toBe(false);
  });

  it("never while a person has taken the chat over", async () => {
    const t = setup({ state: S.Escalated, takenOver: "u1" });
    await t.run("hello?");
    expect(t.out).toEqual([]);
  });
  it("PAUSE (safety): the acknowledgement repeats the emergency numbers", async () => {
    const t = setup({ state: S.Pause });
    await t.run("ok");
    expect(t.out[0]).toMatch(/112/);
  });
});

describe("Playbook 1.3: the decision journey", () => {
  const day = 24 * 3600 * 1000;
  const now = Date.parse("2026-11-20T10:00:00Z");
  it("ends after 7 days without a customer message", () => {
    expect(journeyExpired({ state: S.Discovery, last_customer_message_at: new Date(now - 8 * day) }, now)).toBe(true);
    expect(journeyExpired({ state: S.Discovery, last_customer_message_at: new Date(now - 6 * day) }, now)).toBe(false);
  });
  it("a case a person holds, or an opt-out, is never closed by time", () => {
    for (const state of [S.Escalated, S.Pause, S.OptedOut])
      expect(journeyExpired({ state, last_customer_message_at: new Date(now - 30 * day) }, now)).toBe(false);
  });
});

describe("Full Plan 3.2: CRM sync", () => {
  it("consent YES goes to the CRM as an event", async () => {
    const t = setup({ consented: false });
    await t.run("yes");
    expect(t.outbox.emit).toHaveBeenCalledWith(
      "log_event",
      "c1",
      expect.objectContaining({ event: "consent", health_data_consent: true }),
    );
  });

  it("a new conversation asks the CRM first: its active product and id are copied in", async () => {
    const t = setup({ state: S.New, crm: { id: "C-9", active_product: "oxxy", active_plan: "vital", opted_out: false } });
    await t.run("hi");
    expect(t.outbox.lookupCustomer).toHaveBeenCalledWith("919800000001");
    expect(t.cust.active_product).toBe("oxxy");
    expect(t.cust.crm_customer_id).toBe("C-9");
  });

  it("a STOP given to the CRM (by phone) holds in the chat", async () => {
    const t = setup({ state: S.New, crm: { id: "C-9", active_product: null, active_plan: null, opted_out: true } });
    await t.run("hi");
    expect(t.out).toEqual([]);
  });

  it("a changed discovery field is sent as upsert_customer (no health details)", async () => {
    const t = setup({ draft: { extracted_fields: { first_name: "Asha" } } });
    await t.run("I am Asha, looking for help");
    const call = t.outbox.emit.mock.calls.find((c: unknown[]) => c[0] === "upsert_customer") as unknown[] | undefined;
    expect(call).toBeDefined();
    expect(call![2]).toEqual(expect.objectContaining({ first_name: "Asha", whatsapp: "+919800000001" }));
    expect(call![2]).not.toHaveProperty("healthcare_need");
  });
});

describe("Playbook 4.1 / 4.5: the consented outbound lead", () => {
  it("'Yes, please' before consent: the notice, then discovery question 1 right after YES", async () => {
    const t = setup({ state: S.New, pending: "lead_intro", consented: false });
    await t.run("Yes, please");
    expect(t.out[0]).toMatch(/^Before you share health details/);
    expect(t.conv.pending_action).toBe("after_consent:lead_yes");
    await t.run("yes");
    expect(t.out[1]).toMatch(/Is the healthcare need for you or someone in your family\?/);
    expect(t.conv.state).toBe(S.Discovery);
  });

  it("'Just send details': the 4.5 priority question, then only the matching summary", async () => {
    const t = setup({ state: S.New, pending: "lead_intro" });
    await t.run("Just send details");
    expect(t.out[0]).toMatch(/broader ongoing healthcare support or one specific upcoming medical expense/);
    expect(t.conv.pending_action).toBe("lead_priority");
    await t.run("one specific surgery");
    expect(t.out[1]).toMatch(/^Cut Medi Bills is Oxxy's quick medical-savings service/);
    expect(t.out[1]).not.toMatch(/Oxxy is your lifelong/);
  });

  it("'Not now': asks for a day and time (FOLLOW_UP_TIME), no health notice", async () => {
    const t = setup({ state: S.New, pending: "lead_intro", consented: false });
    await t.run("Not now");
    expect(t.out[0]).toMatch(/convenient day and time/);
    expect(t.conv.state).toBe(S.FollowUpTime);
    expect(t.conv.pending_action).toBe("follow_up_time");
  });
});

describe("Playbook 15: in-chat rescue signals", () => {
  it("one-word replies: benefit-or-price, then the concern question, then the close offer", async () => {
    const t = setup();
    await t.run("ok");
    await t.run("hmm");
    await t.run("fine");
    expect(t.out[0]).toBe("Would you prefer the main benefit or the price first?");
    expect(t.out[1]).toBe("Is your concern mainly trust, price or whether you will use it?");
    expect(t.conv.pending_action).toBe("close_offer");
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("'I don't know' twice asks for a spend bucket and reads the answer as the yearly spend", async () => {
    const t = setup();
    await t.run("I don't know");
    expect(t.out[0]).toMatch(/routine care or occasional major treatment/);
    await t.run("not sure");
    expect(t.out[1]).toMatch(/₹50,000, ₹1 lakh, ₹3 lakh/);
    expect(t.conv.pending_action).toBe("price_spend");
  });

  it("'you are repeating' gets the one-concern question", async () => {
    const t = setup();
    await t.run("you already said that");
    expect(t.out[0]).toMatch(/one concern I have not answered/);
  });

  it("a waiting question is never hijacked: 'ok' with a pending action goes to its handler", async () => {
    const t = setup({ pending: "lead_priority" });
    await t.run("ok");
    expect(t.out.join(" ")).not.toMatch(/main benefit or the price/);
  });
});

describe("Playbook 11.2: activation follow-up after booking", () => {
  it("a decline closes the activation follow-up and tells the CRM not to pitch", async () => {
    const t = setup({ pending: "soft_activation" });
    jest.spyOn(task, "find").mockResolvedValue([{ id: "af1" }] as never);
    const upd = jest.spyOn(task, "update").mockResolvedValue(undefined as never);
    const { trigger_event } = await import("@Database/Table/Oxxy/trigger_event");
    jest.spyOn(trigger_event, "findOne").mockResolvedValue(null as never);
    jest.spyOn(trigger_event, "update").mockResolvedValue(undefined as never);
    await t.run("no");
    expect(upd).toHaveBeenCalledWith("af1", expect.objectContaining({ task_status: "done" }));
    expect(t.outbox.emit).toHaveBeenCalledWith(
      "log_event",
      "c1",
      expect.objectContaining({ event: "activation_declined", activation_pitch_allowed: false }),
    );
    expect(t.out[0]).toMatch(/booking request is recorded/i);
  });
});

describe("Full Plan 3.3: another centre after a cancelled booking", () => {
  it("NO closes kindly and clears the offer", async () => {
    const t = setup({ pending: "rebook_offer:b1" });
    await t.run("no");
    expect(t.out[0]).toMatch(/No problem/);
    expect(t.conv.pending_action).toBeNull();
  });

  it("a question is answered normally (the offer is dropped)", async () => {
    const t = setup({ pending: "rebook_offer:b1" });
    await t.run("What is Oxxy?");
    expect(t.out[0]).toBe(faqAnswer("what_is_oxxy", {}, "en"));
  });
});

describe("Playbook 1.1 / 16.4: Oxxy family pricing is escalated, not guessed", () => {
  it("creates an escalation task and answers with the precise-answer line", async () => {
    const t = setup();
    await t.run("What is the price for my family members?");
    expect(t.out[0]).toMatch(/precise answer rather than guess/);
    expect(t.saved.some((r) => String(r.summary).includes("family / multi-member pricing"))).toBe(true);
    expect(t.conv.state).toBe(S.Escalated);
  });
});
