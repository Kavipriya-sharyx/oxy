// Nightly CRM check, data retention, two-person plan changes, template status, live events
import { compareOpen } from "./CrmReconciliation.service";
import { isDue, retentionDays } from "./Retention.service";
import { cleanChanges, PlanChangeService } from "./PlanChange.service";
import { assertTemplateUsable, metaStatus } from "./Templates.service";
import { eventFor, LiveEventsService } from "@Service/Live/LiveEvents.service";
import { plan_change } from "@Database/Table/Oxxy/plan_change";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { wa_template } from "@Database/Table/Oxxy/wa_template";

afterEach(() => jest.restoreAllMocks());

describe("CRM reconciliation: compare open records on both sides (Full Plan 3.4)", () => {
  it("lists missing on either side and status differences; matches by bot id or CRM id", () => {
    const bot = [
      { id: "b1", crm_id: "c1", status: "pending_confirmation" },
      { id: "b2", crm_id: null, status: "pending_confirmation" },
      { id: "b3", crm_id: "c3", status: "confirmed" },
    ];
    const crm = [
      { external_id: "b1", id: "c1", status: "Pending Confirmation" }, // same, written differently
      { id: "c3", status: "cancelled" }, // matched by CRM id, status differs
      { external_id: "b9", id: "c9", status: "pending_confirmation" }, // the bot does not have it open
    ];
    expect(compareOpen("booking", bot, crm)).toEqual([
      { kind: "booking", issue: "missing_in_crm", bot_id: "b2", crm_id: null, bot_status: "pending_confirmation", crm_status: null },
      { kind: "booking", issue: "status_differs", bot_id: "b3", crm_id: "c3", bot_status: "confirmed", crm_status: "cancelled" },
      { kind: "booking", issue: "missing_in_bot", bot_id: "b9", crm_id: "c9", bot_status: null, crm_status: "pending_confirmation" },
    ]);
  });
  it("nothing to report when both sides agree", () => {
    expect(compareOpen("task", [{ id: "t1", crm_id: "x", status: "open" }], [{ bot_id: "t1", status: "OPEN" }])).toEqual([]);
  });
});

describe("data retention (Playbook 16.3)", () => {
  const now = new Date("2026-11-14T06:00:00Z");
  it("due after the stored date or after N days without a message", () => {
    expect(isDue({ last: null, until: "2026-11-13" }, 365, now)).toBe(true);
    expect(isDue({ last: new Date("2025-11-01T00:00:00Z"), until: null }, 365, now)).toBe(true);
    expect(isDue({ last: new Date("2026-10-01T00:00:00Z"), until: null }, 365, now)).toBe(false);
    expect(isDue({ last: null, until: null }, 365, now)).toBe(false);
    expect(isDue({ last: new Date("2026-10-01T00:00:00Z"), until: "2027-01-01" }, 30, now)).toBe(true);
  });
  it("no period set = the job does nothing ([CONFIRM])", () => {
    const old = process.env.RETENTION_DAYS;
    delete process.env.RETENTION_DAYS;
    expect(retentionDays()).toBeNull();
    process.env.RETENTION_DAYS = "400";
    expect(retentionDays()).toBe(400);
    process.env.RETENTION_DAYS = old;
  });
});

