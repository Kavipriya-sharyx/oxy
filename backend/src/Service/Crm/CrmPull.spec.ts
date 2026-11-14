import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { change_event } from "@Database/Table/Crm/change_event";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { task } from "@Database/Table/Oxxy/task";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { ChangeFeedService, feedType } from "./ChangeFeed.service";
import { CrmOutboxService } from "./CrmOutbox.service";
import { CrmPullService, mapApplyError, pageLimit } from "./CrmPull.service";

afterEach(() => jest.restoreAllMocks());

const ID = "11111111-1111-1111-1111-111111111111";

describe("changes feed (CRM pulls)", () => {
  it("names outbox actions like the webhook events", () => {
    expect(feedType(CrmAction.CreateBookingRequest)).toBe("booking.created");
    expect(feedType(CrmAction.ConfirmBooking)).toBe("booking.confirmed");
    expect(feedType(CrmAction.UpsertCustomer)).toBe("customer.updated");
    expect(feedType(CrmAction.CreateTask)).toBe("task.created");
    expect(feedType(CrmAction.SetOptOut)).toBe("customer.opted_out");
    expect(feedType(CrmAction.LogEvent, { event: "trigger" })).toBe("trigger.fired");
    expect(feedType(CrmAction.LogEvent, { event: "consent" })).toBe("consent.changed");
    expect(feedType(CrmAction.LogEvent, { event: "activation_declined" })).toBe(
      "activation.declined",
    );
  });

  it("records every change even when CRM push is off, inside the same transaction", async () => {
    const feed = new ChangeFeedService();
    const insert = jest.fn(async () => undefined);
    const save = jest.fn();
    const svc = new CrmOutboxService({ get: () => false } as never, {} as never, feed);
    const row = await svc.enqueue(
      { insert, save, create: jest.fn() } as never,
      CrmAction.CreateTask,
      "c1",
      { task_id: "t1" },
    );
    expect(row).toBeNull(); // no outbox row: nothing is pushed
    expect(save).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(change_event, {
      type: "task.created",
      customer_id: "c1",
      payload: { task_id: "t1" },
    });
  });

  it("never breaks the bot change when the feed write fails", async () => {
    const feed = new ChangeFeedService();
    const insert = jest.fn(async () => {
      throw new Error("db down");
    });
    await expect(feed.record({ insert } as never, "x", null, {})).resolves.toBeUndefined();
  });

  it("pages by seq with a cursor", async () => {
    const rows = [1, 2, 3].map((n) => ({
      seq: String(n),
      type: "booking.created",
      customer_id: "c1",
      payload: { n },
      created_on: new Date(),
    }));
    const qb: any = {
      where: () => qb,
      orderBy: () => qb,
      take: () => qb,
      getMany: async () => rows,
    };
    jest.spyOn(change_event, "createQueryBuilder").mockReturnValue(qb);
    const page = await new ChangeFeedService().list(0, 2);
    expect(page.changes.map((c) => c.seq)).toEqual([1, 2]);
    expect(page).toMatchObject({ next_after: 2, has_more: true });
    const empty: any = {
      where: () => empty,
      orderBy: () => empty,
      take: () => empty,
      getMany: async () => [],
    };
    jest.spyOn(change_event, "createQueryBuilder").mockReturnValue(empty);
    expect(await new ChangeFeedService().list(7, 2)).toMatchObject({
      changes: [],
      next_after: 7,
      has_more: false,
    });
  });
});

describe("CRM pull API", () => {
  const apply = jest.fn(async () => undefined);
  const svc = () => new CrmPullService(new ChangeFeedService(), { apply } as never);
  beforeEach(() => apply.mockClear());

  it("limits and maps errors", () => {
    expect(pageLimit(undefined)).toBe(100);
    expect(pageLimit("9999")).toBe(500);
    expect(pageLimit("-1")).toBe(100);
    expect(mapApplyError(new Error("booking not found"))).toBeInstanceOf(NotFoundException);
    expect(mapApplyError(new Error("date out of window: 2026-11-15"))).toBeInstanceOf(
      BadRequestException,
    );
    expect(mapApplyError(new Error("missing preferred_date"))).toBeInstanceOf(BadRequestException);
  });

  it("confirm needs the sales person's name and a pending booking", async () => {
    const b: any = { id: ID, booking_status: "pending_confirmation", preferred_date: "2026-11-25" };
    jest.spyOn(booking_request, "findOne").mockResolvedValue(b);
    await expect(svc().confirmBooking(ID, {})).rejects.toBeInstanceOf(BadRequestException);
    const r = await svc().confirmBooking(ID, {
      confirmed_by: "Priya (sales)",
      crm_booking_id: "BK-1",
    });
    expect(apply).toHaveBeenCalledWith(
      "booking.confirmed",
      expect.objectContaining({
        booking_id: ID,
        confirmed_by_name: "Priya (sales)",
        crm_booking_id: "BK-1",
      }),
    );
    expect(r.booking_request_id).toBe(ID);
    b.booking_status = "confirmed";
    await expect(svc().confirmBooking(ID, { confirmed_by: "Priya" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("unknown or bad ids are 404 / 400, never a crash", async () => {
    jest.spyOn(booking_request, "findOne").mockResolvedValue(null);
    await expect(svc().cancelBooking(ID, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc().cancelBooking("abc", {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reschedule passes the date to the shared handler and maps its window error", async () => {
    jest
      .spyOn(booking_request, "findOne")
      .mockResolvedValue({ id: ID, booking_status: "pending_confirmation" } as any);
    apply.mockRejectedValueOnce(new Error("date out of window: 2026-11-15"));
    await expect(
      svc().rescheduleBooking(ID, { preferred_date: "2026-11-15" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(apply).toHaveBeenCalledWith(
      "booking.rescheduled",
      expect.objectContaining({ preferred_date: "2026-11-15" }),
    );
  });

  it("payment result must be paid, failed or refunded; paid twice is harmless", async () => {
    const a: any = { id: ID, payment_status: "pending", activation_status: "pending" };
    jest.spyOn(activation, "findOne").mockResolvedValue(a);
    await expect(svc().recordPayment(ID, { result: "maybe" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await svc().recordPayment(ID, { result: "refunded" });
    expect(apply).toHaveBeenCalledWith(
      "activation.refunded",
      expect.objectContaining({ activation_id: ID }),
    );
    a.payment_status = "paid";
    expect(await svc().recordPayment(ID, { result: "paid" })).toMatchObject({ already: true });
  });

  it("completing a done task changes nothing", async () => {
    jest.spyOn(task, "findOne").mockResolvedValue({ id: ID, task_status: "done" } as any);
    expect(await svc().completeTask(ID, {})).toMatchObject({ already_done: true });
    expect(apply).not.toHaveBeenCalled();
  });
});
