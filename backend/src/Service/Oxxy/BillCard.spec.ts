import {
  billCard,
  billDiscount,
  billImageHeader,
  billResultCard,
  billCompareCard,
  pickedPlanCard,
  planFeaturesCard,
  plansListCard,
  readBillAmount,
  readPlanPick,
} from "./BillCard";
import { validateMessage } from "./WhatsappPayload";

describe("bill card helpers (client sequence 1)", () => {
  afterEach(() => {
    delete process.env.OXXY_BILL_IMAGE_URL;
    delete process.env.OXXY_WELCOME_IMAGE_URL;
  });

  it("every card is a message WhatsApp accepts, in every language", () => {
    process.env.OXXY_BILL_IMAGE_URL = "https://oxxy.example.in/oxxy-bill-card.jpg";
    for (const l of ["en", "hi", "hinglish"]) {
      for (const m of [
        billCard(l),
        billResultCard(150000, l),
        billCompareCard(l),
        plansListCard({ everyday: 10000, vital: 20000, thrive: 30000, infinity: 40000 }, l),
        pickedPlanCard("infinity", { yearly: 40000, monthly: 3999 }, l),
      ])
        expect(() => validateMessage(m)).not.toThrow();
    }
  });

  it("the picture: OXXY_BILL_IMAGE_URL, else next to the welcome image, else none", () => {
    expect(billImageHeader()).toBeUndefined();
    process.env.OXXY_WELCOME_IMAGE_URL = "https://oxxy.sharyx.ai/logo.png";
    expect(billImageHeader()).toEqual({
      type: "image",
      link: "https://oxxy.sharyx.ai/oxxy-bill-card.jpg",
    });
    process.env.OXXY_BILL_IMAGE_URL = "https://cdn.example.in/card.jpg";
    expect(billImageHeader()).toEqual({ type: "image", link: "https://cdn.example.in/card.jpg" });
  });

  it("Learn More carries the client's comparison picture (20 Nov)", () => {
    expect((billCompareCard("en") as { header?: unknown }).header).toBeUndefined();
    process.env.OXXY_WELCOME_IMAGE_URL = "https://oxxy.sharyx.ai/logo.png";
    expect((billCompareCard("en") as { header?: unknown }).header).toEqual({
      type: "image",
      link: "https://oxxy.sharyx.ai/oxxy-compare-card.jpg",
    });
  });

  it("reads bill amounts", () => {
    expect(readBillAmount("10000")).toBe(10000);
    expect(readBillAmount("₹25,000")).toBe(25000);
    expect(readBillAmount("1.5 lakh")).toBe(150000);
    expect(readBillAmount("50k")).toBe(50000);
    expect(readBillAmount("20000 per month")).toBe(20000); // one bill, never x12
    expect(readBillAmount("hmm")).toBeNull();
    expect(readBillAmount("60")).toBeNull();
    // client's live chat, 22 Nov: "1.5" after "for example 10000 or 1.5 lakh"
    expect(readBillAmount("1.5")).toBe(150000);
    expect(readBillAmount("2.25")).toBe(225000);
    expect(readBillAmount("₹ 1.5")).toBe(150000);
    expect(readBillAmount("1500.50")).toBe(1501); // a normal amount, not lakh
  });

  it("the Meta template oxxy_learn_more has the same text as the Learn More card (22 Nov)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TEMPLATES } = require("@Helper/TemplateDefinitions");
    const t = TEMPLATES.find((x: { name: string }) => x.name === "oxxy_learn_more");
    expect(t.body).toBe((billCompareCard("en") as { body: string }).body);
    expect(t.body.length).toBeLessThanOrEqual(1024);
  });

  it("30% of the bill, whole rupees", () => {
    expect(billDiscount(10000)).toEqual({ discount: 3000, pay: 7000 });
    expect(billDiscount(12345)).toEqual({ discount: 3703, pay: 8642 });
  });

  it("reads a plan pick (row id or typed name)", () => {
    expect(readPlanPick("plan_thrive")).toBe("thrive");
    expect(readPlanPick("Oxxy Infinity")).toBe("infinity");
    expect(readPlanPick("tell me about the price of medicines today please")).toBeNull();
  });
});

describe("View Plan Features (client, 21 Nov)", () => {
  it("is the last row of the plans list and shows all four plans with Choose a Plan / Main Menu", () => {
    const list = plansListCard({}) as { rows: { id: string; title: string }[] };
    expect(list.rows.at(-1)).toMatchObject({ id: "plan_features", title: "View Plan Features" });
    for (const lg of ["en", "hi", "hinglish"]) {
      const c = planFeaturesCard(lg) as any;
      expect(validateMessage(c)).toBeUndefined();
      expect(c.body.length).toBeLessThanOrEqual(1024);
      for (const p of ["Everyday", "Vital", "Thrive", "Infinity"]) expect(c.body).toContain(`Oxxy ${p}`);
      expect(c.buttons.map((b: { id: string }) => b.id)).toEqual(["bill_activate", "flow_menu"]);
    }
  });
});
