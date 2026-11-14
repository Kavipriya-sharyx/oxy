// Playbook 2.1 prohibitions and the approved wording (7.1, 13) in the reply validator
import { promisesSavings, validateReply } from "./ReplyValidator.service";
import { faqAnswer, FaqKey } from "@Helper/FaqReplies";

const reasons = (t: string) => validateReply(t, [10000, 11800, 4999, 5899]).reasons;

describe("savings: describing Oxxy is fine, promising is not", () => {
  it.each([
    "Oxxy is a lifelong healthcare savings and support partner.",
    "Cut Medi Bills is Oxxy's quick medical-savings service for an upcoming requirement.",
    "Any illustrated saving depends on your own medical spend and is not guaranteed.",
    "I cannot guarantee an unverified rate.",
    "The actual saving depends on the service, provider and location and must be confirmed.",
  ])("passes: %s", (t) => expect(promisesSavings(t)).toBe(false));

  it.each([
    "You will save a lot.",
    "You'll definitely save money with Vital.",
    "Save up to 40% on every bill.",
    "Get 20% off today.",
    "We offer a discount.",
    "Guaranteed savings every month.",
    "Your saving is guaranteed.",
    "Enjoy cashback on every bill.",
    "The plan pays for itself.",
    "Aapko 30% discount pakka milega.",
    "आपको बचत पक्की मिलेगी।",
  ])("rejects: %s", (t) => expect(promisesSavings(t)).toBe(true));
});

describe("Playbook 2.1 prohibitions", () => {
  it.each([
    ["CMB is the right choice for you.", "shortens Cut Medi Bills"],
    ["Cut Medi can help with your surgery.", "shortens Cut Medi Bills"],
    ["Activate today to lock it in.", "creates urgency"],
    ["This offer expires on Friday.", "creates urgency"],
    ["Prices will go up next month.", "creates urgency"],
    ["Please share the OTP you received.", "asks for credentials"],
    ["Tell me your UPI PIN to finish.", "asks for credentials"],
    ["Vital covers OPD and hospitalisation.", "describes the product as cover"],
    ["Oxxy coverage starts at once.", "describes the product as cover"],
  ])("%s -> %s", (t, reason) => expect(reasons(t)).toContain(reason));

  it("the full name and plain wording pass", () => {
    expect(reasons("Cut Medi Bills has no age limit.")).toEqual([]);
    expect(reasons("Never share an OTP or PIN with anyone.")).toEqual([]);
    expect(reasons("Vital supports broader OPD and IPD needs.")).toEqual([]);
  });
});

describe("every approved FAQ answer passes the validator (it would be sent as is)", () => {
  const keys: FaqKey[] = [
    "what_is_oxxy", "who_pays", "repeat_use", "pre_existing", "activation_time", "after_paying", "cmb_age",
    "both_products", "guarantee", "booking_confirmed", "medical_advice", "identity", "dont_remember",
  ];
  it.each(keys)("%s", (k) => {
    for (const product of ["oxxy", "cut_medi_bills"]) {
      const r = reasons(faqAnswer(k, { product }, "en")).filter((x) => x !== "offers both products");
      expect(r).toEqual([]);
    }
  });
});
