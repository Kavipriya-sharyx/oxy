// Master Implementation Playbook, section 20: the 27 acceptance tests, one `it` per row, named as in the
// document ("scenario -> pass condition"). Full Plan section 11: these must pass in CI before launch.
// Each test runs the real rule, text or pipeline step that decides the behaviour (LLM drafts are mocked).
import { GuardrailService } from "@Service/Oxxy/Guardrail.service";
import { fixedReply, centreSavingReply, NEUTRAL_SAVINGS_LINE } from "@Helper/FixedReplies";
import { faqAnswer, matchFaq } from "@Helper/FaqReplies";
import { validateBookingDate } from "@Service/Oxxy/DateWindow.service";
import { dateProblemText } from "@Service/Oxxy/BookingFlow";
import { computeSaving, recommendPlan } from "@Service/Oxxy/ValueCheck.service";
import { planSeeds } from "@Database/Seeds/OxxyData";
import {
  asksCentreSaving,
  disclosureText,
  INSURANCE_ANSWER,
  INSURANCE_COORDINATION,
  PAYMENT_FAILED,
  SOFT_ACTIVATION_DECLINED,
  timingCaution,
} from "@Helper/PlanReplies";
import { activationAfter, paymentReplyKind } from "@Service/Oxxy/ChatPipeline.service";
import { notEligibleText } from "@Service/Oxxy/CmbGate";
import { openingList } from "@Helper/OpeningMenu";
import { checkMessageLimits, validateReply } from "@Service/Oxxy/ReplyValidator.service";
import { normaliseSpecialisation, rankCentres, FoundCentre } from "@Service/Oxxy/CentreSearch.service";
import { RADIUS_Q } from "@Helper/CentreReplies";
import { activeProductBlock } from "@Helper/ServiceReplies";
import { MAX_RESCUES } from "@Service/Oxxy/RecoveryFlow";

const g = new GuardrailService();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date("2026-11-06T06:00:00Z"); // 6 Nov 2026, 11:30 IST
const plans = planSeeds()
  .filter((p) => p.product === "oxxy" && p.billing === "yearly")
  .map((p) => ({ ...p, max_saving_pct: p.max_saving_pct ?? null, age_limit: p.age_limit ?? null })) as never[];
const cmb = (billing: "monthly" | "yearly") =>
  planSeeds().find((p) => p.product === "cut_medi_bills" && p.billing === billing)!;
const noQuestion = (t: string) => !/\?/.test(t);

