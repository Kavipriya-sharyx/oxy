import { computeSaving, isWorthIt, pickPlan, PlanLike } from "./ValueCheck.service";

const plans: PlanLike[] = [
  { plan: "everyday", price: 999, max_saving_pct: 20, age_limit: 70, gst_rate: 0.18 },
  { plan: "vital", price: 1999, max_saving_pct: 25, age_limit: 75, gst_rate: 0.18 },
  { plan: "thrive", price: 2999, max_saving_pct: 30, age_limit: 80, gst_rate: 0.18 },
  { plan: "infinity", price: 3999, max_saving_pct: 30, age_limit: null, gst_rate: 0.18 },
];

describe("ValueCheck", () => {
  it("rounds saving down to the nearest 500", () => {
    expect(computeSaving(10000, 20)).toBe(2000);
    expect(computeSaving(12345, 25)).toBe(3000); // 3086 -> 3000
    expect(computeSaving(1000, 20)).toBe(0);
    expect(computeSaving(0, 20)).toBe(0);
  });

  it("recommends only if saving > price * 1.18", () => {
    expect(isWorthIt(1500, 999)).toBe(true); // 1178.82
    expect(isWorthIt(1000, 999)).toBe(false);
    expect(isWorthIt(1178.82, 999)).toBe(false);
  });

  it("returns null when no plan is worth it", () => {
    expect(pickPlan(3000, 40, plans)).toBeNull();
  });

  it("respects age limits", () => {
    // age 72 rules out everyday (70)
    const p = pickPlan(60000, 72, plans);
    expect(p?.plan).not.toBe("everyday");
    // age 90 leaves only infinity
    expect(pickPlan(100000, 90, plans)?.plan).toBe("infinity");
  });

  it("picks the best net plan", () => {
    const p = pickPlan(100000, 40, plans);
    expect(p).not.toBeNull();
    expect(p!.saving).toBe(30000);
    expect(p!.plan).toBe("thrive"); // 30000 - 2999*1.18 beats infinity (higher price, same saving)
  });
});
