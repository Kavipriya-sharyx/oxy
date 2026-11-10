import { bookingWindow, todayIST, validateBookingDate } from "./DateWindow.service";

// 2026-03-10 10:00 IST
const NOW = new Date("2026-03-10T04:30:00Z");

describe("DateWindow", () => {
  it("uses the Asia/Kolkata date", () => {
    // 20:00 UTC on the 10th is already the 11th in India
    expect(todayIST(new Date("2026-03-10T20:00:00Z"))).toBe("2026-03-11");
    expect(todayIST(NOW)).toBe("2026-03-10");
  });

  it("window is today+3 days to today+6 months", () => {
    expect(bookingWindow(NOW)).toEqual({ min: "2026-03-13", max: "2026-09-10" });
  });

  it("clamps month end", () => {
    expect(bookingWindow(new Date("2026-08-31T06:00:00Z")).max).toBe("2027-02-28");
  });

  it("accepts the boundaries", () => {
    expect(validateBookingDate("2026-03-13", NOW).valid).toBe(true);
    expect(validateBookingDate("2026-09-10", NOW).valid).toBe(true);
  });

  it("rejects too soon, too far and invalid dates", () => {
    expect(validateBookingDate("2026-03-12", NOW)).toMatchObject({
      valid: false,
      reason: "too_soon",
    });
    expect(validateBookingDate("2026-09-11", NOW)).toMatchObject({
      valid: false,
      reason: "too_far",
    });
    expect(validateBookingDate("2026-02-30", NOW)).toMatchObject({
      valid: false,
      reason: "invalid_date",
    });
    expect(validateBookingDate("tomorrow", NOW)).toMatchObject({
      valid: false,
      reason: "invalid_date",
    });
  });
});
