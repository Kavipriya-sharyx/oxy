// System-built replies for plans, prices and activation. Prices and links always come from plan_catalog.
// Wording follows the prototype simulator and the Full Development Plan (12.3, 12.5). [CONFIRM] before go-live.

const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const PLAN_REASON: Record<string, string> = {
  everyday: "it suits routine consultations, tests and check-ups",
  vital: "it covers OPD and possible hospitalisation",
  thrive: "it supports pre-existing conditions and larger expected expenses",
  infinity: "it has no age limit and the broadest scope",
};

export const ASK_AGE = "To suggest the right plan, may I know the patient's age?";
export const ASK_CITY = "Which city and area should I search in? You can also share your location.";
export const NO_CENTRE =
  "I could not find a verified option in that area. Would you like me to widen the search, or do you have a centre in mind?";

// Trigger B: the approved answer to "Is Oxxy insurance?"
export const INSURANCE_ANSWER =
  "No. Oxxy is not insurance and does not pay or reimburse claims. It is a healthcare-savings and support service " +
  "that can work alongside your insurance, so you should not cancel it. Are you asking about a specific planned service?";

// Trigger J: the customer has insurance for the planned service
export const INSURANCE_COORDINATION =
  "Thank you for telling me. If you plan to use insurance for this service, please tell the Oxxy team before the booking " +
  "so they can check how any saving applies. Oxxy works alongside insurance and does not replace it.";

export function recommendText(
  plan: string,
  yearly: number,
  monthly: number | null,
  spend: number,
  saving: number,
): string {
  const p = title(plan);
  const price = monthly
    ? `${inr(monthly)} monthly or ${inr(yearly)} yearly`
    : `${inr(yearly)} yearly`;
  return (
    `I recommend the ${p} plan because ${PLAN_REASON[plan] ?? "it fits what you shared"}. The current price is ${price} plus applicable GST.\n\n` +
    `You mentioned a yearly healthcare spend of about ${inr(spend)}. As an easy illustration, the ${p} plan could help you save ` +
    `about ${inr(saving)} a year, against a plan price of ${inr(yearly)} plus GST. Actual saving depends on the services and ` +
    `providers used. Would you like the plan details?`
  );
}

export function honestText(
  plan: string,
  yearly: number,
  monthly: number | null,
  spend: number,
): string {
  const price = monthly
    ? `${inr(monthly)} monthly or ${inr(yearly)} yearly`
    : `${inr(yearly)} yearly`;
  return (
    `Based on what you shared, the ${title(plan)} plan fits best, at ${price} plus applicable GST. ` +
    `At about ${inr(spend)} a year, it may not pay for itself in savings alone. ` +
    `I can still help you find a centre or take a booking request at no cost.`
  );
}

export function disclosureText(
  productLabel: string,
  price: number,
  billing: string,
  renewalTerms: string | null,
  activationTime: string | null,
): string {
  const per = billing === "monthly" ? "monthly" : "yearly";
  return (
    `Selected: ${productLabel}. Price: ${inr(price)} ${per} plus applicable GST.` +
    (renewalTerms ? ` Renewal: ${renewalTerms.replace(/[.\s]+$/, "")}.` : "") +
    (activationTime ? ` Activation: ${activationTime}.` : "") +
    ` Please review the official page before payment. Shall I send the official secure activation link? Reply YES or NO.`
  );
}

export function linkText(link: string): string {
  return `Here is the official secure activation link: ${link}\nPlease review the plan, price, GST and renewal details before payment. Reply DONE once you have completed it.`;
}

export const LINK_DECLINED =
  "No problem. I can share a short summary, answer a question, or follow up at a time that suits you.";

// ---- After the link (plan 12.5, AWAITING_PAYMENT) ----
// Trigger P: the customer says the payment is done. Never called "active" until the sales team verifies it.
export const PAYMENT_DONE =
  "Thank you. Our team will check the payment and confirm your activation on WhatsApp. " +
  "You do not need to share any card, UPI or bank details.";

// Payment failed: ask whether money was debited; never ask for credentials
export const PAYMENT_FAILED =
  "Sorry about that. Was any money debited from your account? Please do not share card, UPI PIN or OTP details. " +
  "I have asked our payment support team to help you.";

export const PAYMENT_NOT_NOW =
  "No problem. The link stays valid. I can share a short summary, or follow up at a time that suits you.";

// ---- After a booking request (plan 12.4, BOOKING_RECORDED) ----
export function softActivationText(productLabel: string, caution: string | null): string {
  return (
    (caution ? `${caution}\n\n` : "") +
    `If you like, ${productLabel} can support you with this and future healthcare needs. ` +
    "Any illustrated saving depends on your own medical spend and is not guaranteed. " +
    "Would you like to know more? Reply YES or NO."
  );
}

export function timingCaution(activationTime: string): string {
  return (
    `Please note: activation takes ${activationTime}, so it may not be active before your requested date. ` +
    "Your booking request is recorded either way."
  );
}

export const SOFT_ACTIVATION_DECLINED =
  "No problem. Your booking request stays recorded and our team will contact you only about the booking.";

// A centre the customer named is not in the directory: never reject it (plan 12.4)
export function unknownCentreText(name: string): string {
  return (
    `Thank you. "${name}" is not in our directory yet, so our team will check it. ` +
    "Please share its address or a nearby landmark, and your preferred date."
  );
}
