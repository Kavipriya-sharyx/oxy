import {
  cmbWorthIt,
  computeSaving,
  isWorthIt,
  needLevel,
  PlanLike,
  recommendPlan,
} from "./ValueCheck.service";

// yearly prices and rates from Full Development Plan 1.1
const plans: PlanLike[] = [
  {
    plan: "everyday",
    price: 10000,
    illustration_pct: 20,
    max_saving_pct: 20,
    age_limit: 70,
    gst_rate: 0.18,
  },
  {
    plan: "vital",
    price: 20000,
    illustration_pct: 25,
    max_saving_pct: 25,
    age_limit: 75,
    gst_rate: 0.18,
  },
  {
    plan: "thrive",
    price: 30000,
    illustration_pct: 30,
    max_saving_pct: 30,
    age_limit: 80,
    gst_rate: 0.18,
  },
  {
    plan: "infinity",
    price: 40000,
    illustration_pct: 30,
    max_saving_pct: 40,
    age_limit: null,
    gst_rate: 0.18,
  },
];

describe("ValueCheck", () => {
  it("rounds saving down to the nearest 500", () => {
    expect(computeSaving(10000, 20)).toBe(2000);
    expect(computeSaving(12345, 25)).toBe(3000);
    expect(computeSaving(0, 20)).toBe(0);
  });

  it("recommends only if saving > yearly price x 1.18", () => {
    expect(isWorthIt(12000, 10000)).toBe(true); // 11,800
    expect(isWorthIt(11800, 10000)).toBe(false);
  });

  it("matches the break-even spends in the plan", () => {
    // Everyday break-even 59,000: 59,000 x 20% = 11,800 (not more), 60,000 passes
    expect(recommendPlan(59000, 40, "routine check-up", plans)).toMatchObject({
      status: "not_worth_it",
      plan: "everyday",
    });
    expect(recommendPlan(60000, 40, "routine check-up", plans)).toMatchObject({
      status: "recommend",
      plan: "everyday",
      saving: 12000,
    });
  });

  it("asks the age before naming a plan", () => {
    expect(recommendPlan(160000, null, "heart surgery", plans)).toEqual({ status: "ask_age" });
  });

  it("picks by need, then moves up when the age rules a plan out", () => {
    expect(needLevel("knee check-up")).toBe(0);
    expect(needLevel("hospital stay")).toBe(1);
    expect(needLevel("diabetes care")).toBe(2);
    expect(needLevel("heart surgery")).toBe(3);
    expect(recommendPlan(100000, 50, "hospital stay", plans)).toMatchObject({
      plan: "vital",
      saving: 25000,
    });
    // check-up but age 72: Everyday (70) is ruled out, so Vital
    expect(recommendPlan(120000, 72, "check-up", plans)).toMatchObject({ plan: "vital" });
  });

  it("illustrates Infinity at 30%, not the 40% 'up to' figure", () => {
    expect(recommendPlan(300000, 85, "cardiac care", plans)).toMatchObject({
      plan: "infinity",
      saving: 90000,
      rate: 30,
    });
  });

  it("falls back to a cheaper suitable plan, else the honest answer", () => {
    // Thrive needs > 1,18,000; at 70,000 Thrive and Vital fail, Everyday passes
    expect(recommendPlan(70000, 40, "diabetes", plans)).toMatchObject({ plan: "everyday" });
    expect(recommendPlan(15000, 40, "fever", plans)).toMatchObject({
      status: "not_worth_it",
      plan: "everyday",
      spend: 15000,
    });
  });

  it("checks Cut Medi Bills against the monthly price + GST", () => {
    expect(cmbWorthIt(180000, 4999)).toEqual({ ok: true, saving: 54000 });
    expect(cmbWorthIt(15000, 4999).ok).toBe(false); // 4,500 < 5,899
  });
});
