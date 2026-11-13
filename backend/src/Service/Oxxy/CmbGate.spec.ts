import {
  asksForCmb,
  cmbOfferText,
  gateComplete,
  isEligible,
  parseAmount,
} from "./CmbGate";
import { cmbWorthIt } from "./ValueCheck.service";

const row = (o: Record<string, string>) => ({
  booking_state: "none",
  registration_state: "none",
  treatment_state: "none",
  bill_state: "none",
  ...o,
});

describe("Cut Medi Bills gate (plan 8.2)", () => {
  it("is eligible only when nothing is booked, registered, started or billed", () => {
    expect(isEligible(row({}))).toBe(true);
    expect(isEligible(row({ booking_state: "done" }))).toBe(false);
    expect(isEligible(row({ registration_state: "done" }))).toBe(false);
    expect(isEligible(row({ treatment_state: "done" }))).toBe(false);
    expect(isEligible(row({ bill_state: "generated" }))).toBe(false);
    expect(isEligible(null)).toBe(false);
  });

  it("an unanswered gate is neither complete nor eligible", () => {
    const open = row({ treatment_state: "unknown", bill_state: "unknown" });
    expect(gateComplete(open)).toBe(false);
    expect(isEligible(open)).toBe(false);
    expect(gateComplete(row({}))).toBe(true);
  });

  it("spots an explicit ask", () => {
    expect(asksForCmb("tell me about Cut Medi Bills")).toBe(true);
    expect(asksForCmb("cut medical bill plan?")).toBe(true);
    expect(asksForCmb("CMB price")).toBe(true);
    expect(asksForCmb("I want to cut my bills")).toBe(false);
  });

  it("reads rough amounts", () => {
    expect(parseAmount("80,000")).toBe(80000);
    expect(parseAmount("around ₹1.5 lakh")).toBe(150000);
    expect(parseAmount("50k")).toBe(50000);
    expect(parseAmount("not sure")).toBeNull();
  });
});

describe("Cut Medi Bills value check (plan 1.1, 12.3)", () => {
  // break-even is about ₹19,664 in that month: 30% must beat 4,999 x 1.18 = 5,898.82
  it("uses the floor-to-500 illustration", () => {
    expect(cmbWorthIt(19664, 4999)).toEqual({ ok: false, saving: 5500 });
    expect(cmbWorthIt(20000, 4999)).toEqual({ ok: true, saving: 6000 });
  });

  it("offer text shows both prices, GST and no promise", () => {
    const t = cmbOfferText(80000, 24000, 4999, 19999, "5 to 10 working days");
    expect(t).toContain("₹4,999 a month");
    expect(t).toContain("₹19,999 one-time for one year");
    expect(t).toContain("plus applicable GST");
    expect(t).toContain("Activation takes 5 to 10 working days");
    expect(t).not.toMatch(/guarantee|confirmed|tie-?up|discount/i);
  });
});

describe("a YES ends the gate for that centre", () => {
  it("is failed after one YES even with questions left", () => {
    const { gateFailed } = jest.requireActual("./CmbGate");
    expect(gateFailed({ booking_state: "done", registration_state: "unknown", treatment_state: "unknown", bill_state: "unknown" })).toBe(true);
    expect(gateFailed({ booking_state: "none", registration_state: "unknown", treatment_state: "unknown", bill_state: "unknown" })).toBe(false);
  });
});