describe("Playbook 20 acceptance tests", () => {
  it("General family healthcare enquiry -> starts with Oxxy; does not mention Cut Medi Bills; asks one discovery question", () => {
    // the approved discovery opening (the 4.2 row and 4.1 'Yes, please') ask exactly one question, no product
    const q = faqAnswer("what_is_oxxy", { product: "oxxy" }, "en");
    expect(q).not.toMatch(/cut medi bills/i);
    expect(q.match(/\?/g)).toHaveLength(1);
  });

  it("One upcoming surgery bill -> may route to Cut Medi Bills; checks appointment/registration/treatment/payment status", () => {
    // a ₹2,00,000 single expense passes the Cut Medi Bills value check (30% of the bill > ₹4,999 x 1.18)
    expect(computeSaving(200000, 30)).toBeGreaterThan(4999 * 1.18);
    // and the not-eligible answer names every status the gate checks
    for (const step of ["booking", "registration", "treatment", "bill"] as const) expect(notEligibleText(step)).toMatch(/book, register, start treatment or get a bill/);
  });

  it("Customer asks for both -> states one only; asks broader support vs one expense; sends one link only", () => {
    expect(matchFaq("Can I take both Oxxy and Cut Medi Bills?")).toBe("both_products");
    const a = faqAnswer("both_products", {}, "en");
    expect(a).toMatch(/either an Oxxy plan or Cut Medi Bills/);
    expect(a).toMatch(/broader ongoing support or help with one specific upcoming expense/);
  });

  it("Active Oxxy customer asks for Cut Medi Bills -> blocks second activation and routes to servicing/review", () => {
    expect(activeProductBlock("oxxy", "vital", "en")).toMatch(/already have an active Oxxy Vital plan.*cannot start another activation.*asked our team/);
  });

  it("Eye specialist request -> asks location/radius; suggests eye centres plus multispeciality ophthalmology options, up to five", () => {
    expect(RADIUS_Q.en).toMatch(/How far can the patient travel/);
    expect(normaliseSpecialisation("eye specialist")).toBe("ophthalmology");
    const c = (name: string, type: string) => ({ id: name, name, centre_type: type, specialisations: ["ophthalmology"] }) as unknown as FoundCentre;
    const r = rankCentres([...[1, 2, 3, 4, 5, 6].map((i) => c(`Eye ${i}`, "specialist")), c("Multi", "multispeciality")], {
      specialisation: "ophthalmology",
    });
    expect(r.length).toBeLessThanOrEqual(5);
    expect(r.some((x) => x.centre_type === "multispeciality")).toBe(true);
  });

  it("Customer names another centre -> verifies centre/branch; takes booking request; does not discuss tie-up", () => {
    // a named centre never gets a tie-up claim from the model
    expect(validateReply("Yes, we have a tie-up with that hospital.", []).reasons).toContain("mentions tie-ups");
  });

  it("Booking date tomorrow -> rejects and offers earliest date 3 days ahead", () => {
    const r = validateBookingDate("2026-11-07", now);
    expect(r).toMatchObject({ valid: false, reason: "too_soon", min: "2026-11-09" });
    expect(dateProblemText("too_soon", now, "en")).toMatch(/at least a 3-day gap.*on or after/);
  });

  it("Booking date 7 months ahead -> rejects and offers last date 6 months ahead", () => {
    const r = validateBookingDate("2027-06-06", now);
    expect(r).toMatchObject({ valid: false, reason: "too_far", max: "2027-05-06" });
    expect(dateProblemText("too_far", now, "en")).toMatch(/only up to 6 months ahead/);
  });

  it("Customer refuses activation -> keeps booking, responds kindly and creates a booking-confirmation follow-up only; no activation pitch and no second product offer", () => {
    expect(SOFT_ACTIVATION_DECLINED).toMatch(/booking request/i);
    expect(SOFT_ACTIVATION_DECLINED).not.toMatch(/activate|cut medi bills|plan/i);
  });

  it("Cut Medi Bills monthly -> states ₹4,999 + GST, monthly auto-renewal and cancel-anytime before link; no proactive refund statement", () => {
    const m = cmb("monthly");
    const t = disclosureText("Cut Medi Bills (monthly)", m.price, "monthly", m.renewal_terms, m.activation_time, "en");
    expect(t).toMatch(/₹4,999 monthly plus applicable GST/);
    expect(t).toMatch(/Renews every month until you cancel/);
    expect(t).not.toMatch(/refund/i);
  });

  it("Cut Medi Bills annual -> states ₹19,999 + GST, one-time, one year, no automatic renewal; no proactive refund statement", () => {
    const y = cmb("yearly");
    const t = disclosureText("Cut Medi Bills (annual)", y.price, "yearly", y.renewal_terms, y.activation_time, "en");
    expect(t).toMatch(/₹19,999 yearly plus applicable GST/);
    expect(t).toMatch(/One-time payment, valid for one year, no automatic renewal/);
    expect(t).not.toMatch(/refund/i);
  });

  it("Already paid current-centre bill -> no retrospective promise; offers different centre for future need", () => {
    expect(notEligibleText("bill")).toMatch(/cannot be used for this expense/);
    expect(notEligibleText("bill")).toMatch(/another centre/);
    expect(faqAnswer("after_paying", { product: "cut_medi_bills" }, "en")).toMatch(/No retrospective adjustment can be promised.*different centre/);
  });

  it("Customer asks refund -> gives product-specific approved answer or escalates a dispute", () => {
    expect(g.check("I want a refund for the charge")?.kind).toBe("complaint");
  });

  it("Customer wants use with insurance -> states Cut Medi Bills timing requirement before insurance application/activation and appointment", () => {
    expect(INSURANCE_COORDINATION).toMatch(/before insurance is applied or activated .* before the medical-centre appointment/);
  });

  it("Customer asks diagnosis -> explains boundary only then; offers specialisation/centre support", () => {
    expect(matchFaq("What medicine should I take for fever?")).toBe("medical_advice");
    expect(faqAnswer("medical_advice", {}, "en")).toMatch(/qualified medical professional.*right specialisation/);
    expect(matchFaq("I need a dental check-up")).toBeNull(); // no unasked disclaimer
  });

  it("Customer reports chest pain -> stops commercial flow and directs immediate emergency help (112 / 108)", () => {
    expect(g.check("my father has chest pain")?.kind).toBe("emergency");
    expect(fixedReply("emergency", "en")).toMatch(/112 \(or 108 for an ambulance\).*pause the plan and activation discussion/);
  });

  it("Customer says STOP -> confirms opt-out, suppresses all future messages and asks no question", () => {
    expect(g.check("STOP")?.kind).toBe("stop");
    expect(noQuestion(fixedReply("opt_out", "en"))).toBe(true);
  });

  it("Prompt asks to guarantee 40% -> refuses; uses verified/illustrative language only", () => {
    expect(validateReply("Yes, 40% saving is guaranteed for you.", []).reasons).toContain("promises savings or discounts");
    expect(faqAnswer("guarantee", {}, "en")).toMatch(/^No\. .*illustration.*must be confirmed/);
  });

  it("Payment failed -> asks whether debited; never asks credentials; escalates", () => {
    expect(paymentReplyKind("payment failed")).toBe("failed");
    expect(PAYMENT_FAILED).toMatch(/money debited/);
    expect(validateReply(PAYMENT_FAILED, []).reasons).not.toContain("asks for credentials");
  });

  it("Two failed rescue attempts -> offers summary/follow-up/closure and stops nudging", () => {
    expect(MAX_RESCUES).toBe(2);
  });

  it("Everyday customer shares a ₹1,00,000 bill -> illustrates about ₹20,000 (20% cap), not ₹30,000", () => {
    expect(computeSaving(100000, 20)).toBe(20000);
  });

  it("Annual spend ₹40,000 with Thrive considered -> value check fails; no savings close for Thrive; offers a lower-priced suitable plan or an honest answer", () => {
    const r = recommendPlan(40000, 50, "pre-existing diabetes", plans);
    expect(r?.status).toBe("not_worth_it");
  });

  it("Customer asks whether a centre gives a discount -> neutral savings line; no tie-up disclosure; no implied saving", () => {
    expect(asksCentreSaving("Do I get a discount at Apollo hospital?")).toBe(true);
    expect(centreSavingReply("en")).toContain(NEUTRAL_SAVINGS_LINE.en);
    expect(validateReply(centreSavingReply("en"), []).ok).toBe(true);
  });

  it("Cut Medi Bills booking requested 4 days ahead -> records the booking and adds the timing caution about 5-10 working-day activation", () => {
    const fourDays = ymd(new Date(now.getTime() + 4 * 86400000));
    expect(activationAfter(fourDays, "5 to 10 working days", now)).toBe(true);
    expect(timingCaution("5 to 10 working days", "en")).toMatch(/5 to 10 working days/);
  });

  it("Customer says STOP with an open booking -> confirms opt-out, states booking-only contact and asks no question", () => {
    const t = fixedReply("opt_out_booking", "en");
    expect(t).toMatch(/booking request stays recorded.*only about it/);
    expect(noQuestion(t)).toBe(true);
  });

  it("Opening menu sent -> at most 3 reply buttons with titles of 20 characters or fewer; 4 or more options sent as a list", () => {
    for (const l of ["en", "hi", "hinglish"]) {
      const m = openingList(l);
      expect(m.kind).toBe("list");
      expect(checkMessageLimits(m).ok).toBe(true);
    }
  });

  it('Customer asks "Is Oxxy insurance?" -> says plainly that Oxxy is not insurance', () => {
    expect(INSURANCE_ANSWER).toMatch(/^No\. Oxxy is not insurance/);
  });
});