describe("plan changes: two-person rule", () => {
  it("only editable fields with valid values", () => {
    expect(cleanChanges({ price: "2499", gst_rate: 0.18, age_limit: "", activation_link: "https://oxxy.in/p" }).clean).toEqual({
      price: 2499,
      gst_rate: 0.18,
      age_limit: null,
      activation_link: "https://oxxy.in/p",
    });
    const bad = cleanChanges({ price: -1, gst_rate: 2, activation_link: "http://x", product: "cut_medi_bills", renewal_terms: "" });
    expect(bad.errors).toEqual([
      "price must be a whole number of rupees above 0",
      "gst_rate must be between 0 and 0.5 (0.18 = 18%)",
      "activation_link must be an https:// link",
      "product cannot be changed here",
      "renewal_terms must be text of 1-500 characters",
    ]);
  });

  function svc() {
    const mg = { findOne: jest.fn(async () => ({ id: "cat1", version: 3 })), update: jest.fn(async () => undefined) };
    const s = new PlanChangeService({ transaction: async (fn: (m: unknown) => unknown) => fn(mg) } as never);
    return { s, mg };
  }
  const pending = { id: "p1", catalog_id: "cat1", changes: { price: 2499 }, change_status: "pending", requested_by_id: "u1" };

  it("the person who proposed it cannot approve it", async () => {
    jest.spyOn(plan_change, "findOne").mockResolvedValue(pending as never);
    const { s, mg } = svc();
    await expect(s.approve("p1", "u1")).rejects.toThrow(/Two-person rule/);
    expect(mg.update).not.toHaveBeenCalled();
  });
  it("a second person approves: plan_catalog changes and the version goes up", async () => {
    jest.spyOn(plan_change, "findOne").mockResolvedValue(pending as never);
    const { s, mg } = svc();
    const r = await s.approve("p1", "u2", "checked the official page");
    expect(mg.update).toHaveBeenCalledWith(plan_catalog, { id: "cat1" }, expect.objectContaining({ price: 2499, version: 4, updated_by_id: "u2" }));
    expect(mg.update).toHaveBeenCalledWith(plan_change, { id: "p1" }, expect.objectContaining({ change_status: "approved", decided_by_id: "u2", applied_version: 4 }));
    expect(r.applied_version).toBe(4);
  });
  it("a decided change cannot be approved again; only the proposer withdraws", async () => {
    jest.spyOn(plan_change, "findOne").mockResolvedValue({ ...pending, change_status: "approved" } as never);
    await expect(svc().s.approve("p1", "u2")).rejects.toThrow(/already approved/);
    jest.spyOn(plan_change, "findOne").mockResolvedValue(pending as never);
    await expect(svc().s.withdraw("p1", "u2")).rejects.toThrow(/Only the person who proposed/);
  });
  it("a second pending change for the same plan is refused", async () => {
    jest.spyOn(plan_catalog, "findOne").mockResolvedValue({ id: "cat1", price: 1999 } as never);
    jest.spyOn(plan_change, "findOne").mockResolvedValue(pending as never);
    await expect(svc().s.propose("cat1", { price: 2499 }, "official page", "u3")).rejects.toThrow(/already has a change waiting/);
  });
});

describe("WhatsApp template status", () => {
  it.each([
    ["APPROVED", "approved"],
    ["PENDING", "submitted"],
    ["REJECTED", "rejected"],
    ["PAUSED", "paused"],
    ["weird", "draft"],
  ])("Meta %s -> %s", (m, s) => expect(metaStatus(m)).toBe(s));

  it("a rejected or paused template is refused before Meta; unknown or approved ones go", async () => {
    jest.spyOn(wa_template, "find").mockImplementation((async (o: any) =>
      o.where.name === "conversation_rescue_1"
        ? [{ name: "conversation_rescue_1", language: "en_US", meta_status: "paused" }]
        : o.where.name === "agreed_follow_up"
          ? [{ name: "agreed_follow_up", language: "en", meta_status: "approved" }]
          : []) as never);
    await expect(assertTemplateUsable("conversation_rescue_1", "en")).rejects.toThrow("template conversation_rescue_1 is paused in Meta");
    await expect(assertTemplateUsable("agreed_follow_up", "en")).resolves.toBeUndefined();
    await expect(assertTemplateUsable("brand_new", "en")).resolves.toBeUndefined();
  });
});

describe("live events (console updates)", () => {
  it("a changed row -> topic and conversation id only, never row data", () => {
    expect(eventFor("message", { id: "m1", conversation_id: "v1", body: "secret health detail" })).toEqual({ topic: "message", conversation_id: "v1" });
    expect(eventFor("conversation", { id: "v2", state: "escalated" })).toEqual({ topic: "conversation", conversation_id: "v2" });
    expect(eventFor("booking_request", undefined)).toEqual({ topic: "booking", conversation_id: null });
    expect(eventFor("need", { conversation_id: "v1" })).toBeNull(); // no screen shows it
  });
  it("many changes in one turn -> one event per topic and conversation", async () => {
    jest.useFakeTimers();
    const live = new LiveEventsService({ subscribers: [] } as never);
    const got: unknown[] = [];
    live.stream().subscribe((e) => got.push(e));
    live.publish({ topic: "message", conversation_id: "v1" });
    live.publish({ topic: "message", conversation_id: "v1" });
    live.publish({ topic: "conversation", conversation_id: "v1" });
    jest.advanceTimersByTime(300);
    expect(got).toEqual([
      { topic: "message", conversation_id: "v1" },
      { topic: "conversation", conversation_id: "v1" },
    ]);
    jest.useRealTimers();
  });
});
