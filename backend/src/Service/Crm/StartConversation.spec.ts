// Voice AI call -> WhatsApp (Playbook 4.1): the call's context is kept, quiet hours queue instead of failing, and
// a customer who wrote recently gets the same buttons as a normal message; a chat in progress is not interrupted.
import { ConflictException } from "@nestjs/common";
import { BotActionsService } from "./BotActions.service";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { need } from "@Database/Table/Oxxy/need";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { DateWindowService } from "@Service/Oxxy/DateWindow.service";
import { FollowUpSchedulerService } from "@Service/Oxxy/FollowUpScheduler.service";
import { cleanCallContext, describeCallContext, freshCallContext } from "@Helper/CallContext";

const C = "11111111-2222-4333-8444-555555555555";
const BODY = {
  wa_number: "9840012345",
  first_name: "Ravi",
  whatsapp_consent: true,
  consent_source: "voice_ai",
};
const DAY = new Date("2026-11-20T06:00:00Z"); // 11:30 IST
const NIGHT = new Date("2026-11-20T17:00:00Z"); // 22:30 IST

function setup(conv: Record<string, unknown>, at: Date) {
  jest.useFakeTimers().setSystemTime(at);
  const c = {
    id: C,
    wa_number: "919840012345",
    first_name: "Ravi",
    language: "en",
    active_product: null,
  };
  jest.spyOn(customer, "findOne").mockResolvedValue(c as never);
  jest.spyOn(customer, "update").mockResolvedValue({} as never);
  jest.spyOn(consent, "findOne").mockResolvedValue({ save: async () => undefined } as never);
  const convSave = jest
    .spyOn(conversation, "save")
    .mockImplementation((async (v: unknown) => v) as never);
  const convUpdate = jest.spyOn(conversation, "update").mockResolvedValue({} as never);
  jest.spyOn(need, "findOne").mockResolvedValue(null);
  jest.spyOn(need, "create").mockImplementation(((v: unknown) => ({ ...(v as object) })) as never);
  const needSave = jest.spyOn(need, "save").mockImplementation((async (v: unknown) => v) as never);
  jest.spyOn(follow_up, "findOne").mockResolvedValue(null);
  const theConv = {
    id: "v1",
    state: "new",
    pending_action: null,
    last_customer_message_at: null,
    selected_product: null,
    ...conv,
  };
  const scheduler = { create: jest.fn(async () => ({ id: "f1" })) };
  const wa = { send: jest.fn(async () => "wamid.1") };
  const svc = new BotActionsService(
    {} as never,
    {} as never,
    { findOpenByCustomer: async () => theConv, openNew: async () => theConv } as never,
    {} as never,
    {} as never,
    new DateWindowService(),
    scheduler as never,
    wa as never,
  );
  return { svc, wa, scheduler, convSave, convUpdate, needSave, theConv };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("call context", () => {
  it("keeps only known fields and valid products / plans", () => {
    const c = cleanCallContext({
      summary: "  Wants   savings for  mother ",
      need: "knee surgery for mother",
      city: "Chennai",
      selected_product: "OXXY",
      recommended_plan: "vital",
      hack: "x",
    })!;
    expect(c).toMatchObject({
      summary: "Wants savings for mother",
      city: "Chennai",
      selected_product: "oxxy",
      recommended_plan: "vital",
    });
    expect(
      cleanCallContext({ selected_product: "cut_medi_bills", recommended_plan: "vital" })
        ?.recommended_plan,
    ).toBeNull();
    expect(cleanCallContext({ selected_product: "insurance" })).toBeNull();
    expect(cleanCallContext("text")).toBeNull();
    expect(describeCallContext(c)).toContain("location: Chennai");
  });

  it("is shown to the LLM for a week", () => {
    const now = Date.now();
    expect(
      freshCallContext({ call_context: "x", call_context_at: new Date(now - 86400000) }, now),
    ).toBe("x");
    expect(
      freshCallContext({ call_context: "x", call_context_at: new Date(now - 8 * 86400000) }, now),
    ).toBeNull();
  });
});

describe("StartConversation from a voice AI call", () => {
  it("new chat in the day: lead_intro template, context saved on the chat and the need record", async () => {
    const { svc, wa, convSave, needSave, convUpdate } = setup({}, DAY);
    const r = await svc.startConversation({
      ...BODY,
      context: { summary: "asked for details", city: "Chennai", selected_product: "oxxy" },
    });
    expect(r).toMatchObject({ status: "sent", template: "lead_intro", context_saved: true });
    expect(wa.send).toHaveBeenCalledWith(
      C,
      expect.objectContaining({ kind: "template", name: "lead_intro", params: ["Ravi"] }),
      "proactive",
    );
    expect(convSave).toHaveBeenCalledWith(
      expect.objectContaining({
        call_context: expect.stringContaining("asked for details"),
        selected_product: "oxxy",
      }),
    );
    expect(needSave).toHaveBeenCalledWith(expect.objectContaining({ city: "Chennai" }));
    expect(convUpdate).toHaveBeenCalledWith("v1", { pending_action: "lead_intro" });
  });

  it("quiet hours: queued for 09:00 IST instead of refused", async () => {
    const { svc, wa, scheduler } = setup({}, NIGHT);
    const r = await svc.startConversation(BODY);
    expect(r).toMatchObject({ status: "queued", scheduled_for: "2026-11-21T03:30:00.000Z" });
    expect(scheduler.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "lead_intro", templateName: "lead_intro", params: ["Ravi"] }),
    );
    expect(wa.send).not.toHaveBeenCalled();
  });

  it("the customer wrote recently and nothing is in progress: the same buttons as a normal message", async () => {
    const { svc, wa } = setup(
      { state: "intent_menu", last_customer_message_at: new Date(DAY.getTime() - 3600000) },
      DAY,
    );
    const r = await svc.startConversation(BODY);
    expect(r).toMatchObject({ status: "sent", template: null });
    const msg = (wa.send.mock.calls[0] as unknown[])[1] as any;
    expect(msg.kind).toBe("buttons");
    expect(msg.body).toContain("Ravi");
    expect(msg.buttons.map((b: any) => b.id)).toEqual(["lead_yes", "lead_details", "lead_not_now"]);
  });

  it("a chat in progress is not interrupted: only the context is saved", async () => {
    const { svc, wa, convSave } = setup(
      { state: "booking_capture", last_customer_message_at: new Date(DAY.getTime() - 600000) },
      DAY,
    );
    const r = await svc.startConversation({
      ...BODY,
      context: { summary: "wants a dental booking" },
    });
    expect(r).toMatchObject({ status: "context_saved", reason: "chat_in_progress" });
    expect(wa.send).not.toHaveBeenCalled();
    expect(convSave).toHaveBeenCalled();
  });

  it("an older chat that stopped mid-way is still a 409 chat_open", async () => {
    const { svc } = setup(
      { state: "discovery", last_customer_message_at: new Date(DAY.getTime() - 3 * 86400000) },
      DAY,
    );
    await expect(svc.startConversation(BODY)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("queued lead_intro at 09:00", () => {
  it("is skipped when the customer started chatting meanwhile, else sent with the lead buttons pending", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-21T03:30:00Z")); // 09:00 IST
    jest.spyOn(consent, "findOne").mockResolvedValue({} as never);
    const upd = jest.spyOn(conversation, "update").mockResolvedValue({} as never);
    const wa = { send: jest.fn().mockResolvedValue("wamid") };
    const svc = new FollowUpSchedulerService(wa as never);
    const job = {
      customerId: C,
      conversationId: "v1",
      kind: "lead_intro" as const,
      templateName: "lead_intro",
      params: ["Ravi"],
    };

    jest.spyOn(conversation, "findOne").mockResolvedValue({
      id: "v1",
      state: "discovery",
      last_customer_message_at: new Date(),
    } as never);
    await svc.execute(job);
    expect(wa.send).not.toHaveBeenCalled();

    jest
      .spyOn(conversation, "findOne")
      .mockResolvedValue({ id: "v1", state: "new", last_customer_message_at: null } as never);
    await svc.execute(job);
    expect(wa.send).toHaveBeenCalledWith(
      C,
      expect.objectContaining({ name: "lead_intro" }),
      "proactive",
    );
    expect(upd).toHaveBeenCalledWith("v1", { pending_action: "lead_intro" });
  });
});
