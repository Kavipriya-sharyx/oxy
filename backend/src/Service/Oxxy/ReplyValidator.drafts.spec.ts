import { checkMessageLimits, validateReply, ValidationContext } from "./ReplyValidator.service";
import { NEUTRAL_SAVINGS_LINE } from "@Helper/FixedReplies";
import { openingList } from "@Helper/OpeningMenu";
import { OutboundMessage } from "@Helper/WhatsappMessage";

const prices = [999, 1179, 1999, 2359, 4999, 19999];
const plans = [
  { name: "everyday", product: "oxxy" },
  { name: "vital", product: "oxxy" },
  { name: "thrive", product: "oxxy" },
  { name: "infinity", product: "oxxy" },
  { name: "cut_medi_bills", product: "cut_medi_bills" },
];
const ctx: ValidationContext = { plans };
const check = (t: string, c: ValidationContext = ctx) => validateReply(t, prices, c);
const rejected = (t: string, c: ValidationContext = ctx) => check(t, c).reasons;

describe("a Claude draft is rejected when it breaks a rule", () => {
  describe("plan names only from the catalog", () => {
    const unknownPlans = [
      "The Platinum plan suits you best.",
      "Our Gold plan covers your needs.",
      "Try the Premium Plan.",
      "We have a plan called Starter.",
      "Elite membership is available.",
      "The Basic plan is cheaper.",
      "Have a look at the Family plan.",
    ];
    it.each(unknownPlans)("rejects an unknown plan name: %p", (t) =>
      expect(rejected(t).some((r) => r.startsWith("plan name not in catalog"))).toBe(true),
    );

    it("names the offending plan in the reason", () => {
      expect(rejected("The Platinum plan suits you.")).toContain(
        "plan name not in catalog: platinum",
      );
    });

    it.each([
      "The Vital plan is a good fit.",
      "We have Everyday, Vital, Thrive and Infinity plans.",
      "Which plan would you like to know about?",
      "That is the right plan for you.",
      "Cut Medi Bills plan works monthly.",
      "Which city are you in?",
    ])("accepts catalog names and plain words: %p", (t) => expect(check(t).ok).toBe(true));

    it("an empty catalog means no plan name is allowed", () => {
      expect(check("The Vital plan is a good fit.", { plans: [] }).ok).toBe(false);
    });
  });

  describe("prices only from the catalog", () => {
    it.each(["It costs ₹1,500 a year.", "Rs. 2500 only.", "INR 12,345 per month", "₹ 1,998"])(
      "rejects a price that is not in the catalog: %p",
      (t) => expect(rejected(t).some((r) => r.startsWith("price not in catalog"))).toBe(true),
    );
    it.each(["Vital is ₹1,999 a year.", "₹2,359 with GST", "Rs. 4999"])(
      "accepts catalog prices: %p",
      (t) => expect(check(t).ok).toBe(true),
    );
  });

  describe("never the word insurance", () => {
    it.each([
      "This is like health insurance.",
      "INSURANCE is not needed.",
      "It works with your Insurance.",
      "health-insurance alternative",
      "यह एक इंश्योरेंस प्लान है",
      "यह बीमा जैसा है",
      "Yeh bima jaisa hai",
    ])("rejects: %p", (t) => expect(rejected(t)).toContain("mentions insurance"));

    it.each([
      "Mujhe bimari ke baare mein batayein",
      "आपको कौन सी बीमारी है",
      "Do you need a centre?",
    ])("does not flag an unrelated word: %p", (t) =>
      expect(rejected(t)).not.toContain("mentions insurance"),
    );
  });

  describe("one product per customer", () => {
    it("rejects both products in one reply", () => {
      expect(rejected("Choose Oxxy or Cut Medi Bills.")).toContain("offers both products");
    });
    it("a customer on Oxxy hears nothing about Cut Medi Bills", () => {
      expect(
        rejected("Cut Medi Bills could also work for you.", { plans, lockedProduct: "oxxy" }),
      ).toContain("offers a second product");
    });
    it("a customer on Cut Medi Bills hears nothing about the Oxxy plans", () => {
      for (const t of [
        "The Vital plan is nice.",
        "Our Oxxy plans start small.",
        "Thrive plan gives more.",
      ]) {
        expect(rejected(t, { plans, lockedProduct: "cut_medi_bills" })).toContain(
          "offers a second product",
        );
      }
    });
    it("the customer's own product is fine", () => {
      expect(check("The Vital plan is a good fit.", { plans, lockedProduct: "oxxy" }).ok).toBe(
        true,
      );
      expect(
        check("Cut Medi Bills works monthly.", { plans, lockedProduct: "cut_medi_bills" }).ok,
      ).toBe(true);
    });
  });

  describe("the neutral savings line is the only savings wording", () => {
    it.each([
      "You will save a lot with this.",
      "Get 20% off today.",
      "We offer a discount.",
      "Enjoy cashback on every bill.",
      "Guaranteed savings every month.",
    ])("rejects saving or discount talk: %p", (t) =>
      expect(rejected(t)).toContain("promises savings or discounts"),
    );

    it.each(Object.entries(NEUTRAL_SAVINGS_LINE))(
      "lets the neutral line through word for word (%s)",
      (_l, line) => {
        expect(check(line).ok).toBe(true);
        expect(check(`Here is the plan. ${line}`).ok).toBe(true);
      },
    );

    it("the neutral line does not cover other savings wording next to it", () => {
      const line = NEUTRAL_SAVINGS_LINE.en;
      expect(rejected(`${line} You will save 30% though.`)).toContain(
        "promises savings or discounts",
      );
    });

    it("a reworded line is not the neutral line", () => {
      expect(rejected("Any illustrated saving is guaranteed for you.")).toContain(
        "promises savings or discounts",
      );
    });
  });

  describe("other fixed rules", () => {
    it.each([
      "Verify us at https://fake-oxxy.biz/pay before paying.",
      "Please visit www.oxxy.in for details.",
      "Our site oxxy.in has everything.",
      "Write to info@oxxy.in.",
    ])("rejects a link written by the model: %p", (t) => expect(rejected(t)).toContain("contains a link"));
    it("does not see a link in normal text", () => {
      expect(check("e.g. a check-up. Dr. Rao is fine.").reasons).not.toContain("contains a link");
    });
    it("rejects 'confirmed' and tie-ups", () => {
      expect(rejected("Your booking is confirmed.")).toContain("says a booking is confirmed");
      expect(rejected("We have a tie-up with this hospital.")).toContain("mentions tie-ups");
    });
    it("rejects a reply over the WhatsApp text limit", () => {
      expect(rejected("a".repeat(4097)).some((r) => r.includes("over 4096"))).toBe(true);
      expect(check("a".repeat(4096)).ok).toBe(true);
    });
  });
});

