import { validateReply } from "./ReplyValidator.service";

const prices = [999, 1179, 1999, 2359, 4999, 19999];
const bad = (t: string) => validateReply(t, prices).ok;

describe("ReplyValidator", () => {
  it("accepts a clean reply", () => {
    expect(bad("Which city are you in? We can look at the Vital plan.")).toBe(true);
  });
  it("accepts catalog prices (with and without GST)", () => {
    expect(bad("Vital is \u20b91,999 per year, \u20b92,359 with GST.")).toBe(true);
    expect(bad("Cut Medi Bills is Rs. 4999 per month.")).toBe(true);
  });
  it("rejects insurance", () => {
    expect(bad("This is like health Insurance.")).toBe(false);
  });
  it("rejects savings and discount promises", () => {
    expect(bad("You will save a lot.")).toBe(false);
    expect(bad("Get 20% off today")).toBe(false);
    expect(bad("We give a discount")).toBe(false);
  });
  it("rejects 'confirmed'", () => {
    expect(bad("Your booking is confirmed.")).toBe(false);
  });
  it("rejects tie-ups", () => {
    expect(bad("We have a tie-up with this hospital.")).toBe(false);
    expect(bad("We are partnered with Apollo.")).toBe(false);
  });
  it("rejects offering both products", () => {
    expect(bad("Choose Oxxy or Cut Medi Bills.")).toBe(false);
  });
  it("rejects prices not in the catalog", () => {
    const r = validateReply("It costs \u20b9 1,500 per year.", prices);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("1500");
  });
});
