// Full Plan 3.3 CRM webhooks: stored, then processed by the BullMQ worker (inline without Redis), and
// booking.cancelled offers another centre once per conversation.
import { CrmWebhookService } from "./CrmWebhook.service";
import { crm_webhook_event } from "@Database/Table/Crm/crm_webhook_event";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { conversation } from "@Database/Table/Oxxy/conversation";

afterEach(() => jest.restoreAllMocks());

function setup(cancelledInConversation: number) {
  const send = jest.fn(async () => "wamid.OUT");
  const svc = new CrmWebhookService(
    {} as never,
    { send } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const saved: Record<string, unknown>[] = [];
  const store = new Map<string, any>();
  jest
    .spyOn(crm_webhook_event, "findOne")
    .mockImplementation((async (o: any) => store.get(o.where.event_id) ?? null) as never);
  jest.spyOn(crm_webhook_event, "create").mockImplementation(((v: any) => {
    const ev = { ...v, processed_at: null, error: null, save: async () => saved.push({ ...ev }) };
    return ev;
  }) as never);
  jest.spyOn(crm_webhook_event, "save").mockImplementation((async (ev: any) => {
    store.set(ev.event_id, ev);
    return ev;
  }) as never);
  const b = {
    id: "b1",
    customer_id: "c1",
    conversation_id: "v1",
    booking_status: "pending_confirmation",
    preferred_date: "2026-12-01",
    centre: { name: "Sample Care" },
    save: async () => undefined,
  };
  jest.spyOn(booking_request, "findOne").mockResolvedValue(b as never);
  jest.spyOn(booking_request, "count").mockResolvedValue(cancelledInConversation as never);
  const convUpdate = jest.spyOn(conversation, "update").mockResolvedValue(undefined as never);
  return { svc, send, convUpdate, store, saved };
}

describe("booking.cancelled", () => {
  it("the first cancellation tells the customer and asks once about another centre", async () => {
    const t = setup(1);
    expect(
      await t.svc.handle({
        event_id: "e1",
        event_type: "booking.cancelled",
        data: { booking_id: "b1" },
      }),
    ).toBe("ok");
    expect(t.send).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ name: "booking_cancelled" }),
      "proactive",
    );
    expect(t.convUpdate).toHaveBeenCalledWith("v1", { pending_action: "rebook_offer:b1" });
    expect(t.store.get("e1").processed_at).toBeInstanceOf(Date);
  });

  it("a later cancellation only informs", async () => {
    const t = setup(2);
    await t.svc.handle({
      event_id: "e2",
      event_type: "booking.cancelled",
      data: { booking_id: "b1" },
    });
    expect(t.send).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ name: "booking_cancelled_info" }),
      "proactive",
    );
    expect(t.convUpdate).not.toHaveBeenCalled();
  });
});

describe("store -> 200 -> queue", () => {
  it("with a queue the event is only stored and queued; the worker processes it later, once", async () => {
    const t = setup(1);
    const add = jest.fn(async () => undefined);
    (t.svc as any).queue = { add };
    expect(
      await t.svc.handle({
        event_id: "e3",
        event_type: "booking.cancelled",
        data: { booking_id: "b1" },
      }),
    ).toBe("ok");
    expect(add).toHaveBeenCalledWith(
      "event",
      { eventId: "e3" },
      expect.objectContaining({ jobId: "e3", attempts: 3 }),
    );
    expect(t.send).not.toHaveBeenCalled();
    await t.svc.processStored("e3");
    await t.svc.processStored("e3"); // a second job for the same event does nothing
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("a resend of the same event_id is a duplicate", async () => {
    const t = setup(1);
    await t.svc.handle({
      event_id: "e4",
      event_type: "booking.cancelled",
      data: { booking_id: "b1" },
    });
    expect(
      await t.svc.handle({
        event_id: "e4",
        event_type: "booking.cancelled",
        data: { booking_id: "b1" },
      }),
    ).toBe("duplicate");
  });

  it("a failing event keeps its error for the console; a retrying job rethrows so BullMQ backs off", async () => {
    const t = setup(1);
    (t.svc as any).queue = { add: jest.fn(async () => undefined) };
    await t.svc.handle({ event_id: "e5", event_type: "nope.unknown", data: {} });
    await expect(t.svc.processStored("e5", { rethrow: true })).rejects.toThrow(
      /unknown event_type/,
    );
    expect(t.store.get("e5").error).toMatch(/unknown event_type/);
    expect(t.store.get("e5").processed_at).toBeNull();
  });
});

describe("customer.opted_out", () => {
  it("finds the customer by any WhatsApp number format", async () => {
    const { customer } = await import("@Database/Table/Oxxy/customer");
    const svc = new CrmWebhookService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const find = jest.spyOn(customer, "findOne").mockResolvedValue(null as never);
    for (const wa of ["+91 98400 12345", "09840012345", "919840012345"]) {
      await expect((svc as any).customerOptedOut({ wa_number: wa })).rejects.toThrow(
        "customer not found",
      );
    }
    expect(find.mock.calls.map((c: any) => c[0].where.wa_number)).toEqual([
      "919840012345",
      "919840012345",
      "919840012345",
    ]);
  });
});
