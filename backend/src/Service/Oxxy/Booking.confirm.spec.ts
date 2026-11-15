// Confirming a booking in the console: the booking is confirmed whatever happens to the WhatsApp message,
// and the console is always told what happened to it (reported: "confirmed, but no message was sent").
import { BookingService, sendProblem } from "./Booking.service";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { user } from "@Database/Table/Admin/user";
import { QuietHoursError, WhatsappApiError, InvalidMessageError } from "@Helper/WhatsappErrors";

function setup(send: jest.Mock) {
  const row = {
    id: "b1",
    customer_id: "c1",
    conversation_id: "v1",
    booking_status: "pending_confirmation",
    preferred_date: "2026-11-20",
    centre: { name: "ABC Hospital" },
  };
  jest.spyOn(booking_request, "findOne").mockResolvedValue(row as never);
  jest.spyOn(user, "findOne").mockResolvedValue({ id: "u1", crm_user_id: null } as never);
  const create = jest.fn(async (f: unknown) => ({ id: "fu1", ...(f as object) }));
  const svc = new BookingService(
    {} as never,
    { transaction: async (fn: (m: unknown) => unknown) => fn({ save: async (v: unknown) => v }) } as never,
    { enabled: false, enqueue: async () => null, dispatch: async () => undefined } as never,
    { send } as never,
    { create } as never,
  );
  return { svc, row, create };
}

afterEach(() => jest.restoreAllMocks());

describe("booking confirmed in the console", () => {
  it("message sent: the template with the centre and the date", async () => {
    const send = jest.fn(async () => "wamid.1");
    const t = setup(send);
    const b = await t.svc.confirm("b1", "u1");
    expect(b.booking_status).toBe("confirmed");
    expect(b.notice).toEqual({ state: "sent" });
    expect(send).toHaveBeenCalledWith("c1", { kind: "template", name: "booking_confirmed", languageCode: "en", params: ["ABC Hospital", "2026-11-20"] }, "proactive");
  });

  it("quiet hours (confirmed at 3 am): never dropped, queued for 09:00 IST", async () => {
    const nine = new Date("2026-11-16T03:30:00Z"); // 09:00 IST
    const t = setup(jest.fn(async () => { throw new QuietHoursError(nine); }));
    const b = await t.svc.confirm("b1", "u1");
    expect(b.booking_status).toBe("confirmed");
    expect(b.notice).toEqual({ state: "scheduled", at: nine.toISOString() });
    expect(t.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "c1", conversationId: "v1", kind: "status_update", scheduledFor: nine, templateName: "booking_confirmed", params: ["ABC Hospital", "2026-11-20"] }),
    );
  });

  it("Meta refuses the template: the booking stays confirmed and the reason is returned, not swallowed", async () => {
    const err = new WhatsappApiError("(#132001) Template name does not exist in the translation", { retryable: false, metaCode: 132001, httpStatus: 404 });
    const t = setup(jest.fn(async () => { throw err; }));
    const b = await t.svc.confirm("b1", "u1");
    expect(b.booking_status).toBe("confirmed");
    expect(b.notice).toEqual({ state: "failed", problem: "the template booking_confirmed is not approved in Meta for this language yet (Templates screen)." });
    expect(t.create).not.toHaveBeenCalled();
  });
});

describe("why a message was not sent, in words the team can act on", () => {
  it.each([
    [new InvalidMessageError("template booking_confirmed is paused in Meta"), /the template booking_confirmed is paused in Meta\. Fix it in Meta/],
    [new WhatsappApiError("Error validating access token: Session has expired", { retryable: false, metaCode: 190 }), /access token is invalid or expired/],
    [new WhatsappApiError("(#132000) Number of parameters does not match", { retryable: false, metaCode: 132000 }), /different number of variables/],
    [new Error("customer has no conversation"), /customer has no conversation/],
  ])("%s", (e, re) => expect(sendProblem(e)).toMatch(re));
});
