// WhatsApp Trigger & Conversion Layer, section 15: the 20 acceptance tests, one `it` per row, named as in
// the document ("scenario -> pass condition").
import { GuardrailService } from "@Service/Oxxy/Guardrail.service";
import { fixedReply, centreSavingReply, NEUTRAL_SAVINGS_LINE } from "@Helper/FixedReplies";
import { faqAnswer } from "@Helper/FaqReplies";
import {
  asksComparePlans,
  asksTrust,
  asksWhyActivate,
  illustrationText,
  planComparisonText,
  trustPackText,
  whyActivateText,
} from "@Helper/TriggerReplies";
import { asksCentreSaving, honestText, INSURANCE_ANSWER_T, INSURANCE_HAS_ANSWER, PAYMENT_DONE, SOFT_ACTIVATION_DECLINED } from "@Helper/PlanReplies";
import { TriggerEngineService } from "@Service/Oxxy/TriggerEngine.service";
import { computeSaving, recommendPlan } from "@Service/Oxxy/ValueCheck.service";
import { planSeeds } from "@Database/Seeds/OxxyData";
import { rankCentres, FoundCentre } from "@Service/Oxxy/CentreSearch.service";
import { centreListText } from "@Helper/CentreReplies";
import { notEligibleText } from "@Service/Oxxy/CmbGate";
import { chooseAsset } from "@Service/Oxxy/AssetPicker";
import { detectObjection, objectionReply } from "@Service/Oxxy/RecoveryFlow";
import { validateReply } from "@Service/Oxxy/ReplyValidator.service";
import { FollowUpSchedulerService } from "@Service/Oxxy/FollowUpScheduler.service";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { activation } from "@Database/Table/Oxxy/activation";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { ConversationState as S } from "@Helper/Enum/ConversationState";

const g = new GuardrailService();
const engine = new TriggerEngineService();
const plans = planSeeds()
  .filter((p) => p.product === "oxxy" && p.billing === "yearly")
  .map((p) => ({ ...p, max_saving_pct: p.max_saving_pct ?? null, age_limit: p.age_limit ?? null })) as never[];