describe("button and list limits", () => {
  const btn = (n: number, title = "OK"): OutboundMessage => ({
    kind: "buttons",
    body: "Pick one",
    buttons: Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title })),
  });
  const list = (
    rows: number,
    rowTitle = "Row",
    extra: Partial<{ buttonLabel: string; body: string }> = {},
  ): OutboundMessage => ({
    kind: "list",
    body: extra.body ?? "Pick one",
    buttonLabel: extra.buttonLabel ?? "Choose",
    rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, title: rowTitle })),
  });

  it.each<[string, OutboundMessage]>([
    ["4 buttons", btn(4)],
    ["no buttons", btn(0)],
    ["a button title of 21 characters", btn(1, "x".repeat(21))],
    ["11 list rows", list(11)],
    ["no list rows", list(0)],
    ["a list row title of 25 characters", list(2, "x".repeat(25))],
    ["a list button label of 21 characters", list(2, "Row", { buttonLabel: "x".repeat(21) })],
    ["a list body over 1024 characters", list(2, "Row", { body: "x".repeat(1025) })],
    ["a text body over 4096 characters", { kind: "text", body: "x".repeat(4097) }],
  ])("rejects %s", (_n, msg) => {
    const r = checkMessageLimits(msg);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
  });

  it.each<[string, OutboundMessage]>([
    ["3 buttons of 20 characters", btn(3, "x".repeat(20))],
    ["10 list rows of 24 characters", list(10, "x".repeat(24))],
    ["the opening list (all languages)", openingList("en")],
    ["the Hindi opening list", openingList("hi")],
  ])("accepts %s", (_n, msg) => expect(checkMessageLimits(msg).ok).toBe(true));
});

describe("approved wording from the Full Development Plan is not blocked", () => {
  const ok = (t: string) => validateReply(t, [10000, 11800, 4999, 5899]);
  it.each([
    "Cut Medi Bills is Oxxy’s quick medical-savings service for an upcoming requirement.",
    "Your booking request is recorded. It is pending confirmation.",
    "The team will confirm the slot with the centre.",
    "Any illustrated saving depends on your own medical spend and is not guaranteed.",
  ])("%s", (t) => {
    expect(ok(t).reasons.filter((r) => r !== "promises savings or discounts")).toEqual([]);
  });
  it("still rejects a claim that the booking is confirmed", () => {
    expect(ok("Great news, your booking is confirmed for Friday.").reasons).toContain(
      "says a booking is confirmed",
    );
  });
});
