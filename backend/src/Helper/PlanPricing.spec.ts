// The client's "Monthly & Annual Plan Pricing Calculation Logic" (17 Nov 2026): every figure in its tables and examples.
import { familyTotal, firstPlan, firstPlanLines, priceFigures, subsequentPlan, subsequentPlanLines } from "./PlanPricing";
import { familyCard, familyBillingQuestion, planCard } from "@Service/Oxxy/GuidedFlow";
import { disclosureText } from "./PlanReplies";
import { validateMessage } from "@Service/Oxxy/WhatsappPayload";

describe("pricing document 3 / 4: first plan = cost + 18% GST", () => {
  it.each([
    [999, 180, 1179],
    [1999, 360, 2359],
    [2999, 540, 3539],
    [3999, 720, 4719],
    [10000, 1800, 11800],
    [20000, 3600, 23600],
    [30000, 5400, 35400],
    [40000, 7200, 47200],
  ])("₹%i + ₹%i = ₹%i", (cost, gst, total) => expect(firstPlan(cost)).toEqual({ cost, gst, total }));
});

describe("pricing document 7 / 8 / 10 / 12: second plan onwards = 30% off the cost, GST on the discounted cost", () => {
  it.each([
    [999, 300, 699, 126, 825],
    [1999, 600, 1399, 252, 1651],
    [2999, 900, 2099, 378, 2477],
    [3999, 1200, 2799, 504, 3303],
    [10000, 3000, 7000, 1260, 8260],
    [20000, 6000, 14000, 2520, 16520],
    [30000, 9000, 21000, 3780, 24780],
    [40000, 12000, 28000, 5040, 33040],
  ])("₹%i − ₹%i = ₹%i + ₹%i = ₹%i", (original, discount, cost, gst, total) =>
    expect(subsequentPlan(original)).toEqual({ original, discount, cost, gst, total }),
  );
  it("the 30% never touches the GST, and every shown figure adds up (doc 11: whole rupees)", () => {
    for (const c of [999, 1999, 2999, 3999, 10000, 20000, 30000, 40000]) {
      const s = subsequentPlan(c);
      expect(s.original - s.discount).toBe(s.cost);
      expect(s.cost + s.gst).toBe(s.total);
      expect(s.gst).toBe(Math.round(c * 0.7 * 0.18));
    }
    expect(familyTotal(10000, 2)).toBe(11800 + 2 * 8260);
  });
  it("the validator knows every figure", () => {
    expect(priceFigures(999)).toEqual(expect.arrayContaining([999, 180, 1179, 300, 699, 126, 825]));
  });
});

describe("pricing document 9: display format", () => {
  it("first plan", () => {
    expect(firstPlanLines(999)).toEqual(["Plan cost: ₹999", "+ GST (18%): ₹180", "= Final payable: ₹1,179"]);
  });
  it("second plan onwards", () => {
    expect(subsequentPlanLines(999)).toEqual([
      "Original plan cost: ₹999",
      "− 30% discount: ₹300",
      "= Discounted plan cost: ₹699",
      "+ GST (18%): ₹126",
      "= Final payable: ₹825",
    ]);
  });
  it("the activation disclosure shows the final payable before the link question", () => {
    const t = disclosureText("Oxxy Everyday plan", 999, "monthly", "Renews monthly", "5 to 10 working days");
    expect(t).toContain("Selected: Oxxy Everyday plan (monthly)\nPlan cost: ₹999\n+ GST (18%): ₹180\n= Final payable: ₹1,179 a month");
    expect(t).toMatch(/Reply YES or NO\.$/);
  });
  it("every card fits WhatsApp's limits in every language (buttons, 1024 characters)", () => {
    for (const l of ["en", "hi", "hinglish"])
      for (const plan of ["everyday", "vital", "thrive", "infinity"] as const) {
        const price = { monthly: 3999, yearly: 40000 };
        expect(() => validateMessage(planCard(plan, price, { who: "parents", age: 65 }, l))).not.toThrow();
        expect(() => validateMessage(familyBillingQuestion(plan, 3, l))).not.toThrow();
        for (const b of ["yearly", "monthly"] as const)
          expect(() => validateMessage(familyCard(plan, price, 3, l, b))).not.toThrow();
        expect(() => validateMessage({ kind: "buttons", body: disclosureText(`Oxxy ${plan} plan`, 40000, "yearly", "Valid for one year", "5 to 10 working days", l), buttons: [{ id: "yes", title: "Yes" }, { id: "no", title: "No" }] })).not.toThrow();
      }
  });
});
