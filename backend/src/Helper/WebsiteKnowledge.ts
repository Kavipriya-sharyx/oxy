// Facts from the public Oxxy website (www.oxxy.in: home, the four plan pages, policies, about, contact), read
// 21 Nov 2026 for the client's rule "random or unstructured questions: answer from the information on oxxy.in".
// Paraphrased, one fact per answer. Used by Helper/KnowledgeBase.ts AFTER the client's approved answers (they
// win a tie). Left out on purpose because the site contradicts itself or the app: plan prices (the cards show
// two prices each; prices come only from plan_catalog), "guaranteed annual savings", monthly auto-renew billing,
// "no exclusions" and the family-member wording (the app's family rule applies). Re-check when the site changes.
import { KbEntry } from "./KnowledgeBaseData";

const W = (n: number, q: string, a: string, url: string): KbEntry => ({
  id: `W${String(n).padStart(3, "0")}`,
  mode: "ANSWER",
  section: `Website (${url})`,
  q,
  a,
  next: "",
});

export const KB_WEBSITE: KbEntry[] = [
  W(1, "What is Oxxy?", "Oxxy is a healthcare discount membership and healthcare-savings service that arranges discounted rates and appointments at partner hospitals, diagnostic centres and path labs. It is not an insurance policy.", "oxxy.in/policies"),
  W(2, "Is Oxxy health insurance?", "No. Oxxy is not insurance, a reimbursement plan or a claim-settlement service, and it does not pay or reimburse medical bills. You pay the healthcare centre directly after the discount is confirmed.", "oxxy.in/policies"),
  W(3, "Does Oxxy give medical advice or treatment?", "No. Oxxy does not provide medical advice, diagnosis, treatment or emergency services. Its assistants are not doctors.", "oxxy.in/policies"),
  W(4, "Is Oxxy meant for emergencies?", "No. Oxxy is mainly for planned healthcare. In an emergency, get immediate medical care and do not wait for Oxxy.", "oxxy.in/policies"),
  W(5, "How does Oxxy work?", "You choose a plan and activate it, then contact Oxxy before any test, treatment or surgery to book at a partner centre. The discount is applied at the point of service.", "oxxy.in"),
  W(6, "Do I need a medical test or paperwork to buy a plan?", "No. No medical screening, medical test or paperwork is needed to buy a plan.", "oxxy.in"),
  W(7, "How many hospitals and cities are in the Oxxy network?", "The website says about 2,00,000 hospitals, diagnostic centres and path labs across 1,500+ cities in India. The network can change over time.", "oxxy.in"),
  W(8, "Where can I find the list of centres where Oxxy works?", "Oxxy works across most of the private healthcare market. For a specific centre, branch or city, ask Oxxy first, because listings do not confirm every branch, doctor or date.", "oxxy.in"),
  W(9, "Can I use Oxxy for treatment already started or a bill already paid?", "No. Discounts cannot be arranged for admissions or treatment already started, bills already paid, or cases already negotiated directly with the same centre.", "oxxy.in/policies"),
  W(10, "What does the Everyday plan cover?", "Everyday covers OPD and new diseases, for eligible bills up to Rs. 10 lakh and members up to 70 years old, with 50 medical records stored on the cloud.", "oxxy.in/oxxy-everyday"),
  W(11, "What does the Vital plan cover?", "Vital covers OPD and IPD (hospitalisation) with priority appointment booking, for eligible bills up to Rs. 20 lakh and members up to 75 years old, with 100 medical records on the cloud.", "oxxy.in/oxxy-vital"),
  W(12, "What does the Thrive plan cover?", "Thrive covers new and pre-existing diseases and suits heart patients, for eligible bills up to Rs. 30 lakh and members up to 80 years old, with 200 medical records on the cloud.", "oxxy.in/oxxy-thrive"),
  W(13, "What does the Infinity plan cover?", "Infinity has no upper bill limit and no age limit, includes pregnancy and IVF, suits cancer and heart care, and stores 500 medical records on the cloud.", "oxxy.in/oxxy-infinity"),
  W(14, "Can I activate the Cancer Plan after a cancer diagnosis?", "Yes. The Infinity page says the Cancer Plan can be activated even after cancer has been detected.", "oxxy.in/oxxy-infinity"),
  W(15, "Does Oxxy have an age limit?", "It depends on the plan: Everyday up to 70 years, Vital up to 75, Thrive up to 80, and Infinity has no age limit.", "oxxy.in/oxxy-everyday"),
  W(16, "Is there a bill limit on Oxxy?", "It depends on the plan: Everyday up to Rs. 10 lakh, Vital up to Rs. 20 lakh, Thrive up to Rs. 30 lakh, and Infinity has no upper bill limit (the discount itself is still not guaranteed).", "oxxy.in/oxxy-thrive"),
  W(17, "Which plans cover pre-existing diseases?", "Thrive and Infinity cover pre-existing diseases from day one, with no waiting period. Everyday covers new diseases only.", "oxxy.in"),
  W(18, "Is there a waiting period for pre-existing conditions?", "No waiting period and no approvals for pre-existing diseases on Thrive and Infinity; the discount applies from day one.", "oxxy.in"),
  W(19, "What discount does each plan give?", "The discount is 'up to' a maximum: Everyday up to 20%, and Infinity up to 40%. The percentage is a ceiling, not a promise.", "oxxy.in/policies"),
  W(20, "Is the discount guaranteed at the maximum percentage?", "No. The percentage is a ceiling. A minimum 10% applies only where Oxxy confirms the arrangement before the service; it is not guaranteed at every centre or service.", "oxxy.in/policies"),
  W(21, "Does the discount apply to taxes or government levies?", "Not automatically. Unless confirmed, discounts apply only to eligible healthcare charges, not to taxes, government levies or non-discountable bill items.", "oxxy.in/policies"),
  W(22, "How does the savings calculator on the website work?", "You move a slider to your expected bill and answer a few questions; it then shows an estimated saving. It is for illustration only.", "oxxy.in"),
  W(23, "How do I activate a plan?", "Choose a plan, review it and pay securely on the official activation page. Activation normally takes 5-10 working days after successful payment.", "oxxy.in/policies"),
  W(24, "Does payment mean my plan is active right away?", "No. Payment alone does not confirm activation, an appointment, provider availability or a saving. Activation normally takes 5-10 working days.", "oxxy.in/policies"),
  W(25, "How do I book an appointment through Oxxy?", "Contact Oxxy before booking, receiving care or paying. For planned services, contact them at least three working days ahead with your city, preferred centre, service and date, then use the centre Oxxy confirms.", "oxxy.in/policies"),
  W(26, "Should I pay the hospital directly?", "Yes. You pay the healthcare centre directly after the applicable discount is confirmed. Oxxy does not pay the medical bill.", "oxxy.in/policies"),
  W(27, "Can I stop my plan renewal?", "Yes. Send a written request to Oxxy before the next debit. Stopping renewal does not refund the current or any earlier billing period.", "oxxy.in/policies"),
  W(28, "Are monthly plan payments refundable?", "No. Monthly payments are non-refundable once the billing period begins, and GST is non-refundable.", "oxxy.in/policies"),
  W(29, "When can an annual plan be refunded?", "Only when Oxxy cannot arrange at least a 10% discount at any one of three suitable private centres in its network; then the plan-cost component (40% of the amount paid) is refunded. Approved refunds are normally processed within 15 days.", "oxxy.in/policies"),
  W(30, "What if Oxxy cannot get me a discount?", "A refund may be considered under the refund terms (when no 10% discount can be arranged at any of three suitable centres). The full terms are on the website's Policies page.", "oxxy.in/policies"),
  W(31, "What add-on services does Oxxy offer?", "Free test pick-up, medicine delivery and medical care at home are offered as add-ons at an extra charge.", "oxxy.in/about-oxxy"),
  W(32, "How many medical records can I store?", "Each plan stores medical records on the cloud: 50 for Everyday, 100 for Vital, 200 for Thrive and 500 for Infinity.", "oxxy.in/oxxy-everyday"),
  W(33, "Does Oxxy provide a personal health counsellor?", "Yes. Oxxy provides a free personal health counsellor who supports you through your healthcare journey.", "oxxy.in/about-oxxy"),
  W(34, "Who runs Oxxy?", "The website names Enoch Enterprises LLP as the authorised seller of Oxxy Health Plans.", "oxxy.in/contact-us"),
  W(35, "How do I contact Oxxy?", "Call or WhatsApp 8796322800, or use the email on the website's Contact page. The FAQ also gives 9999000102 for help.", "oxxy.in/contact-us"),
  W(36, "What is Oxxy's office address?", "C 64 LGF, Nizamuddin East, New Delhi-110013.", "oxxy.in/contact-us"),
  W(37, "What are Oxxy's working hours and office timings?", "Monday to Saturday, 10:30 AM to 6:00 PM.", "oxxy.in/contact-us"),
  W(38, "Where are Oxxy's policies and terms?", "On the website's Policies page (https://www.oxxy.in/policies): discounts, appointments, cancellations, refunds, privacy and the terms.", "oxxy.in/policies"),
];
