import { BadRequestException, ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import { BotActionsService, normaliseWa, parseWhen, sourceOf } from "./BotActions.service";
import { range } from "./Analytics.service";
import { validApiKey } from "@Controller/Crm/Actions.controller";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { centre } from "@Database/Table/Oxxy/centre";
import { task } from "@Database/Table/Oxxy/task";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { DateWindowService } from "@Service/Oxxy/DateWindow.service";

describe("helpers", () => {
  it("normalises Indian WhatsApp numbers", () => {
    expect(normaliseWa("+91 98400 12345")).toBe("919840012345");
    expect(normaliseWa("09840012345")).toBe("919840012345");
    expect(normaliseWa("9840012345")).toBe("919840012345");
    expect(normaliseWa("12")).toBeNull();
  });
  it("reads ISO times and sources", () => {
    expect(parseWhen("2026-11-20T11:00:00+05:30")?.toISOString()).toBe("2026-11-20T05:30:00.000Z");
    expect(parseWhen("tomorrow")).toBeNull();
    expect(sourceOf("voice_ai")).toBe("voice_ai");
    expect(sourceOf("hacker")).toBe("crm");
  });
  it("compares API keys safely", () => {
    expect(validApiKey("abc", "abc")).toBe(true);
    expect(validApiKey("abd", "abc")).toBe(false);
    expect(validApiKey(undefined, "abc")).toBe(false);
    expect(validApiKey("abc", undefined)).toBe(false);
  });
  it("KPI range defaults to the last 30 days in IST", () => {
    expect(range(undefined, undefined, new Date("2026-11-13T20:00:00Z"))).toEqual({ from: "2026-10-16", to: "2026-11-14" });
    expect(range("2026-11-01", "2026-11-10")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });
});

const U = "11111111-2222-4333-8444-555555555555";

function service(over: Record<string, unknown> = {}) {
  const conv = { id: "v1", state: "discovery", selected_product: null };
  const deps = {
    dataSource: { transaction: async (fn: any) => fn({ save: async (v: any) => ({ ...v, id: "t1" }), create: (_c: unknown, v: unknown) => v }) },
    outbox: { enqueue: jest.fn(async () => null), dispatch: jest.fn() },
    convRepo: { findOpenByCustomer: async () => conv, openNew: async () => conv, transition: async () => conv },
    search: { search: jest.fn(async () => []) },
    booking: { create: jest.fn(async (d: any) => ({ id: "b1", ...d })) },
    scheduler: { create: jest.fn(async (f: any) => ({ id: "f1", selected_product: f.selectedProduct, follow_up_status: "scheduled" })), cancelAll: jest.fn(async () => 2) },
    wa: { send: jest.fn(async () => "wamid") },
    ...over,
  };
  const svc = new BotActionsService(
    deps.dataSource as never,
    deps.outbox as never,
    deps.convRepo as never,
    deps.search as never,
    deps.booking as never,
    new DateWindowService(),
    deps.scheduler as never,
    deps.wa as never,
  );
  return { svc, deps };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("create_booking_request (17.1)", () => {
  beforeEach(() => {
    jest.spyOn(customer, "findOne").mockResolvedValue({ id: "c1" } as never);
  });

  it("refuses a date outside today + 3 days .. + 6 months (Asia/Kolkata)", async () => {
    const { svc, deps } = service();
    await expect(
      svc.createBookingRequest({ customer_id: U, centre: { centre_id: "x" }, specialisation: "dental", preferred_date: "2020-01-01" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.booking.create).not.toHaveBeenCalled();
  });

  it("an unknown centre is never rejected silently: a verification task is made", async () => {
    jest.spyOn(centre, "findOne").mockResolvedValue(null as never);
    jest.spyOn(task, "save").mockResolvedValue({} as never);
    const { svc, deps } = service();
    const d = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await expect(
      svc.createBookingRequest({ customer_id: U, centre: { name: "Kumar Nursing Home" }, specialisation: "ortho", preferred_date: d }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(deps.booking.create).not.toHaveBeenCalled();
    expect(deps.outbox.enqueue).toHaveBeenCalledWith(expect.anything(), "create_task", "c1", expect.objectContaining({ type: "directory_verification" }));
  });
});

describe("create_follow_up (17.1)", () => {
  beforeEach(() => {
    jest.spyOn(customer, "findOne").mockResolvedValue({ id: "c1" } as never);
    jest.spyOn(consent, "findOne").mockResolvedValue({} as never);
  });

  it("refuses quiet hours and past times", async () => {
    const { svc } = service();
    const night = new Date(Date.now() + 2 * 86400000);
    night.setUTCHours(17, 0, 0, 0); // 22:30 IST
    await expect(svc.createFollowUp({ customer_id: U, scheduled_for: night.toISOString(), reason: "call back" })).rejects.toThrow(/09:00 and 21:00/);
    await expect(svc.createFollowUp({ customer_id: U, scheduled_for: "2020-01-01T05:00:00Z", reason: "x" })).rejects.toThrow(/future/);
  });

  it("refuses an opted-out customer", async () => {
    jest.spyOn(consent, "findOne").mockResolvedValue({ opt_out_at: new Date() } as never);
    const { svc } = service();
    const day = new Date(Date.now() + 2 * 86400000);
    day.setUTCHours(6, 0, 0, 0); // 11:30 IST
    await expect(svc.createFollowUp({ customer_id: U, scheduled_for: day.toISOString(), reason: "x" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("get_official_plan (17.1)", () => {
  it("returns price, GST, renewal, link and version; flags [CONFIRM] values", async () => {
    jest.spyOn(plan_catalog, "find").mockResolvedValue([
      { id: "p1", billing: "yearly", price: "10000", gst_rate: "0.18", renewal_terms: "[CONFIRM] renewal", activation_time: "x", activation_link: "https://l", version: 2, auto_renews: false, created_on: new Date("2026-11-01") },
    ] as never);
    const { svc } = service();
    const r = await svc.getOfficialPlan({ product: "oxxy", plan: "everyday" });
    expect(r.options[0]).toMatchObject({ price: 10000, gst_rate: 0.18, price_incl_gst: 11800, version: 2, needs_confirmation: true });
  });
  it("needs a plan for Oxxy", async () => {
    const { svc } = service();
    await expect(svc.getOfficialPlan({ product: "oxxy" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ids", () => {
  it("a customer_id that is not a UUID is a 400, not a database error", async () => {
    const { svc } = service();
    await expect(svc.lookupCustomer({ customer_id: "abc" })).rejects.toBeInstanceOf(BadRequestException);
  });
});
