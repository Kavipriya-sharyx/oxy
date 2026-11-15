import { EventEmitter } from "events";
import { api_request_log } from "@Database/Table/Admin/api_request_log";
import { ApiLogMiddleware, ApiLogService, endpointOf, summariseCall } from "./ApiLog.service";
import { deliveryFailureReason } from "@Helper/WhatsappFailure";

afterEach(() => jest.restoreAllMocks());

describe("API logs (Super Admin)", () => {
  it("keeps only the safe part of a call: filters, field names, source, last 4 digits", () => {
    const d = summariseCall(
      { after: "120", limit: "50", wa_number: "919840012345", secret: "x" },
      { wa_number: "+91 98400 12345", source: "voice_ai", context: { need: "knee surgery" } },
    );
    expect(d).toEqual({
      query: { after: "120", limit: "50" },
      body_fields: ["wa_number", "source", "context"],
      source: "voice_ai",
      wa_number_last4: "2345",
    });
    expect(JSON.stringify(d)).not.toMatch(/knee|98400/); // no health detail, no full number
  });

  it("names the endpoint by its route, ids as :Id", () => {
    expect(endpointOf("post", "/api/v1/Actions/BookingRequests/:Id/Confirm", "")).toBe(
      "POST /Actions/BookingRequests/:Id/Confirm",
    );
    expect(
      endpointOf("get", undefined, "/api/v1/Actions/Tasks/11111111-1111-1111-1111-111111111111/x"),
    ).toBe("GET /Actions/Tasks/:Id/x");
  });

  it("logs each call when its answer has gone out: caller, status, time and the error the caller got", async () => {
    const record = jest.fn(async () => undefined);
    const mw = new ApiLogMiddleware({ record } as never);
    const res: any = Object.assign(new EventEmitter(), { statusCode: 409, locals: { oxxyApiError: "Booking is not pending" } });
    const req: any = {
      method: "POST",
      originalUrl: "/api/v1/Actions/BookingRequests/abc/Confirm?x=1",
      route: { path: "/api/v1/Actions/BookingRequests/:Id/Confirm" },
      headers: { "user-agent": "CRM/1.0", "x-api-key": "oxk_live_123" },
      ip: "10.0.0.5",
      query: {},
      body: { confirmed_by: "Priya" },
      oxxyApiCaller: { id: "k1", label: "CRM live (oxk_live…)" },
    };
    mw.use(req, res, () => undefined);
    res.emit("finish");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/Actions/BookingRequests/abc/Confirm",
        endpoint: "POST /Actions/BookingRequests/:Id/Confirm",
        status_code: 409,
        key_id: "k1",
        key_label: "CRM live (oxk_live…)",
        ip: "10.0.0.5",
        error_message: "Booking is not pending",
        detail: { body_fields: ["confirmed_by"] },
      }),
    );
  });

  it("a call with a wrong key is logged with the key's first characters only", () => {
    const record = jest.fn(async () => undefined);
    const mw = new ApiLogMiddleware({ record } as never);
    const res: any = Object.assign(new EventEmitter(), { statusCode: 401, locals: {} });
    mw.use({ method: "GET", url: "/api/v1/Actions/Changes", headers: { "x-api-key": "oxk_zz99_secretpart" }, query: {} }, res, () => undefined);
    res.emit("finish");
    const row = (record.mock.calls[0] as any)[0];
    expect(row.key_label).toBe("Wrong or expired key (oxk_zz99…)");
    expect(row.key_label).not.toMatch(/secretpart/);
    expect(row.error_message).toBe("HTTP 401");
  });

  it("a failed log write never breaks the API call", async () => {
    jest.spyOn(api_request_log, "insert").mockRejectedValue(new Error("db down"));
    await expect(new ApiLogService().record({ method: "GET" })).resolves.toBeUndefined();
  });
});

describe("why a WhatsApp message failed", () => {
  it("known Meta codes in plain words, with the code for support; unknown codes keep Meta's title", () => {
    expect(deliveryFailureReason(131047)).toBe(
      "Meta 131047: More than 24 hours since the customer's last message: only an approved template can be sent now.",
    );
    expect(deliveryFailureReason(131026)).toMatch(/not on WhatsApp/);
    expect(deliveryFailureReason(999999, "Some new problem")).toBe("Meta 999999: Some new problem");
    expect(deliveryFailureReason(null, null)).toBe("WhatsApp did not deliver it.");
  });
});
