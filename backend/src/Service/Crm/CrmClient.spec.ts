import { crmRoute } from "./CrmClient.service";

describe("bot -> CRM paths (Full Plan 3.2)", () => {
  const ids = { wa: "+919800000001", crmId: "C-17" };
  it.each([
    ["upsert_customer", "put", "/customers/%2B919800000001"],
    ["create_booking_request", "post", "/booking-requests"],
    ["create_task", "post", "/tasks"],
    ["create_activation", "post", "/activations"],
    ["log_event", "post", "/customers/C-17/events"],
    ["set_opt_out", "post", "/customers/C-17/opt-out"],
    ["set_opt_in", "post", "/set_opt_in"],
  ])("%s -> %s %s", (action, method, path) => {
    expect(crmRoute(action, ids)).toEqual({ method, path });
  });
  it("uses the WhatsApp number when the CRM id is not known yet", () => {
    expect(crmRoute("log_event", { wa: "+919800000001" }).path).toBe("/customers/%2B919800000001/events");
  });
});