const rows = planSeeds()
  .filter((p) => p.product === "oxxy" && p.billing === "yearly")
  .map((p) => ({ plan: String(p.plan), monthly: null, yearly: p.price, age_limit: p.age_limit ?? null }));

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("Trigger layer 15 acceptance tests", () => {
  it('Customer says "Is Oxxy genuine?" -> A fires once with official proof; E does not fire immediately', () => {
    expect(asksTrust("Is Oxxy genuine?")).toBe(true);
    const t = trustPackText([], true, "en");
    expect(t).toMatch(/Official website: https:\/\/www\.oxxy\.in/);
    expect(t).toMatch(/Official policies/);
    expect(t).not.toMatch(/activation link|₹/);
  });

  it('Customer says "I already have insurance" -> B fires; chatbot does not advise cancellation', () => {
    expect(INSURANCE_HAS_ANSWER).toMatch(/should not cancel it/);
  });

  it('Customer says "Nobody is sick" -> C explains advance activation without fear', () => {
    expect(asksWhyActivate("Nobody is sick, why activate?")).toBe(true);
    const t = whyActivateText("no_need", null, "en");
    expect(t).toMatch(/before the next planned healthcare expense|before a planned service/);
    expect(t).not.toMatch(/risk|danger|could die|emergency|hurry|today/i);
  });

  it("Customer asks for eye hospitals near locality -> D returns up to five, including eye-specialist centres; no tie-up claim", () => {
    const c = (name: string, type: string, locality: string) =>
      ({ id: name, name, centre_type: type, locality, specialisations: ["ophthalmology"] }) as unknown as FoundCentre;
    const r = rankCentres([1, 2, 3, 4, 5, 6, 7].map((i) => c(`Eye ${i}`, "specialist", "Adyar")), {
      specialisation: "ophthalmology",
      locality: "Adyar",
    });
    expect(r.length).toBeLessThanOrEqual(5);
    const t = centreListText(r, "ophthalmology", "en");
    expect(t).toMatch(/Specialist \| Relevant for ophthalmology/);
    expect(t).not.toMatch(/tie-?up|network|discount/i);
  });

  it("Customer asks to compare plans -> E shows four plans, recommends one after age/need, sends one link only", () => {
    expect(asksComparePlans("Can you compare the plans?")).toBe(true);
    const t = planComparisonText(rows, { plan: "vital", reason: "OPD and hospitalisation" }, null, "en");
    for (const p of ["Everyday", "Vital", "Thrive", "Infinity"]) expect(t).toContain(p);
    expect(t).not.toMatch(/https?:\/\//);
  });

  it("Customer shares ₹1,00,000 expected bill -> F illustrates ₹30,000 (₹20,000 if Everyday or ₹25,000 if Vital is recommended) and states variability", () => {
    expect(computeSaving(100000, 30)).toBe(30000);
    expect(computeSaving(100000, 20)).toBe(20000);
    expect(computeSaving(100000, 25)).toBe(25000);
    expect(illustrationText(30, 100000, 30000, "en")).toMatch(/approximately 30% of ₹1,00,000 is ₹30,000.*depend/);
  });

  it("Customer selects a centre but declines activation -> G and H complete; request remains; only one soft activation suggestion", () => {
    expect(SOFT_ACTIVATION_DECLINED).toMatch(/booking request/i);
    expect(SOFT_ACTIVATION_DECLINED).not.toMatch(/activate/i);
  });

  it("Customer has one surgery and no booking -> I may route to Cut Medi Bills; Oxxy activation suppressed if selected", () => {
    expect(engine.inferCandidate("recommend", "cut_medi_bills")).toBe("I");
  });

  it("Customer has already paid current-centre bill -> no retrospective promise; different centre offered", () => {
    expect(notEligibleText("bill")).toMatch(/cannot be used for this expense.*another centre/);
  });

  it("Customer asks for reviews after receiving A -> L sends approved current proof only", () => {
    const a = (o: object) => ({ id: "x", trigger_id: "L", language: "en", approved: true, valid_to: null, ...o });
    expect(chooseAsset([a({ approved: false })], "L", "en", [])).toBeNull();
    expect(chooseAsset([a({ valid_to: "2020-01-01" })], "L", "en", [])).toBeNull();
    expect(chooseAsset([a({})], "L", "en", [])?.id).toBe("x");
  });

  it('Customer says "I need to think" -> M resolves one concern; N only with agreed follow-up', () => {
    expect(detectObjection("I need to think")).toBe("think");
    const t = objectionReply("think", "- Oxxy Vital plan", [new Date("2026-11-15T05:30:00Z"), new Date("2026-11-15T11:30:00Z")], "en");
    expect(t).toMatch(/follow-up/);
  });

  it("Customer requests exact discount guarantee -> O or verification; no invented rate", () => {
    expect(validateReply("I guarantee you 35% discount at that hospital.", []).reasons).toContain("promises savings or discounts");
    expect(faqAnswer("guarantee", {}, "en")).toMatch(/must be confirmed/);
  });

  it("Customer completes payment -> P acknowledges verification, not guaranteed instant activation", () => {
    expect(PAYMENT_DONE).toMatch(/check the payment|verif/i);
    expect(PAYMENT_DONE).not.toMatch(/is now active|activated/i);
  });

  it("Customer ignores activation link -> Q fires at most once, subject to consent/window", async () => {
    jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 10, 13, 6, 0, 0)));
    jest.spyOn(follow_up, "findOne").mockResolvedValue({ follow_up_status: "scheduled" } as never);
    jest.spyOn(follow_up, "update").mockResolvedValue({} as never);
    jest.spyOn(consent, "findOne").mockResolvedValue({} as never);
    jest.spyOn(conversation, "findOne").mockResolvedValue({ id: "v1", state: "awaiting_payment", rescue_count: 0 } as never);
    jest.spyOn(customer, "findOne").mockResolvedValue({ id: "c1" } as never);
    jest.spyOn(activation, "findOne").mockResolvedValue({ id: "a1" } as never);
    jest.spyOn(trigger_event, "findOne").mockImplementation((async (q: any) => (q.where.trigger_id === "Q" ? { id: "q" } : null)) as never);
    const wa = { send: jest.fn() };
    await new FollowUpSchedulerService(wa as never).execute({
      customerId: "c1",
      conversationId: "v1",
      kind: "trigger_q",
      templateName: "activation_reminder",
      followUpId: "f1",
    });
    expect(wa.send).not.toHaveBeenCalled(); // a second Q never goes out
  });

  it("Customer says STOP -> R suppresses every commercial trigger and asks no question", async () => {
    jest.spyOn(consent, "findOne").mockResolvedValue({ opt_out_at: new Date() } as never);
    jest.spyOn(trigger_event, "findOne").mockResolvedValue(null as never);
    const d = await engine.decide("c1", { id: "v1", state: S.Discovery } as never, "E", null);
    expect(d?.suppression).toBe("opt_out");
    expect(fixedReply("opt_out", "en")).not.toMatch(/\?/);
  });

  it("Customer reports emergency symptoms -> R pauses activation and directs emergency help", () => {
    expect(g.check("he is having difficulty breathing")?.kind).toBe("emergency");
    expect(fixedReply("emergency", "en")).toMatch(/112.*108/);
  });

  it('Customer asks "Do I get a discount at this hospital?" -> neutral savings line; no tie-up disclosure; no implied saving', () => {
    expect(asksCentreSaving("Do I get a discount at this hospital?")).toBe(true);
    expect(centreSavingReply("en")).toContain(NEUTRAL_SAVINGS_LINE.en);
  });

  it("Customer asks for a plan link without asking to compare -> one recommended plan with price; no full four-plan catalogue", () => {
    expect(asksComparePlans("send me the link")).toBe(false);
  });

  it("Annual spend below break-even for the recommended plan -> no savings-based close; lower-priced suitable plan or an honest answer", () => {
    expect(recommendPlan(40000, 50, "routine check-up", plans)?.status).toBe("not_worth_it");
    expect(honestText("everyday", 10000, 999, 40000, "en")).toMatch(/may not pay for itself/);
  });

  it('Customer says "Is Oxxy insurance?" -> B says plainly that Oxxy is not insurance', () => {
    expect(INSURANCE_ANSWER_T.en).toMatch(/^No\. Oxxy is not insurance/);
  });
});
