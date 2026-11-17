// The voice-aligned button flow (client, 17 Nov): messages valid for WhatsApp, readers, plan, savings, prices
import {
  familyCard,
  familyPrice,
  flowFamily,
  flowStep,
  pickPlan,
  planCard,
  readCondition,
  readNeed,
  readWho,
  roundedSaving,
  savingsCard,
  stepMessage,
  verifyCard,
  welcomeCard,
  websiteCard,
  NEED_LABEL,
  CONDITION_LABEL,
} from "./GuidedFlow";
import { buildPayload, validateMessage } from "./WhatsappPayload";
import { metaTemplateBody, TEMPLATES } from "@Helper/TemplateDefinitions";

describe("every flow message is one WhatsApp accepts", () => {
  const steps = ["who", "need", "condition", "age", "city", "insurance", "spend"] as const;
  it.each(steps)("step %s", (st) => expect(() => validateMessage(stepMessage(st))).not.toThrow());
  it("welcome, website, verify, savings, plan, family cards", () => {
    for (const m of [
      welcomeCard(),
      websiteCard(),
      verifyCard(),
      savingsCard(50000),
      planCard("infinity", { monthly: 3999, yearly: 40000 }, { who: "parents" }),
      familyCard("everyday", { monthly: 999, yearly: 10000 }, 2),
    ])
      expect(() => validateMessage(m)).not.toThrow();
  });
  it("the welcome card is the client's text with a logo header when OXXY_WELCOME_IMAGE_URL is set", () => {
    process.env.OXXY_WELCOME_IMAGE_URL = "https://www.oxxy.in/logo.png";
    const p = buildPayload("919800000001", welcomeCard()) as any;
    expect(p.interactive.header).toEqual({ type: "image", image: { link: "https://www.oxxy.in/logo.png" } });
    expect(p.interactive.body.text).toContain("Welcome to Oxxy HealthCare!");
    expect(p.interactive.action.buttons.map((b: any) => b.reply.title)).toEqual(["Get Started", "Visit Our Website", "Contact Us"]);
    delete process.env.OXXY_WELCOME_IMAGE_URL;
  });
  it("the link button goes out as cta_url", () => {
    const p = buildPayload("919800000001", savingsCard(50000)) as any;
    expect(p.interactive.type).toBe("cta_url");
    expect(p.interactive.action.parameters).toEqual({ display_text: "Calculate Now", url: "https://www.oxxy.in/plan_calculator" });
  });
});

describe("savings (Voice manual 20)", () => {
  it.each([
    [50000, 15000],
    [83000, 24500],
    [100000, 30000],
    [275000, 82500],
    [4000, 1000],
    [1000, 0],
  ])("%d a year -> up to %d", (spend, save) => expect(roundedSaving(spend)).toBe(save));
  it("the card says 'save up to', never 'may not pay for itself'", () => {
    const m = savingsCard(50000) as { body: string };
    expect(m.body).toContain("Oxxy can help you save up to ₹15,000");
    expect(m.body).not.toMatch(/pay for itself/);
  });
});

describe("price + GST and the family discount (pricing document)", () => {
  it("first plan and subsequent plan, as in the document's examples", () => {
    const y = familyPrice(10000, 1);
    expect(y.first).toEqual({ cost: 10000, gst: 1800, total: 11800 });
    expect(y.next).toEqual({ cost: 7000, discount: 3000, gst: 1260, total: 8260 });
    expect(y.total).toBe(20060);
    const mth = familyPrice(999, 1);
    expect(mth.first.total).toBe(1179);
    expect(mth.next).toEqual({ cost: 699, discount: 300, gst: 126, total: 825 });
  });
  it("the plan card shows cost + GST = payable", () => {
    const m = planCard("infinity", { monthly: 3999, yearly: 40000 }, {}) as { body: string };
    // pricing document 9: Plan cost / + GST / = Final payable
    expect(m.body).toContain("Yearly\nPlan cost: ₹40,000\n+ GST (18%): ₹7,200\n= Final payable: ₹47,200 a year");
    expect(m.body).toContain("Monthly\nPlan cost: ₹3,999\n+ GST (18%): ₹720\n= Final payable: ₹4,719 a month");
  });
});

describe("one plan, the voice manual's way", () => {
  it.each([
    [{ who: "parents", age: 65, need: "consult", spend: 20000 }, "infinity"],
    [{ who: "self", age: 85, need: "consult", spend: 5000 }, "infinity"],
    [{ who: "self", age: 40, need: "surgery", spend: 50000 }, "infinity"],
    [{ who: "self", age: 30, need: "pregnancy", spend: 50000 }, "infinity"],
    [{ who: "self", age: 45, need: "consult", condition: "cancer", spend: 50000 }, "infinity"],
    [{ who: "self", age: 45, need: "medicines", condition: "sugar", spend: 30000 }, "thrive"],
    [{ who: "self", age: 45, need: "hospital", spend: 50000 }, "vital"],
    [{ who: "self", age: 35, need: "consult", spend: 20000 }, "everyday"],
    [{ who: "self", age: 72, need: "consult", spend: 20000 }, "vital"],
    [{ who: "family", age: 40, need: "consult", spend: 300000 }, "infinity"],
  ] as const)("%j -> %s", (f, plan) => expect(pickPlan(f as any)).toBe(plan));
});

describe("answers: a tap or typed words", () => {
  it("who / need / condition", () => {
    expect(readWho("who_parents")).toBe("parents");
    expect(readWho("my mother")).toBe("parent");
    expect(readNeed("need_surgery")).toBe("surgery");
    expect(readNeed("blood test")).toBe("pathlab");
    expect(readCondition("cond_none")).toBe("none");
    expect(readCondition("sugar")).toBe("sugar");
  });
  it("the stored labels read back to the same answer (the plan is picked from the stored row)", () => {
    for (const [k, label] of Object.entries(NEED_LABEL)) {
      const back = readNeed(label);
      expect(k === "all" ? ["all", "hospital"] : [k]).toContain(back);
    }
    for (const [k, label] of Object.entries(CONDITION_LABEL)) if (label) expect(readCondition(label)).toBe(k);
  });
  it("pending markers", () => {
    expect(flowStep("flow:close:2")).toBe("close");
    expect(flowFamily("flow:close:2")).toBe(2);
    expect(flowStep("plan_age")).toBeNull();
  });
});

describe("new templates for Meta", () => {
  it("the five templates exist with valid Meta bodies (image header only with an uploaded handle)", () => {
    const names = ["oxxy_welcome", "oxxy_verify_services", "oxxy_savings_calculator", "oxxy_plan_recommendation", "oxxy_terms"];
    for (const n of names) {
      const t = TEMPLATES.find((x) => x.name === n)!;
      expect(t).toBeDefined();
      const body = metaTemplateBody(t, "h-123") as any;
      const btn = body.components.find((c: any) => c.type === "BUTTONS");
      expect(btn.buttons.length).toBeLessThanOrEqual(10);
      for (const b of btn.buttons) expect(b.text.length).toBeLessThanOrEqual(25);
      if (t.headerImage) expect(body.components[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["h-123"] } });
      const text = body.components.find((c: any) => c.type === "BODY").text as string;
      expect(text.length).toBeLessThanOrEqual(1024);
      expect(text).not.toMatch(/^\{\{|\}\}$/); // Meta: no variable at the start or the end
    }
  });
});
