// Playbook 1.1 / 19: English, Hindi and Hinglish; the facts (prices, GST, names) are the same in every language
import { detectLanguage, say } from "./Lang";
import * as Plan from "./PlanReplies";
import * as Trig from "./TriggerReplies";
import * as Rec from "@Service/Oxxy/RecoveryFlow";
import * as Book from "@Service/Oxxy/BookingFlow";
import * as Cmb from "@Service/Oxxy/CmbGate";
import { hasInsurance } from "@Service/Oxxy/ChatPipeline.service";

describe("detectLanguage", () => {
  it.each([
    ["क्या Oxxy असली है?", "hi"],
    ["mujhe plan ke baare mein batao", "hinglish"],
    ["kya yeh plan accha hai", "hinglish"],
    ["I want to know about the plans", "en"],
    ["ok", null],
    ["yes", null],
    ["2", null],
  ])("%s -> %s", (t, l) => expect(detectLanguage(t)).toBe(l));
});

describe("every text map has all three languages", () => {
  const maps: [string, unknown][] = [];
  for (const mod of [Plan, Trig, Rec, Book, Cmb] as Record<string, unknown>[])
    for (const [k, v] of Object.entries(mod)) if (k.endsWith("_T")) maps.push([k, v]);
  it.each(maps)("%s", (_k, v) => {
    const values = (v as Record<string, unknown>).en !== undefined ? [v] : Object.values(v as object);
    for (const m of values as Record<string, string>[]) {
      for (const l of ["en", "hi", "hinglish"]) {
        expect(typeof m[l]).toBe("string");
        expect(m[l].trim().length).toBeGreaterThan(0);
      }
      // the product name is never translated or shortened (Playbook 2.1)
      if (/Cut Medi Bills/.test(m.en)) {
        expect(m.hi).toContain("Cut Medi Bills");
        expect(m.hinglish).toContain("Cut Medi Bills");
      }
    }
  });
  it("found the maps", () => expect(maps.length).toBeGreaterThan(20));
});

describe("facts are identical in every language", () => {
  const amounts = (t: string) => (t.match(/₹[\d,]+/g) || []).sort();
  it.each(["en", "hi", "hinglish"])("recommendation, honest answer, disclosure, illustration, comparison (%s)", (l) => {
    expect(amounts(Plan.recommendText("vital", 20000, 1999, 100000, 25000, l))).toEqual(
      amounts(Plan.recommendText("vital", 20000, 1999, 100000, 25000)),
    );
    expect(amounts(Plan.honestText("vital", 20000, 1999, 40000, l))).toEqual(amounts(Plan.honestText("vital", 20000, 1999, 40000)));
    const d = Plan.disclosureText("Oxxy Vital plan", 20000, "yearly", "renews yearly", "5 days", l);
    expect(d).toContain("₹20,000");
    expect(d).toContain("GST");
    expect(Trig.illustrationText(30, 100000, 30000, l)).toContain("₹30,000");
    expect(Cmb.cmbOfferText(100000, 30000, 4999, 19999, null, l)).toContain("₹4,999");
    expect(Cmb.cmbOfferText(100000, 30000, 4999, 19999, null, l)).toContain("₹19,999");
    const cmp = Trig.planComparisonText(
      [{ plan: "everyday", monthly: 999, yearly: 10000, age_limit: 70 }],
      null,
      null,
      l,
    );
    expect(cmp).toContain("₹999");
    expect(cmp).toContain("₹10,000");
    expect(cmp).toContain("GST");
  });
  it("a booking request is pending, never confirmed, in Hindi and Hinglish too", () => {
    const o = { date: "2026-11-20", time: "10 am", centre: "Apollo Eye", branch: "Adyar", specialisation: "eye" };
    expect(Book.bookingSavedText({ ...o, lang: "hi" })).toContain("पुष्टि अभी बाकी है");
    expect(Book.bookingSavedText({ ...o, lang: "hinglish" })).toContain("confirmation abhi pending hai");
  });
  it("say() falls back to English", () => {
    expect(say(Plan.ASK_AGE_T, "fr")).toBe(Plan.ASK_AGE);
    expect(say(Plan.ASK_AGE_T, null)).toBe(Plan.ASK_AGE);
  });
});

describe("Trigger J/B: has insurance, in English, Hinglish and Hindi", () => {
  it.each([
    "I already have insurance",
    "mere paas insurance hai",
    "papa ka bima hai",
    "humare family ki policy insurance hai",
    "मेरे पास बीमा है",
    "बीमा है",
  ])("has: %s", (t) => expect(hasInsurance(t)).toBe(true));
  it.each(["is oxxy insurance?", "kya yeh insurance hai kya", "insurance kya hota hai", "क्या यह बीमा है?"])(
    "only asking: %s",
    (t) => expect(hasInsurance(t)).toBe(false),
  );
});
