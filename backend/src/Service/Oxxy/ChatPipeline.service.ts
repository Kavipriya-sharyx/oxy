import { Injectable, Logger, Optional } from "@nestjs/common";
import { freshCallContext } from "@Helper/CallContext";
import { faqAnswer, matchFaq, withoutClosingQuestion, faqNeedsPerson } from "@Helper/FaqReplies";
import {
  asksNearby,
  centreListText,
  LOCATION_ASK_T,
  agreesToShare,
  declinesLocation,
  locationAskText,
  namedPlace,
  nearestListText,
  typedArea,
  onlyRadius,
  parseRadius,
  pickFromList,
  RADIUS_Q,
} from "@Helper/CentreReplies";
import { toBubbles } from "@Helper/Bubbles";
import { detectRescueSignal, readRescue, rescueLine } from "@Helper/RescueReplies";
import { REBOOK_DECLINED_T } from "@Helper/CentreReplies";
import { oneQuestion } from "@Helper/OneQuestion";
import { singleExpenseSignal } from "@Helper/NeedSignals";
import { knownSpecialisation, normaliseSpecialisation } from "./CentreSearch.service";
import { todayIST } from "./DateWindow.service";
import { activeProductBlock, SERVICE_ESCALATE, serviceSummaryText } from "@Helper/ServiceReplies";
import { ILike, Like, In } from "typeorm";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { message } from "@Database/Table/Oxxy/message";
import { need } from "@Database/Table/Oxxy/need";
import { centre } from "@Database/Table/Oxxy/centre";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { activation } from "@Database/Table/Oxxy/activation";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { centreSavingReply, fixedReply, NOTICE_VERSION } from "@Helper/FixedReplies";
import { detectLanguage, L, lang, say } from "@Helper/Lang";
import {
  ACTIVATION_BY_TEAM_T,
  askedAboutActivation,
  asksSpend,
  spendAnswer,
  lastQuestionOf,
  askedAboutPlanDetails,
  planDetailsText,
  wantsPlanDetails,
  wantsToActivate,
  askedAboutPrice,
  asksCentreSaving,
  asksPrice,
  cmbPriceText,
  isShortYes,
  parsePatientAge,
  planPriceText,
  disclosureText,
  honestText,
  PLAN_REASON,
  linkText,
  recommendText,
  softActivationText,
  timingCaution,
  ASK_AGE_T,
  ASK_CITY_T,
  INSURANCE_ANSWER_T,
  INSURANCE_COORDINATION_T,
  INSURANCE_HAS_ANSWER_T,
  LINK_DECLINED_T,
  NO_CENTRE_T,
  PAYMENT_DONE_T,
  PAYMENT_FAILED_T,
  PAYMENT_NOT_NOW_T,
  planReason,
  SOFT_ACTIVATION_DECLINED_T,
} from "@Helper/PlanReplies";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { eligibility } from "@Database/Table/Oxxy/eligibility";
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { asset_send } from "@Database/Table/Oxxy/asset_send";
import { ASSET_REQUIRED, assetLine, pickAsset, pickAssets } from "./AssetPicker";
import {
  BOOKING_OFFER_DECLINED_T,
  BookingDraft,
  bookingQuestion,
  bookingSavedText,
  dateProblemText,
  showDate,
  isBookingPending,
  nextStep,
  parseCustomerDate,
  readDraft,
  writeDraft,
  asksForSuggestion,
  asksToBook,
  looksLikeCentreName,
  asksIfThere,
  asksWhyBooking,
  asksWhyDate,
  dateRuleText,
  saysYesToOffer,
  STILL_HERE_T,
  whyBookingText,
} from "./BookingFlow";
import {
  asksMedicine,
  CLOSED_POLITELY_T,
  detectObjection,
  FOLLOW_UP_NOT_WANTED_T,
  followUpOptions,
  followUpProblem,
  followUpProblemText,
  followUpQuestion,
  followUpSavedText,
  MAX_RESCUES,
  medicineText,
  NO_PROVIDER_ANSWER_T,
  NOT_INTERESTED_ASK_T,
  objectionReply,
  parseFollowUpTime,
  PRICE_ASK_T,
  PRICE_BUDGET_QUESTION_T,
  rescueDelayMs,
  RESCUE_TEMPLATES,
  summaryLines,
  SUMMARY_CLOSE_T,
  UNDERSTAND_T,
} from "./RecoveryFlow";
import {
  asksComparePlans,
  asksTrust,
  asksWhyActivate,
  ComparisonRow,
  illustrationText,
  needRecommendationText,
  officialReferences,
  planComparisonText,
  proofText,
  trustPackAssets,
  trustPackText,
  whyActivateText,
  whyActivateVariant,
} from "@Helper/TriggerReplies";
import { cmbWorthIt, computeSaving, PLAN_ORDER, planForNeed, PlanLike } from "./ValueCheck.service";
import {
  asksForCmb,
  cmbNotWorthText,
  cmbOfferText,
  columnFor,
  GATE_FAILED_BEFORE_T,
  GATE_INTRO_T,
  GATE_QUESTION,
  gateQuestion,
  ROUGH_AMOUNT_T,
  GATE_STEPS,
  GateStep,
  gateComplete,
  gateFailed,
  notEligibleText,
  parseAmount,
} from "./CmbGate";
import { FollowUpSchedulerService, type FollowUpKind } from "./FollowUpScheduler.service";
import { UrgentAlertService } from "@Service/Ops/UrgentAlert.service";
import { OutboundMessage } from "@Helper/WhatsappMessage";
import {
  LEAD_ROWS,
  LEAD_SUMMARY,
  leadPriority,
  matchLeadRow,
  matchMenuRow,
  MENU_ROWS,
  MenuRow,
  menuReply,
  openingList,
} from "@Helper/OpeningMenu";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { TaskType } from "@Helper/Enum/TaskType";
import { TaskPriority } from "@Helper/Enum/TaskPriority";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { ProductType } from "@Helper/Enum/ProductType";
import { BillingCycle } from "@Helper/Enum/BillingCycle";
import { GuardrailService, GuardrailHit, isOptIn } from "./Guardrail.service";
import { AnswerReading, AnswerStep, LlmService, ChatTurn, LlmResult } from "./Llm.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { WhatsappClient } from "./WhatsappClient.service";
import { ValueCheckService } from "./ValueCheck.service";
import { CentreSearchService } from "./CentreSearch.service";
import { BookingService } from "./Booking.service";
import { DateWindowService } from "./DateWindow.service";
import { DataSource } from "typeorm";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { ConversationRepository, RESTARTED_FRESH } from "./ConversationRepository.service";
import { isPlaceholder, planProblems, planReady } from "@Helper/GoLive";
import { hasQuestion, statedYearlySpend, tidyDraft } from "@Helper/ReplyTidy";
import { GeoPoint, GoogleMapsService } from "@Service/Maps/GoogleMaps.service";
import { isNoCentreText, isRepeatNoCentreText, noCentreText } from "@Helper/PlanReplies";
import {
  CALLBACK_OUTSIDE_HOURS_T,
  callbackOptions,
  callbackQuestion,
  callbackSavedText,
  caseRef,
  showWindow,
  packWindows,
  parseCallbackChoice,
  teamHours,
  unpackWindows,
} from "./CallbackFlow";
import { canTransition, InvalidTransitionError } from "./ConversationStateMachine";
import { NEEDS_SHOWN, TriggerDecision, TriggerEngineService } from "./TriggerEngine.service";
import {
  asksHealthQuestion,
  isGreeting,
  looksLikeQuestion,
  sharesHealthDetail,
  healthConsentStatus,
  parseConsentAnswer,
  withoutHealthFields,
} from "./HealthConsent";

export const HOLDING_MESSAGE_T: L = {
  en: "Thank you for your message. Our team will get back to you shortly.",
  hi: "आपके संदेश के लिए धन्यवाद। हमारी टीम जल्द ही आपसे संपर्क करेगी।",
  hinglish: "Aapke message ke liye dhanyavaad. Hamari team jaldi aapse contact karegi.",
};
export const HOLDING_MESSAGE = HOLDING_MESSAGE_T.en;

// While a person handles the case (Playbook 3 ESCALATED: "give callback expectation without promising exact
// resolution") or a safety event is open (PAUSE). Sent once. [CONFIRM] wording.
export const PARKED_ACK = "parked_ack";
// how far the "nearest verified options" fallback looks when nothing is inside the travel distance
const NEAREST_MAX_KM = 30;
export const ESCALATED_ACK_T: L = {
  en: "Thank you. Our team has your request and will contact you.",
  hi: "धन्यवाद। हमारी टीम के पास आपकी रिक्वेस्ट है और वे आपसे संपर्क करेंगे।",
  hinglish: "Dhanyavaad. Hamari team ke paas aapki request hai aur woh aapse contact karenge.",
};
// Trigger O, the reason for the callback before the time options. Wording from Playbook 16.4:
// "I want to give you a precise answer rather than guess. I will arrange an authorised callback."
export const CALLBACK_REASON_T: L = {
  en: "I want to give you a precise answer rather than guess. I will arrange an authorised callback.",
  hi: "मैं अंदाज़ा लगाने के बजाय आपको सही जवाब देना चाहता हूँ। मैं एक अधिकृत कॉलबैक की व्यवस्था करूँगा।",
  hinglish:
    "Main guess karne ke bajay aapko sahi jawab dena chahta hoon. Main ek authorised callback arrange karunga.",
};
// A side question the bot could not answer in the middle of the booking or the gate: said plainly, then
// the same step again (no hand-over for one question). [CONFIRM] wording.
export const NOT_SURE_HERE_T: L = {
  en: "Sorry, I could not answer that here. Our team can explain it on the call after your request.",
  hi: "क्षमा करें, मैं इसका जवाब यहाँ नहीं दे सका। आपकी रिक्वेस्ट के बाद कॉल पर हमारी टीम इसे समझा देगी।",
  hinglish: "Sorry, main iska jawab yahan nahi de saka. Aapki request ke baad call par hamari team ise samjha degi.",
};
// Before the health-data consent: after answering a question, the short reminder (the full notice was sent)
export const CONSENT_REMINDER_T: L = {
  en: "To help with a health need too, may I use your health details as explained above? Please reply YES or NO.",
  hi: "स्वास्थ्य से जुड़ी मदद के लिए, क्या मैं ऊपर बताए अनुसार आपकी स्वास्थ्य जानकारी का उपयोग कर सकता हूँ? कृपया YES या NO लिखें।",
  hinglish:
    "Health need mein madad ke liye, kya main upar bataye anusaar aapki health details use kar sakta hoon? YES ya NO likhein.",
};
// After "no verified centre here": where verified centres are
export const CENTRE_CITIES_T: L = {
  en: "Verified centres are available now in: {cities}. Send one of these cities to see the options there.",
  hi: "सत्यापित केंद्र अभी इन शहरों में उपलब्ध हैं: {cities}। विकल्प देखने के लिए इनमें से किसी शहर का नाम भेजें।",
  hinglish: "Verified centres abhi in shehron mein available hain: {cities}. Options dekhne ke liye inmein se koi city bhejein.",
};
/** What a draft must never say (null = fine): checked in code, the prompt alone was not enough */
export function draftProblem(text: string, bookingOpen: boolean): string | null {
  const t = (text || "").toLowerCase();
  if (
    bookingOpen &&
    /\b(booking|request|appointment)\b[^.]{0,40}\b(is |has been |was )?(noted|made|recorded|received|placed|booked|confirmed|done)\b|\b(noted|recorded) (your|the) booking\b/.test(
      t,
    )
  )
    return "the booking request is NOT made yet (the system asks its own next step): never say it is noted, made or confirmed";
  if (
    /\b(payment method|pay (via|using|through|with)|g ?pay|phone ?pe|paytm|upi|card details|bank details|account number)\b|\b(i will|i'll|let me) (now )?(initiate|process|proceed with|start) (the )?(activation|payment)\b/.test(
      t,
    )
  )
    return "never ask how they will pay and never say you process an activation or payment: the system sends the official link";
  if (/\b(which|what)( specific| exact)? (medicines?|drugs?|tablets?)\b[^?]*\?/.test(t))
    return "never ask for the names of medicines";
  return null;
}
/** The draft's question asks for something the customer already answered (null = fine) */
export function asksKnownAgain(
  text: string,
  n: { beneficiary?: string | null; healthcare_need?: string | null; city?: string | null; locality?: string | null; annual_medical_spend?: number | string | null } | null,
): string | null {
  if (!n) return null;
  const q = lastQuestionOf(text).toLowerCase();
  if (!q) return null;
  if (n.beneficiary && /\b(you|yourself)\b[^?]{0,30}\bor\b[^?]{0,30}\bfamily\b|\bwho is (this|it|the care) for\b/.test(q))
    return `already known: the care is for "${n.beneficiary}". Do not ask it again; ask the next missing thing`;
  if (n.healthcare_need && /\bwhat( specific| kind of| type of)? (consultation|test|medicine|treatment|surgery|expense)/.test(q))
    return "already known: the need. Do not ask it again; ask the next missing thing";
  if (n.city && n.locality && /\b(which|what) city\b|\bwhere do(es)? (you|the patient) live\b|\bcity and locality\b/.test(q))
    return `already known: ${n.locality}, ${n.city}. Do not ask it again`;
  // any wording of the spend question ("What are your monthly medical expenses?" too: client, 17 Nov, the
  // expenses were asked again after the age)
  if (n.annual_medical_spend && (/\bhow much\b[^?]*\bspend/.test(q) || asksSpend(q) || /\b(medical|healthcare|health) (expenses?|expenditure|spend|bills?)\b[^?]*\?/.test(q)))
    return "already known: the yearly spend. Do not ask it again";
  return null;
}

/**
 * The draft offers the activation (or its price) again after that step is over: the customer declined it,
 * already has the official link, said they will discuss it with the family / think, or has an active plan
 * (client, 17 Nov: "price plan activation still asking multiple times after it finished the conversation").
 * Fine when the customer's own message asks about the plan, the price, the link or paying.
 */
export function repitchProblem(draft: string, settled: string | null, customerText: string): string | null {
  if (!settled) return null;
  if (/\b(activat\w*|link|pay\w*|price|cost|fees?|plan|subscri\w*|buy|purchase|kitna|evlo|evvalavu|rate)\b/i.test(customerText || ""))
    return null;
  const q = lastQuestionOf(draft || "").toLowerCase();
  const pitch =
    /\b(activat\w*|activation link|secure link|official link|plan details|the price|subscribe|sign up|purchase|buy|proceed with (the )?(plan|payment))\b/.test(q) ||
    /\b(you can|you may|shall i|should i|i can) (now )?(activate|send (you )?the (official |secure )?(activation )?link)\b/i.test(draft || "");
  return pitch
    ? `do not offer the activation, the plan or its price again (${settled}); answer only what the customer wrote`
    : null;
}

/** A read that must never break the reply (a thrown or rejected lookup = null) */
async function quiet<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

/** "Thanks", "ok thank you", "bye", "that's all", "nandri", "dhanyavaad": the customer is ending the chat */
export function isClosingMessage(text: string): boolean {
  const t = (text || "").toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  if (!t || /\?/.test(text || "") || t.split(" ").length > 7) return false;
  return /^(ok(ay)?|k|fine|sure|great|super|good|alright|got it|noted|sari|seri|theek hai|accha)?\s*(thanks?|thank you( so much| very much)?|thanku|thankyou|thx|ty|tq|bye|goodbye|good bye|that'?s all|thats it|that is all|nothing else|no more questions?|nandri|romba nandri|dhanyavaad|dhanyavad|shukriya)\b/.test(t);
}
export const SUMMARY_HEAD_T: L = {
  en: "Thank you. Here is a summary of our chat:",
  hi: "धन्यवाद। हमारी बातचीत का सारांश:",
  hinglish: "Thank you. Hamari baat ka summary:",
};
const SUMMARY_HEAD_RE = /Here is a summary of our chat|हमारी बातचीत का सारांश|Hamari baat ka summary/;

// The spend / age questions asked because the customer wants to activate: once the plan is picked, the
// activation step follows in the same reply (never "Would you like the plan details?" again)
export const PLAN_SPEND_ACTIVATE = "plan_spend:activate";
export const PLAN_AGE_ACTIVATE = "plan_age:activate";

/** The text without its closing question (paragraph breaks kept) */
export function withoutLastQuestion(text: string): string {
  const t = (text || "").trim();
  if (!/\?\s*$/.test(t)) return t;
  const cut = t.replace(/(^|[.!।]\s+|\n+)[^.!?।\n]*\?\s*$/, "$1").trim();
  return cut || t;
}

/** The bot's question asks the patient's age */
export function asksAge(text: string): boolean {
  const t = (text || "").trim();
  const q = t.split(/(?<=[.!?।])\s+|\n+/).filter((x) => /\?\s*$/.test(x)).pop() ?? "";
  return /\b(patient'?s?|your|their|his|her|mother'?s?|father'?s?|the) age\b|\bhow old\b|\bage of the\b/i.test(q);
}

// Media the bot cannot read (it never downloads files or sends them to the LLM)
const MEDIA_TYPES = new Set(["audio", "voice", "image", "document", "video", "sticker", "reaction"]);
export const MEDIA_VOICE_T: L = {
  en: "Sorry, I cannot listen to voice notes yet. Please type your question in a few words and I will reply right away.",
  hi: "माफ़ कीजिए, मैं अभी वॉइस नोट नहीं सुन सकता। कृपया अपना सवाल कुछ शब्दों में लिखें, मैं तुरंत जवाब दूँगा।",
  hinglish: "Sorry, main abhi voice note nahi sun sakta. Kripya apna sawaal kuch shabdon mein likhein, main turant jawab dunga.",
};
export const MEDIA_FILE_T: L = {
  en: "Thank you, I have received your file. I cannot open files here, so our team will look at it. Please also type your question in a few words and I will help right away.",
  hi: "धन्यवाद, आपकी फ़ाइल मिल गई। मैं यहाँ फ़ाइलें नहीं खोल सकता, हमारी टीम इसे देखेगी। कृपया अपना सवाल भी कुछ शब्दों में लिखें, मैं तुरंत मदद करूँगा।",
  hinglish: "Dhanyavaad, aapki file mil gayi. Main yahan files nahi khol sakta, hamari team ise dekhegi. Kripya apna sawaal bhi kuch shabdon mein likhein, main turant madad karunga.",
};
// Booking request, side answers
export const CENTRE_CHANGED_T: L = {
  en: "Done, the booking request is now for {centre}.",
  hi: "ठीक है, बुकिंग अनुरोध अब {centre} के लिए है।",
  hinglish: "Theek hai, booking request ab {centre} ke liye hai.",
};
export const DATE_NOTED_T: L = {
  en: "Noted {date}.",
  hi: "{date} नोट कर लिया।",
  hinglish: "{date} note kar liya.",
};
export const DOCTOR_NOT_SURE_T: L = {
  en: "No problem. I will mark the request \"not sure, please advise\": the centre will suggest the right doctor.",
  hi: "कोई बात नहीं। मैं अनुरोध में \"पता नहीं, कृपया सलाह दें\" लिख दूँगा: केंद्र सही डॉक्टर बताएगा।",
  hinglish: "Koi baat nahi. Main request mein \"not sure, please advise\" likh dunga: centre sahi doctor batayega.",
};
export const NOT_SURE_SPECIALISATION = "Not sure - please advise";
/** "I don't know which doctor", "you tell me", "not sure", "any doctor" */
export function knowsNotWhichDoctor(text: string): boolean {
  return /\b(don'?t|do not|dont|dunno)\s+(know|kow|knw|kno|no)\b|\bnot sure\b|\bno idea\b|\b(you|u) (tell|suggest|decide)\b|\b(tell|suggest) me\b|\bwhich doctor\b|\bany doctor\b|\bpata nahi|पता नहीं/i.test(
    text || "",
  );
}
// The customer did not give a distance ("I want the hospital details"): the list within about 10 km
export const RADIUS_DEFAULT_T: L = {
  en: "Here are verified options within about 10 km. Tell me if the patient can travel further.",
  hi: "लगभग 10 km के अंदर के सत्यापित विकल्प ये हैं। अगर मरीज़ और दूर जा सकते हैं तो बताइए।",
  hinglish: "Lagbhag 10 km ke andar ke verified options ye hain. Agar patient aur door ja sakte hain to bataiye.",
};
// The area typed while the health notice waits for YES / NO (client, 17 Nov). English wording approved by the client on 17 Nov
export const CONSENT_AREA_NOTED_T: L = {
  en: "Thank you, I have noted {place}. Before I look for centres there, please reply YES or NO to the note above about health details.",
  hi: "धन्यवाद, मैंने {place} नोट कर लिया है। वहाँ केंद्र खोजने से पहले, कृपया स्वास्थ्य जानकारी वाले ऊपर के नोट पर YES या NO लिखें।",
  hinglish: "Dhanyavaad, maine {place} note kar liya hai. Wahan centres dhoondhne se pehle, kripya health details wale upar ke note par YES ya NO likhein.",
};
// YES to the notice in the middle of a chat: the conversation goes on, no second welcome. English wording approved by the client on 17 Nov
export const CONSENT_GO_ON_T: L = {
  en: "Please go ahead, how can I help you next?",
  hi: "कृपया बताइए, अब मैं आपकी कैसे मदद करूँ?",
  hinglish: "Bataiye, ab main aapki kaise madad karun?",
};
// The bot keeps answering while the team has the case (no second callback offer)
export const TEAM_HAS_IT_T: L = {
  en: "Our team already has your request and will call you as arranged.",
  hi: "हमारी टीम के पास आपकी रिक्वेस्ट पहले से है और वे तय समय पर आपको कॉल करेंगे।",
  hinglish: "Hamari team ke paas aapki request pehle se hai aur woh tay samay par aapko call karenge.",
};
// need columns handed to the LLM as "already known" (the free-text condition is never sent)
const KNOWN_NEED_FIELDS = [
  "beneficiary",
  "healthcare_need",
  "need_pattern",
  "specialisation",
  "city",
  "locality",
  "postcode",
  "travel_radius_km",
  "service_date",
  "expected_bill",
  "annual_medical_spend",
  "insurance_status",
  "urgency",
  "pre_existing",
];
// what is carried over from the customer's previous conversation (dates and one-off bills are not)
const EARLIER_NEED_FIELDS = [
  "beneficiary",
  "healthcare_need",
  "need_pattern",
  "specialisation",
  "city",
  "locality",
  "postcode",
  "annual_medical_spend",
  "insurance_status",
  "pre_existing",
];
export const PAUSE_ACK_T: L = {
  en: "The Oxxy team will contact you. If this is an emergency, please call 112 (or 108 for an ambulance) now.",
  hi: "Oxxy टीम आपसे संपर्क करेगी। अगर यह इमरजेंसी है, तो कृपया अभी 112 पर कॉल करें (एम्बुलेंस के लिए 108)।",
  hinglish:
    "Oxxy team aapse contact karegi. Agar yeh emergency hai, to kripya abhi 112 par call karein (ambulance ke liye 108).",
};

// Inline system texts (English approved; Hindi / Hinglish drafts, see Helper/Lang.ts)
const T: Record<"activeProduct" | "centresHead" | "centresFoot" | "spendFirst" | "pickNumber", L> =
  {
    activeProduct: {
      en: "You already have an active product with us, so I can help only with that one.",
      hi: "आपके पास पहले से हमारा एक सक्रिय प्रोडक्ट है, इसलिए मैं केवल उसी में मदद कर सकता हूँ।",
      hinglish:
        "Aapke paas pehle se hamara ek active product hai, isliye main sirf usi mein madad kar sakta hoon.",
    },
    centresHead: {
      en: "Centres near you:",
      hi: "आपके पास के केंद्र:",
      hinglish: "Aapke paas ke centres:",
    },
    centresFoot: {
      en: "Reply with 1-5, or send the name of another centre you prefer.",
      hi: "1-5 में से कोई नंबर लिखें, या अपनी पसंद के किसी दूसरे केंद्र का नाम भेजें।",
      hinglish: "1-5 mein se number likhein, ya apni pasand ke kisi dusre centre ka naam bhejein.",
    },
    spendFirst: {
      en: "Happy to help. To suggest the right plan, roughly how much does your family spend on healthcare in a year?",
      hi: "मदद करके खुशी होगी। सही प्लान सुझाने के लिए, आपका परिवार साल में स्वास्थ्य पर लगभग कितना खर्च करता है?",
      hinglish:
        "Madad karke khushi hogi. Sahi plan suggest karne ke liye, aapki family saal mein healthcare par lagbhag kitna kharcha karti hai?",
    },
    pickNumber: {
      en: "Please reply with a number from 1 to {n}, or send the name of another centre you prefer.",
      hi: "कृपया 1 से {n} तक का कोई नंबर लिखें, या अपनी पसंद के किसी दूसरे केंद्र का नाम भेजें।",
      hinglish:
        "Kripya 1 se {n} tak ka number likhein, ya apni pasand ke kisi dusre centre ka naam bhejein.",
    },
  };

export interface Inbound {
  waNumber: string;
  waMessageId: string;
  text: string; // "" for non-text messages
  type?: string;
  timestamp?: Date;
  profileName?: string;
  location?: { latitude: number; longitude: number };
}

// Playbook 1.3 / Trigger layer 1.2: the decision journey [CONFIRM the 7 days, Playbook 22.2]
/** Decision-journey window in days (Configuration page JOURNEY_DAYS, read live; default 7) */
export const journeyDays = () => {
  const n = Number(process.env.JOURNEY_DAYS);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 7;
};

/**
 * True when the open conversation's journey is over: no customer message for JOURNEY_DAYS. Never for a
 * case a person still holds (ESCALATED, PAUSE) or an opted-out chat (that state is kept as the record).
 */
export function journeyExpired(
  c: { state?: string | null; last_customer_message_at?: Date | string | null },
  now = Date.now(),
): boolean {
  if (!c.last_customer_message_at) return false;
  if (
    c.state === ConversationState.Escalated ||
    c.state === ConversationState.Pause ||
    c.state === ConversationState.OptedOut
  )
    return false;
  return now - new Date(c.last_customer_message_at).getTime() > journeyDays() * 24 * 3600 * 1000;
}

// Trigger Q: one reminder this long after the link, if it is still unpaid [CONFIRM] the delay
/** Payment reminder (Trigger Q) gap in ms (Configuration page TRIGGER_Q_DELAY_HOURS, read live; default 4 h) */
export const triggerQDelayMs = () => {
  const n = Number(process.env.TRIGGER_Q_DELAY_HOURS);
  return (Number.isFinite(n) && n >= 1 && n <= 72 ? n : 4) * 60 * 60 * 1000;
};

// A reply after the activation link (plan 12.5). Short messages only: a longer one is a question for the LLM.
export function paymentReplyKind(text: string): "done" | "failed" | "not_now" | null {
  const t = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 8) return null;
  if (
    /\b(payment|transaction|txn|paisa|paise|payment ho)\b.*\b(failed|fail|declined|not (gone|going|working)|nahi hua|nahi gaya|atak)\b/.test(
      t,
    ) ||
    /\b(failed|declined)\b.*\b(payment|transaction)\b/.test(t) ||
    /पेमेंट (फेल|नहीं हुआ)/.test(t)
  )
    return "failed";
  if (
    /^(done|paid|payment done|paid done|completed|payment completed|i have paid|i paid|ho gaya|ho gya|kar diya|payment ho gaya|payment kar diya|हो गया|पेमेंट हो गया|कर दिया)( (it|now|already|ji|sir|madam))?$/.test(
      t,
    )
  )
    return "done";
  if (
    /^(not now|later|maybe later|baad mein|baad me|abhi nahi|abhi nahin|बाद में|अभी नहीं)( please| ji)?$/.test(
      t,
    )
  )
    return "not_now";
  return null;
}

// true when the plan's activation time ("5 to 10 working days") ends after the requested date
export function activationAfter(
  preferredDate: string,
  activationTime: string,
  now = new Date(),
): boolean {
  const nums = (activationTime.match(/\d+/g) || []).map(Number);
  if (!nums.length) return false;
  const n = Math.max(...nums);
  const days = /working|business/i.test(activationTime) ? Math.ceil((n * 7) / 5) : n;
  const date = new Date(`${preferredDate}T00:00:00+05:30`);
  if (isNaN(date.getTime())) return false;
  return date.getTime() < now.getTime() + days * 24 * 60 * 60 * 1000;
}

// Postgres unique_violation
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; driverError?: { code?: string } };
  return err?.code === "23505" || err?.driverError?.code === "23505";
}

// Open sales states in which a quiet customer gets a rescue (Playbook 15)
/** Scheduled messages a customer message makes unnecessary (FollowUpScheduler kinds) */
export const CANCEL_ON_REPLY: FollowUpKind[] = ["rescue", "agreed_follow_up", "lead_intro"];

const RESCUE_STATES = new Set<ConversationState>([
  ConversationState.IntentMenu,
  ConversationState.NeedDiscovery,
  ConversationState.OxxyExplain,
  ConversationState.Discovery,
  ConversationState.Routing,
  ConversationState.PlanFit,
  ConversationState.CutMediBillsFit,
  ConversationState.CentreSearch,
  ConversationState.BookingCapture,
  ConversationState.Activation,
]);

/**
 * The customer HAS insurance (not just asking "is Oxxy insurance?"). English, Hinglish
 * ("mere paas insurance hai", "papa ka bima hai") and Hindi ("मेरे पास बीमा है").
 */
export function hasInsurance(text: string): boolean {
  const t = (text || "").toLowerCase();
  // "insurance kya hota hai?", "क्या यह बीमा है?" ask about insurance; they do not say the customer has it
  const question = /\?|\b(kya|kyun|kaise|kaun|what|is it)\b|क्या|कैसे/u.test(t);
  return (
    /\b(i|we|my|mother|father|family)\b[^.?!]{0,30}\b(have|has|got|covered)\b[^.?!]{0,20}(insurance|bima)|my (health )?insurance|insurance (will|can) (pay|cover)/.test(
      t,
    ) ||
    /\b(mere|mera|meri|hamare|humare|hamara|papa|mummy|maa|pitaji|family)\b[^.?!]{0,25}\b(paas|pass|ka|ki|ke)\b[^.?!]{0,15}\b(insurance|bima|policy)\b[^.?!]{0,10}\b(hai|he|hain)\b/.test(
      t,
    ) ||
    /(मेरे|हमारे|पापा|माँ|परिवार)[^.?!]{0,25}(बीमा|इंश्योरेंस)[^.?!]{0,10}है/u.test(t) ||
    (!question &&
      (/\b(insurance|bima)\b[^.?!]{0,10}\b(hai|he|hain|cover karega|se ho jayega)\b/.test(t) ||
        /(बीमा|इंश्योरेंस) है/u.test(t)))
  );
}

const TEAM_NOTE_MS = 7 * 24 * 3600 * 1000;

/** The hand-back note while it is fresh (both times are written by this server, so they compare safely) */
export function teamNote(conv?: Partial<conversation> | null, now = Date.now()): string | null {
  const note = conv?.handback_note?.trim();
  if (!note || !conv?.handed_back_at) return null;
  return now - new Date(conv.handed_back_at).getTime() <= TEAM_NOTE_MS ? note : null;
}

export interface Saved {
  customer: customer;
  conversation: conversation;
  message?: message;
}

@Injectable()
export class ChatPipelineService {
  private readonly logger = new Logger(ChatPipelineService.name);

  constructor(
    private readonly _Guardrail: GuardrailService,
    private readonly _Llm: LlmService,
    private readonly _Validator: ReplyValidatorService,
    private readonly _Wa: WhatsappClient,
    private readonly _ValueCheck: ValueCheckService,
    private readonly _CentreSearch: CentreSearchService,
    private readonly _Booking: BookingService,
    private readonly _DateWindow: DateWindowService,
    private readonly _DataSource: DataSource,
    private readonly _Outbox: CrmOutboxService,
    private readonly _ConvRepo: ConversationRepository,
    @Optional() private readonly _Triggers?: TriggerEngineService,
    @Optional() private readonly _Scheduler?: FollowUpSchedulerService,
    @Optional() private readonly _Urgent?: UrgentAlertService,
    @Optional() private readonly _Maps?: GoogleMapsService,
  ) {}

  // Step 1: dedupe + save. Returns null for a duplicate wa_message_id.
  async saveInbound(m: Inbound): Promise<Saved | null> {
    if (m.waMessageId && (await message.findOne({ where: { wa_message_id: m.waMessageId } })))
      return null;

    let cust = await customer.findOne({ where: { wa_number: m.waNumber } });
    if (!cust) {
      const created = await this._DataSource.transaction(async (mg) => {
        const c = await mg.save(
          mg.create(customer, { wa_number: m.waNumber, first_name: m.profileName ?? null }),
        );
        await mg.save(mg.create(consent, { customer_id: c.id }));
        const row = await this._Outbox.enqueue(mg, CrmAction.UpsertCustomer, c.id, {
          customer_id: c.id,
          wa_number: m.waNumber,
        });
        return { c, row };
      });
      cust = created.c;
      await this._Outbox.dispatch(created.row);
    } else if (!cust.first_name && m.profileName) {
      cust.first_name = m.profileName;
      await cust.save();
    }
    let open = await this._ConvRepo.findOpenByCustomer(cust.id);
    // Playbook 1.3: a decision journey ends after 7 days without a reply. The next message starts a new
    // one, so triggers, the soft suggestion and the product choice can be offered again for a new need.
    if (open && journeyExpired(open)) {
      await conversation.update(open.id, {
        closed_at: new Date(),
        state: ConversationState.Closed,
        outcome: open.outcome ?? "no_reply_7_days",
        pending_action: null,
      } as any);
      open = null;
    }
    const conv = open ?? (await this._ConvRepo.openNew(cust.id));
    conv.last_customer_message_at = new Date();
    // update only this column: a full save() could overwrite the state the repository just wrote
    await conversation.update(conv.id, { last_customer_message_at: conv.last_customer_message_at });

    let saved: message;
    try {
      saved = await message.save(
        message.create({
          conversation_id: conv.id,
          direction: "in",
          sender: "customer",
          wa_message_id: m.waMessageId,
          type: m.type ?? "text",
          body: m.text,
          wa_timestamp: m.timestamp ?? null,
          message_status: "received",
        }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) return null; // same wamid arrived twice at once
      throw e;
    }
    return { customer: cust, conversation: conv, message: saved };
  }

  // true when a later inbound message in this conversation already has a reply
  async isStale(s: Saved): Promise<boolean> {
    const m = s.message;
    if (!m?.id) return false;
    // compared inside SQL: created_on has no time zone, so a JS Date parameter would shift by 5:30
    const newer = await message
      .createQueryBuilder("o")
      .where("o.conversation_id = :cid", { cid: m.conversation_id })
      .andWhere("o.direction = 'in'")
      .andWhere("o.id <> :id", { id: m.id })
      .andWhere(`o.created_on > (SELECT x.created_on FROM "message" x WHERE x.id = :id)`, {
        id: m.id,
      })
      .andWhere(
        `EXISTS (SELECT 1 FROM "message" r WHERE r.direction = 'out' AND r.reply_to_wa_message_id = o.wa_message_id)`,
      )
      .getCount();
    return newer > 0;
  }

  private async alreadyReplied(inboundWamid: string): Promise<boolean> {
    if (!inboundWamid) return false;
    return !!(await message.findOne({
      where: { direction: "out", reply_to_wa_message_id: inboundWamid },
    }));
  }

  // WhatsappClient.send() checks the rules, sends and saves the outbound row (tagged with the inbound wamid).
  // If a reply to this inbound message already exists, nothing is sent.
  private async sendAndSave(
    customerId: string,
    content: string | OutboundMessage,
    replyTo: string,
  ) {
    if (await this.alreadyReplied(replyTo)) return;
    // Playbook 1.1: YES / NO = reply buttons; long text = up to three bubbles. Only the first bubble carries
    // the inbound wamid (that is what "already replied" checks); the others follow it.
    const msgs: OutboundMessage[] = typeof content === "string" ? toBubbles(content) : [content];
    try {
      await this._Wa.send(customerId, msgs[0], "reply", replyTo);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // someone else already saved a reply: fine
      return;
    }
    for (const extra of msgs.slice(1)) {
      try {
        await this._Wa.send(customerId, extra, "reply");
      } catch (e) {
        this.logger.warn(`follow-up bubble not sent: ${(e as Error).message}`);
      }
    }
  }

  // Change state only through ConversationRepository. A change the state machine does not allow
  // is logged (ids and state names only) and skipped, never forced.
  // `path` is the route to the target, e.g. [ROUTING, PLAN_FIT, ACTIVATION]. Steps the conversation is
  // already past are skipped, so the same path works from DISCOVERY, PLAN_FIT or BOOKING_RECORDED.
  private async setState(s: Saved, path: ConversationState[]): Promise<void> {
    if (s.conversation.state === path[path.length - 1]) return;
    for (let i = 0; i < path.length; i++) {
      const to = path[i];
      const isLast = i === path.length - 1;
      if (!isLast && !canTransition(s.conversation.state, to)) continue;
      try {
        const updated = await this._ConvRepo.transition(s.conversation.id, to);
        s.conversation.state = updated.state;
      } catch (e) {
        if (e instanceof InvalidTransitionError) {
          this.logger.warn(
            `conversation ${s.conversation.id}: state change ${e.from} -> ${e.to} not allowed, skipped`,
          );
          return;
        }
        throw e;
      }
    }
  }

  private async createTask(
    type: TaskType,
    priority: TaskPriority,
    s: Saved,
    summary: string,
    opts: { sendToCrm?: boolean; extra?: Record<string, unknown> } = {},
  ): Promise<string> {
    let taskId = "";
    const row = await this._DataSource.transaction(async (mg) => {
      const t = await mg.save(
        mg.create(task, {
          type,
          task_status: TaskStatus.Open,
          priority,
          customer_id: s.customer.id,
          conversation_id: s.conversation.id,
          summary,
        } as any),
      );
      taskId = String((t as any).id ?? "");
      if (opts.sendToCrm === false) return null;
      return await this._Outbox.enqueue(mg, CrmAction.CreateTask, s.customer.id, {
        task_id: (t as any).id,
        type,
        priority,
        summary,
        conversation_id: s.conversation.id,
        ...opts.extra,
      });
    });
    await this._Outbox.dispatch(row);
    // Full Plan 12.7: an urgent case alerts the team at once (console banner + webhook), not only as a list row
    if (priority === TaskPriority.Urgent)
      await this._Urgent?.notify({ id: taskId, type }, s.customer).catch(() => false);
    return taskId;
  }

  // Task for a guardrail event. Stores only type, priority, and the inbound wamid (no message text,
  // no health detail). Safe to call again for the same wamid: the second call creates nothing.
  private async createTaskOnce(type: TaskType, priority: TaskPriority, s: Saved, summary: string) {
    const exists = await task.findOne({
      where: { conversation_id: s.conversation.id, type, summary },
    });
    if (exists) return String((exists as any).id ?? "");
    return await this.createTask(type, priority, s, summary);
  }

  // An open booking request or an unpaid activation = a human must still follow up after STOP
  private async openCases(customerId: string): Promise<{ booking: boolean; payment: boolean }> {
    const booking = await booking_request.findOne({
      where: {
        customer_id: customerId,
        booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]),
      },
    });
    const payment = await activation.findOne({
      where: {
        customer_id: customerId,
        payment_status: PaymentStatus.Pending,
        activation_status: In([ActivationStatus.Pending, ActivationStatus.LinkSent]),
      },
    });
    return { booking: !!booking, payment: !!payment };
  }

  // Opt-out + state OPTED_OUT + CRM outbox row: all or nothing.
  // Not built yet (no follow_up table and no scheduler exist): cancelling pending follow-ups and
  // delayed jobs. Today the only marketing flag is consent.marketing_consent. The inbound
  // recovery job already skips opted-out customers.
  private async recordOptOut(s: Saved, cons: consent | null) {
    const at = new Date();
    const row = await this._DataSource.transaction(async (mg) => {
      const c = cons ?? mg.create(consent, { customer_id: s.customer.id });
      c.opt_out_at = at;
      c.marketing_consent = false;
      await mg.save(c);
      try {
        const updated = await this._ConvRepo.transition(
          s.conversation.id,
          ConversationState.OptedOut,
          {
            reason: "stop",
            manager: mg,
          },
        );
        s.conversation.state = updated.state;
      } catch (e) {
        // STOP must always work: the opt-out is saved even if the state change is refused
        if (!(e instanceof InvalidTransitionError)) throw e;
        this.logger.warn(
          `conversation ${s.conversation.id}: state change ${e.from} -> ${e.to} not allowed, skipped`,
        );
      }
      return await this._Outbox.enqueue(mg, CrmAction.SetOptOut, s.customer.id, {
        customer_id: s.customer.id,
        opt_out_at: at.toISOString(),
      });
    });
    await this._Outbox.dispatch(row);
    // every scheduled follow-up stops at once (plan 12.7)
    await this._Scheduler?.cancelAll(s.customer.id, "opt_out");
  }

  // The customer wrote START after STOP: opt-out cleared, OPTED_OUT -> NEW, CRM told, one fixed reply.
  // Marketing consent stays off (it needs its own yes); follow-ups cancelled at STOP are not brought back.
  private async recordOptIn(m: Inbound, s: Saved, cons: consent) {
    const row = await this._DataSource.transaction(async (mg) => {
      await mg.update(consent, { customer_id: s.customer.id }, { opt_out_at: null });
      cons.opt_out_at = null;
      return await this._Outbox.enqueue(mg, CrmAction.SetOptIn, s.customer.id, {
        customer_id: s.customer.id,
        opt_in_at: new Date().toISOString(),
      });
    });
    try {
      const updated = await this._ConvRepo.optIn(s.conversation.id);
      s.conversation.state = updated.state;
    } catch (e) {
      // the opt-out is cleared either way; a conversation that was not OPTED_OUT keeps its state
      if (!(e instanceof InvalidTransitionError)) throw e;
    }
    await this._Outbox.dispatch(row);
    await this.recordTrigger(s, "R", "opt_in");
    await this.sendAndSave(s.customer.id, fixedReply("opt_in", s.customer.language), m.waMessageId);
  }

  // Fixed replies, no LLM. Each branch: task first (once per wamid), then state, then the reply
  // last, so a retried job after a failed send still ends with the reply and no second task.
  private async handleGuardrail(hit: GuardrailHit, m: Inbound, s: Saved, cons: consent | null) {
    const optedOut = !!cons?.opt_out_at;
    const lang = s.customer.language;
    const ref = `wamid:${m.waMessageId}`;

    if (hit.kind === "emergency" || hit.kind === "self_harm") {
      const type = hit.kind === "emergency" ? TaskType.Emergency : TaskType.SelfHarm;
      await this.createTaskOnce(type, TaskPriority.Urgent, s, ref);
      // an opted-out customer stays OPTED_OUT (the machine would refuse PAUSE anyway); safety reply still goes out
      if (!optedOut) await this.setState(s, [ConversationState.Pause]);
      if (hit.also_stop && !optedOut) await this.recordOptOut(s, cons); // PAUSE -> OPTED_OUT
      await this.recordTrigger(s, "R", hit.kind);
      await this.sendAndSave(s.customer.id, fixedReply(hit.kind, lang), m.waMessageId);
      return;
    }

    if (optedOut) return; // STOP again, or a request for a person: no messages to an opted-out customer

    if (hit.kind === "stop") {
      const open = await this.openCases(s.customer.id);
      await this.recordOptOut(s, cons);
      await this.recordTrigger(s, "R", "opt_out");
      await this._Scheduler?.cancelForConversation(s.conversation.id, ["rescue"], "opt_out");
      if (open.booking || open.payment) {
        await this.createTaskOnce(
          TaskType.OptOutOpenCase,
          TaskPriority.Normal,
          s,
          `${ref} opted out, ${open.booking ? "booking request" : "payment"} still open`,
        );
      }
      await this.sendAndSave(
        s.customer.id,
        fixedReply(
          open.booking ? "opt_out_booking" : open.payment ? "opt_out_payment" : "opt_out",
          lang,
        ),
        m.waMessageId,
      );
      return;
    }

    if (hit.kind === "privacy") {
      await this.saveConsentRow(s.customer.id, cons, (c) => {
        c.privacy_request_at = new Date();
        c.marketing_consent = false;
      });
      await this._Scheduler?.cancelAll(s.customer.id, "privacy_request");
      await this.createTaskOnce(
        TaskType.PrivacyRequest,
        TaskPriority.High,
        s,
        `${ref} privacy / deletion request`,
      );
      await this.recordTrigger(s, "R", "privacy");
      await this.setState(s, [ConversationState.Pause]);
      await this.sendAndSave(s.customer.id, fixedReply("privacy", lang), m.waMessageId);
      return;
    }

    if (hit.kind === "complaint") {
      const taskId = await this.createTaskOnce(
        TaskType.Escalation,
        TaskPriority.Urgent,
        s,
        `${ref} complaint or payment dispute`,
      );
      await this.recordTrigger(s, "O", "complaint or payment dispute");
      await this.setState(s, [ConversationState.Escalated]);
      await this.sendAndSave(
        s.customer.id,
        await this.withCallbackOptions(s, taskId, fixedReply("complaint", lang)),
        m.waMessageId,
      );
      return;
    }

    // talk to a person
    const taskId = await this.createTaskOnce(
      TaskType.Escalation,
      TaskPriority.Normal,
      s,
      `${ref} customer asked for a person`,
    );
    await this.recordTrigger(s, "O", "asked for a person");
    await this.setState(s, [ConversationState.Escalated]);
    await this.sendAndSave(
      s.customer.id,
      await this.withCallbackOptions(s, taskId, fixedReply("escalation", lang)),
      m.waMessageId,
    );
  }

  // Trigger O: the escalation reply also offers callback windows inside team hours; the answer is read
  // by handleCallbackTime. The windows shown are stored with the task id, so "2" means what was shown.
  private async withCallbackOptions(
    s: Saved,
    taskId: string | undefined,
    text: string,
  ): Promise<string> {
    // the customer already chose a callback time for this case: say so, never the options again
    const chosen = taskId ? await task.findOne({ where: { id: taskId } }) : null;
    if (chosen?.callback_from)
      return [text, say(TEAM_HAS_IT_T, s.customer.language)].filter(Boolean).join("\n\n");
    // ONE callback per chat (client, 17 Nov: "Today, 4-6 pm, CB-1A1B5949" and later "Today, 6-7 pm,
    // CB-000224D2"): a time already chosen for another open case of this chat stands; the new case gets
    // the same time and the customer the same time and reference
    const earlier = await this.chosenCallback(s);
    if (earlier && earlier.id !== taskId) {
      if (taskId)
        await quiet(() =>
          task.update(taskId, { callback_from: earlier.callback_from, callback_to: earlier.callback_to, due_at: earlier.callback_from } as any),
        );
      return [text, await this.teamHasItText(s, earlier)].filter(Boolean).join("\n\n");
    }
    // the times were already offered for another case and not answered yet: the same times, the same case
    const offered = (s.conversation.pending_action ?? "").match(/^callback_time:([^:]+):(.*)$/);
    if (offered && offered[1] !== taskId && unpackWindows(offered[2]).some((w) => w.from.getTime() > Date.now()))
      return [text, callbackQuestion(unpackWindows(offered[2]), s.customer.language)].filter(Boolean).join("\n\n");
    const options = callbackOptions();
    if (!taskId || !options.length) return text;
    await this.setPending(s, `callback_time:${taskId}:${packWindows(options)}`);
    return [text, callbackQuestion(options, s.customer.language)].filter(Boolean).join("\n\n");
  }

  /** "Our team already has your request" (+ the callback time when one was chosen) */
  private async teamHasItText(s: Saved, withCallback?: task | null): Promise<string> {
    const open =
      withCallback ??
      (await this.chosenCallback(s)) ??
      (await task.findOne({
        where: {
          conversation_id: s.conversation.id,
          task_status: In([TaskStatus.Open, TaskStatus.InProgress]),
        } as any,
        order: { created_on: "DESC" } as any,
      }));
    const l = s.customer.language;
    if (open?.callback_from)
      return `${say(TEAM_HAS_IT_T, l)} (${showWindow({ from: open.callback_from, to: open.callback_to ?? open.callback_from }, l)}, ${caseRef(open.id)})`;
    return say(TEAM_HAS_IT_T, l);
  }

  /** Why the activation must not be offered again in this chat (null = it may be) */
  private async activationSettled(s: Saved): Promise<string | null> {
    if (s.customer.active_product) return "the customer already has an active plan";
    if (s.conversation.outcome === "activation_declined") return "the customer declined the activation";
    if (["family", "think", "busy"].includes(String(s.conversation.objection)))
      return "the customer will decide later (family / think / busy)";
    const sent = await quiet(() =>
      activation.findOne({
        where: {
          customer_id: s.customer.id,
          payment_status: PaymentStatus.Pending,
          activation_status: ActivationStatus.LinkSent,
        },
      }),
    );
    return sent ? "the official activation link was already sent" : null;
  }

  /** The open case of this chat whose callback time the customer already chose (that time not yet over) */
  private async chosenCallback(s: Saved): Promise<task | null> {
    const rows = await quiet(() =>
      task.find({
        where: {
          conversation_id: s.conversation.id,
          task_status: In([TaskStatus.Open, TaskStatus.InProgress]),
        } as any,
        order: { created_on: "ASC" } as any,
      }),
    );
    const now = Date.now();
    return (
      (rows ?? []).find(
        (t) => t.callback_from && new Date(t.callback_to ?? t.callback_from).getTime() > now,
      ) ?? null
    );
  }

  // The customer's answer to the callback options. Anything else stays with the team (bot quiet while ESCALATED).
  private async handleCallbackTime(m: Inbound, s: Saved): Promise<boolean> {
    const hit = (s.conversation.pending_action ?? "").match(/^callback_time:([^:]+):(.*)$/);
    if (!hit) return false;
    const taskId = hit[1];
    const choice = parseCallbackChoice(m.text, unpackWindows(hit[2]));
    if (!choice) return false;
    const lang = s.customer.language;
    if ("outside" in choice) {
      const fresh = callbackOptions();
      await this.setPending(s, `callback_time:${taskId}:${packWindows(fresh)}`);
      await this.sendAndSave(
        s.customer.id,
        `${say(CALLBACK_OUTSIDE_HOURS_T(teamHours()), lang)}\n\n${callbackQuestion(fresh, lang)}`,
        m.waMessageId,
      );
      return true;
    }
    const w = choice.window;
    const t = await task.findOne({ where: { id: taskId } });
    const row = await this._DataSource.transaction(async (mg) => {
      if (t)
        await mg.update(
          task,
          { id: taskId },
          { callback_from: w.from, callback_to: w.to, due_at: w.from },
        );
      return await this._Outbox.enqueue(mg, CrmAction.SetCallbackWindow, s.customer.id, {
        task_id: taskId,
        case_ref: caseRef(taskId), // the reference the customer was given
        crm_task_id: (t as any)?.crm_task_id ?? null,
        callback_window: { from: w.from.toISOString(), to: w.to.toISOString() },
      });
    });
    await this._Outbox.dispatch(row);
    await this.setPending(s, null);
    await this.sendAndSave(
      s.customer.id,
      callbackSavedText(w, caseRef(taskId), lang),
      m.waMessageId,
    );
    return true;
  }

  /** The consent step runs now (else the message is answered first and the notice follows it) */
  private consentStepNow(status: "none" | "awaiting", m: Inbound, s: Saved): boolean {
    const text = (m.text || "").trim();
    if (s.conversation.state === ConversationState.New) return true; // the welcome and the options first
    if (!text || m.location) return true;
    // YES / NO ("ok", "sari" too, to the notice's own question): the notice, or the answer to it
    if (parseConsentAnswer(text, status === "awaiting") !== "unclear") return true;
    if (isGreeting(text)) return true; // "hi" again: the notice (the welcome and options came first)
    // health detail is never sent to the LLM before the consent (DPDP): the notice first, the answer after YES
    if (sharesHealthDetail(text)) return true;
    const row = matchMenuRow(text);
    // these rows go straight into the patient's details: the notice first, the row's question right after
    // YES (client, 17 Nov: "Which city?" and the notice came together, the city typed was then refused)
    if (row?.id === "menu_need" || row?.id === "menu_centre") return true;
    // while the notice waits for YES / NO, only a real question is answered ("maybe", "ok": asked again)
    if (status === "awaiting" && !row && !looksLikeQuestion(text)) return true;
    return false;
  }

  /**
   * After an answer given before the consent: the notice (first time, full text) or a short reminder, as its
   * own message. Not when the answer itself ended with a question (one question per turn, Playbook 1.1).
   */
  private async askConsentLater(m: Inbound, s: Saved) {
    const status = (s as any).consentLater as "none" | "awaiting" | undefined;
    if (!status) return;
    try {
      const reply = await message.findOne({
        where: { direction: "out", reply_to_wa_message_id: m.waMessageId },
      });
      if (!reply) return; // nothing was answered: nothing to follow
      const conv = s.conversation; // kept current by setState in this turn
      if (conv.state === ConversationState.Pause || conv.state === ConversationState.OptedOut) return;
      if (conv.taken_over_by_id) return;
      const l = s.customer.language;
      if (status === "none") {
        for (const b of toBubbles(fixedReply("health_notice", l)))
          await this._Wa.send(s.customer.id, b, "reply");
        const cons = await consent.findOne({ where: { customer_id: s.customer.id } });
        await this.saveConsentRow(s.customer.id, cons, (c) => {
          c.notice_sent_at = new Date();
          c.notice_sent_version = NOTICE_VERSION;
        });
      } else if (!/\?\s*$|reply (yes|1)/i.test(String(reply.body ?? "").trim())) {
        for (const b of toBubbles(say(CONSENT_REMINDER_T, l))) await this._Wa.send(s.customer.id, b, "reply");
      }
    } catch (e) {
      this.logger.warn(`consent notice after the answer not sent: ${(e as Error).message}`);
    }
  }

  // DPDP consent step. Ends the turn. No LLM call, no health question, no other text than the fixed replies.
  //  none     -> send the notice (nothing else in this turn), then remember it was sent
  //  awaiting -> read this message as the answer: YES / NO saved first, then the reply; unclear -> ask again
  private async handleConsentStep(
    status: "none" | "awaiting",
    m: Inbound,
    s: Saved,
    cons: consent | null,
  ) {
    const lang = s.customer.language;
    const customerId = s.customer.id;

    if (status === "none") {
      // Playbook 4.2 then 16.3: the greeting and the opening list come first (no health question in them);
      // the notice comes with the customer's next message, before the first health question. The row the
      // customer picked is remembered and answered right after their YES.
      if (s.conversation.state === ConversationState.New) {
        await this.sendAndSave(customerId, openingList(lang), m.waMessageId);
        await this.setState(s, [ConversationState.IntentMenu]);
        return;
      }
      const row = matchMenuRow(m.text);
      if (row) await this.setPending(s, `after_consent:${row.id}`);
      await this.sendAndSave(customerId, fixedReply("health_notice", lang), m.waMessageId);
      await this.saveConsentRow(customerId, cons, (c) => {
        c.notice_sent_at = new Date();
        c.notice_sent_version = NOTICE_VERSION;
      });
      return;
    }

    const answer = parseConsentAnswer(m.text, true);
    if (answer === "yes") {
      // saved BEFORE the reply: if saving fails nothing is sent and nothing is allowed (the job is retried)
      await this.saveConsentRow(customerId, cons, (c) => {
        c.health_data_consent = true;
        c.notice_version = NOTICE_VERSION;
        c.consent_timestamp = new Date();
        c.consent_source = m.waMessageId;
        c.health_refused_at = null;
        c.health_refused_version = null;
      });
      await this.crmEvent(s, "consent", {
        health_data_consent: true,
        notice_version: NOTICE_VERSION,
      });
      const ack = fixedReply("health_consent_yes", lang);
      const picked = this.rowAfterConsent(s);
      // the area was already typed while the notice waited: no "Which city?" again, the location step
      const typed =
        picked?.id === "menu_centre"
          ? await quiet(() => need.findOne({ where: { conversation_id: s.conversation.id } }))
          : null;
      // the customer already talked with the bot before this YES (a question answered first): never the
      // welcome and the opening list again (client, 17 Nov: "Hello! Welcome to Oxxy Health" after YES)
      const talkedBefore =
        !picked &&
        (await Promise.resolve()
          .then(() => message.count({ where: { conversation_id: s.conversation.id, direction: "out" } as any }))
          .catch(() => 0)) > 2;
      if (picked && typed?.city) {
        await this.setPending(s, null);
        await this.enterRow(picked, s);
        await this.setPending(s, "centre_location");
        await this.sendAndSave(
          customerId,
          { kind: "location_request", body: `${ack} ${locationAskText(this.placeOf(typed), lang)}` },
          m.waMessageId,
        );
      } else if (picked) {
        await this.setPending(s, null);
        await this.sendAndSave(
          customerId,
          `${ack} ${await this.rowReply(picked, s)}`,
          m.waMessageId,
        );
        await this.enterRow(picked, s);
      } else if (
        !talkedBefore &&
        (s.conversation.state === ConversationState.New ||
          s.conversation.state === ConversationState.IntentMenu)
      ) {
        // the first thing after consent: welcome + the 4-row opening list
        await this.sendAndSave(customerId, openingList(lang, ack), m.waMessageId);
        await this.setState(s, [ConversationState.IntentMenu]);
      } else {
        await this.sendAndSave(customerId, `${ack} ${say(CONSENT_GO_ON_T, lang)}`, m.waMessageId);
      }
    } else if (answer === "no") {
      await this.saveConsentRow(customerId, cons, (c) => {
        c.health_data_consent = false;
        c.consent_timestamp = null;
        c.consent_source = m.waMessageId;
        c.health_refused_at = new Date();
        c.health_refused_version = NOTICE_VERSION;
      });
      await this.crmEvent(s, "consent", {
        health_data_consent: false,
        notice_version: NOTICE_VERSION,
      });
      if (this.rowAfterConsent(s)) await this.setPending(s, null);
      await this.sendAndSave(customerId, fixedReply("health_consent_no", lang), m.waMessageId);
    } else {
      // "Find or book a centre" was picked and the area typed instead of YES / NO: the area is kept (it is
      // not a health detail) and the YES / NO asked once more, never "Sorry, I did not understand"
      const area = this.rowAfterConsent(s)?.id === "menu_centre" ? await this.areaBeforeConsent(m.text, s) : null;
      await this.sendAndSave(
        customerId,
        area ? say(CONSENT_AREA_NOTED_T, lang).replace("{place}", area) : fixedReply("health_consent_unclear", lang),
        m.waMessageId,
      );
    }
  }

  /** The area typed while the notice waits ("Tamilnadu, coimbatore"): saved on the need row; its label or null */
  private async areaBeforeConsent(text: string, s: Saved): Promise<string | null> {
    const cities = await this.centreCities();
    const a = typedArea(text, cities);
    if (!a) return null;
    let { locality, city } = a;
    const knownCity = !!city && cities.some((c) => c.toLowerCase() === city!.toLowerCase());
    if (this._Maps?.enabled) {
      const geo = await this._Maps.geocode([locality, city].filter(Boolean).join(", ")).catch(() => null);
      if (!geo && !knownCity && !locality) return null;
      if (geo?.city) city = geo.city;
      if (locality && geo?.locality) locality = geo.locality;
    } else if (!knownCity && !locality) return null; // one unknown word ("maybe") is not an area
    if (!city) return null;
    const n = await this.needRow(s);
    n.city = city;
    n.locality = (locality ?? null) as any;
    await n.save();
    return this.placeOf(n);
  }

  // ---- Opening list rows (Playbook 4.2, state machine 3) ----

  /** The row the customer picked before the health-data notice, if any */
  private rowAfterConsent(s: Saved): MenuRow | null {
    const p = s.conversation.pending_action;
    if (!p?.startsWith("after_consent:")) return null;
    const id = p.slice("after_consent:".length);
    return [...MENU_ROWS, ...LEAD_ROWS].find((r) => r.id === id) ?? null;
  }

  /** The reply to a row. "Existing customer help" looks the customer up first (SERVICE_OR_ESCALATION). */
  private async rowReply(row: MenuRow, s: Saved, noHealth = false): Promise<string> {
    const l = s.customer.language;
    if (row.id === "menu_service") return await this.serviceReply(s);
    // health consent refused: the discovery row would ask a health question
    if (noHealth && row.id === "menu_need") return fixedReply("health_consent_no", l);
    if (noHealth && row.id === "menu_explain") return withoutClosingQuestion(menuReply(row, l));
    return menuReply(row, l);
  }

  // One acknowledgement while ESCALATED / PAUSE (marker PARKED_ACK in pending_action, cleared when the
  // conversation is back in a normal state). Quiet while a person has the chat, while callback options are
  // waiting for an answer, and after the first acknowledgement.
  private async acknowledgeWhileParked(m: Inbound, s: Saved) {
    const conv = s.conversation;
    if (conv.taken_over_by_id) return;
    const l = s.customer.language;
    const cb = (conv.pending_action ?? "").match(/^callback_time:([^:]+):(.*)$/);
    if (cb && conv.state === ConversationState.Escalated) {
      // waiting for a callback choice: never silent. A plain question gets its answer, then the options
      // again (windows that have passed are replaced by fresh ones).
      let options = unpackWindows(cb[2]);
      if (!options.length || options[0].from.getTime() < Date.now()) {
        options = callbackOptions();
        if (options.length) await this.setPending(s, `callback_time:${cb[1]}:${packWindows(options)}`);
      }
      const first = asksWhyDate(m.text) ? dateRuleText(l, undefined, false) : say(STILL_HERE_T, l);
      await this.sendAndSave(
        s.customer.id,
        [first, options.length ? callbackQuestion(options, l) : ""].filter(Boolean).join("\n\n"),
        m.waMessageId,
      );
      return;
    }
    if (conv.pending_action === PARKED_ACK) {
      // after the one acknowledgement the bot stays quiet, but "are you there?" is always answered
      if (asksIfThere(m.text))
        await this.sendAndSave(
          s.customer.id,
          conv.state === ConversationState.Pause ? say(PAUSE_ACK_T, l) : say(STILL_HERE_T, l),
          m.waMessageId,
        );
      return;
    }
    if (conv.pending_action?.startsWith("callback_time:")) return;
    const key = conv.state === ConversationState.Pause ? PAUSE_ACK_T : ESCALATED_ACK_T;
    await this.setPending(s, PARKED_ACK);
    await this.sendAndSave(s.customer.id, say(key, s.customer.language), m.waMessageId);
  }

  // SERVICE_OR_ESCALATION (Playbook 3): look the customer up and say what is on record
  private async serviceReply(s: Saved): Promise<string> {
    const c = s.customer;
    const open = await booking_request.find({
      where: { customer_id: c.id, booking_status: BookingStatus.PendingConfirmation },
      relations: { centre: true },
      take: 3,
    });
    const link = await activation.findOne({
      where: {
        customer_id: c.id,
        payment_status: PaymentStatus.Pending,
        activation_status: ActivationStatus.LinkSent,
      },
    });
    const openCase = await task.findOne({
      where: {
        customer_id: c.id,
        task_status: In([TaskStatus.Open, TaskStatus.InProgress]),
        type: In([
          TaskType.Escalation,
          TaskType.HumanHandoff,
          TaskType.PaymentIssue,
          TaskType.Servicing,
          TaskType.VerifyActivation,
        ]),
      },
    });
    return serviceSummaryText(
      {
        product: c.active_product ?? null,
        plan: c.active_plan ?? null,
        bookings: open.map((b) => ({ centre: b.centre?.name ?? "", date: b.preferred_date })),
        linkPending: !!link,
        openCase: !!openCase,
      },
      c.language,
    );
  }

  // The customer's question after "Existing customer help": a person answers it (Playbook 3, 16.4).
  // Approved FAQ answers were already given before this point.
  private async handleServiceRequest(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.state !== ConversationState.ServiceOrEscalation) return false;
    // no message text in the task: it may hold health or payment details (Playbook 16.3)
    const taskId = await this.createTaskOnce(
      TaskType.Servicing,
      TaskPriority.Normal,
      s,
      `wamid:${m.waMessageId} existing customer help request`,
    );
    await this.setState(s, [ConversationState.Escalated]);
    const text = await this.withCallbackOptions(
      s,
      taskId,
      say(SERVICE_ESCALATE, s.customer.language),
    );
    await this.sendAndSave(s.customer.id, text, m.waMessageId);
    return true;
  }

  // Playbook 3.1: an active product blocks another activation; the team gets a servicing task
  private async blockOtherProduct(s: Saved): Promise<string> {
    await this.createTaskOnce(
      TaskType.Servicing,
      TaskPriority.Normal,
      s,
      `active ${s.customer.active_product} customer asked for another activation`,
    );
    return activeProductBlock(
      s.customer.active_product ?? null,
      s.customer.active_plan ?? null,
      s.customer.language,
    );
  }

  // Replies to the outbound lead template (Playbook 4.1) and to the 4.5 priority question
  private async handleLead(
    m: Inbound,
    s: Saved,
    consentStatus: string,
    cons: consent | null,
  ): Promise<boolean> {
    const p = s.conversation.pending_action;
    const l = s.customer.language;
    if (p === "lead_priority") {
      const k = leadPriority(m.text);
      if (!k) {
        if (/\?\s*$/.test(m.text.trim())) {
          await this.setPending(s, null); // a question: answered normally
          return false;
        }
        await this.sendAndSave(s.customer.id, menuReply(LEAD_ROWS[1], l), m.waMessageId);
        return true;
      }
      await this.setPending(s, null);
      await this.sendAndSave(s.customer.id, LEAD_SUMMARY[k][lang(l)], m.waMessageId);
      return true;
    }
    if (p !== "lead_intro") return false;
    const row = matchLeadRow(m.text);
    await this.setPending(s, null);
    if (!row) return false; // anything else: a normal first message
    if (row.id === "lead_yes" && (consentStatus === "none" || consentStatus === "awaiting")) {
      // discovery asks about health: the notice first, then question 1 right after the YES (16.3)
      await this.setPending(s, "after_consent:lead_yes");
      await this.sendAndSave(s.customer.id, fixedReply("health_notice", l), m.waMessageId);
      await this.saveConsentRow(s.customer.id, cons, (c) => {
        c.notice_sent_at = new Date();
        c.notice_sent_version = NOTICE_VERSION;
      });
      return true;
    }
    const text =
      row.id === "lead_yes" && consentStatus === "refused"
        ? fixedReply("health_consent_no", l)
        : menuReply(row, l);
    await this.sendAndSave(s.customer.id, text, m.waMessageId);
    await this.enterRow(row, s);
    return true;
  }

  private async enterRow(row: MenuRow, s: Saved) {
    // FOLLOW_UP_TIME is reached through INTENT_MENU from a brand-new chat (state machine, Playbook 3)
    await this.setState(s, [ConversationState.IntentMenu, row.state]);
    if (row.id === "lead_details") await this.setPending(s, "lead_priority");
    if (row.state === ConversationState.FollowUpTime) await this.setPending(s, "follow_up_time");
  }

  // One transaction; throws when it cannot save (fail closed)
  private async saveConsentRow(
    customerId: string,
    cons: consent | null,
    change: (c: consent) => void,
  ) {
    await this._DataSource.transaction(async (mg) => {
      const c = cons ?? mg.create(consent, { customer_id: customerId });
      change(c);
      await mg.save(c);
    });
  }

  // Pipeline: guardrails -> consent gate -> last 20 messages -> the LLM -> validator -> send -> save
  // One customer message: the turn, then the rescue alarm if the customer goes quiet (Playbook 15)
  async process(m: Inbound, s: Saved): Promise<void> {
    await this.lookupInCrm(s);
    await this.customerReplied(s);
    await this.processTurn(m, s);
    await this.askConsentLater(m, s);
    await this.afterTurn(m, s);
    await this.markHandledWithoutReply(m, s);
  }

  // The turn finished without a reply on purpose (opted out, a person has the case, already acknowledged,
  // ...). Marked so the lost-message recovery does not requeue it every minute: those requeues block the
  // one-at-a-time inbound queue for every other customer. A turn that failed never gets here (it stays
  // "received" and is retried / recovered as before).
  private async markHandledWithoutReply(m: Inbound, s: Saved) {
    if (!s.message?.id) return;
    try {
      if (await this.alreadyReplied(m.waMessageId)) return;
      await message.update(
        { id: s.message.id, message_status: "received" },
        { message_status: "no_reply" },
      );
    } catch (e) {
      this.logger.debug(`message status not updated: ${(e as Error).message}`);
    }
  }

  private async processTurn(m: Inbound, s: Saved): Promise<void> {
    await this.mirrorLanguage(m, s);
    // a retried job must not do the work (or reply) twice: already answered = job done
    if (await this.alreadyReplied(m.waMessageId)) return;

    const cons = await consent.findOne({ where: { customer_id: s.customer.id } });

    // 1. Guardrails run first: before the LLM, before any context is loaded, and even for an
    // opted-out customer (a safety reply must still go out). A hit ends the turn.
    const hit = this._Guardrail.check(m.text);
    // the customer's response to the last trigger (Trigger layer 13: trigger-to-response KPIs)
    await this.markTriggerResponse(
      s.conversation.id,
      hit?.kind === "stop" || hit?.also_stop
        ? "opted_out"
        : hit && hit.kind !== "emergency" && hit.kind !== "self_harm"
          ? "escalated"
          : "replied",
    );
    if (hit) {
      await this.handleGuardrail(hit, m, s, cons);
      return;
    }

    if (cons?.opt_out_at) {
      // "START" (whole message) is the only way back in; anything else gets no reply at all
      if (isOptIn(m.text)) await this.recordOptIn(m, s, cons);
      return;
    }

    // A voice note, photo, file or sticker with no text: the bot cannot read it, so it says so and asks for a
    // few typed words (a photo or file goes to the team as a task: it may be a bill or a prescription).
    // A photo WITH a caption carries on with the caption as the message.
    const media = (m.type ?? "text").toLowerCase();
    if (MEDIA_TYPES.has(media) && !(m.text || "").trim()) {
      await this.handleMedia(media, m, s);
      return;
    }

    // The customer opened the chat for the first time (WhatsApp "welcome message" event, before they type):
    // the welcome and the options at once (client, 16 Nov 2026). No consent or health question in it.
    if (m.type === "request_welcome") {
      await this.sendAndSave(s.customer.id, openingList(s.customer.language), m.waMessageId);
      if (s.conversation.state === ConversationState.New)
        await this.setState(s, [ConversationState.IntentMenu]);
      return;
    }

    // 1a. Strict order (plan 12.10). A retried or recovered job can reach us after a NEWER message from
    // the same customer was already answered. Running it now would read an old "yes" or "hi" as the
    // answer to today's question, so it is skipped (safety and STOP were already handled above).
    if (await this.isStale(s)) {
      await message.update(s.message!.id, { message_status: "stale" });
      this.logger.warn(
        `conversation ${s.conversation.id}: message ${s.message!.id} skipped, a newer message was already answered`,
      );
      return;
    }

    // ESCALATED: the one answer the bot still reads is the callback time it offered (Trigger O)
    if (
      s.conversation.state === ConversationState.Escalated &&
      (await this.handleCallbackTime(m, s))
    )
      return;
    // Safety pause, or a person has taken the chat over: the bot stays out of it (one acknowledgement).
    // ESCALATED with no person in the chat yet: the team has the case AND the bot keeps answering every
    // question meanwhile (client, 16 Nov 2026: "after 'our team will connect with you' the bot stops").
    if (
      s.conversation.state === ConversationState.Pause ||
      (s.conversation.state === ConversationState.Escalated && !!s.conversation.taken_over_by_id)
    ) {
      await this.acknowledgeWhileParked(m, s);
      return;
    }
    if (s.conversation.pending_action === PARKED_ACK) await this.setPending(s, null); // resolved meanwhile

    // 1b. DPDP health-data consent gate. Server-side, before any context is loaded and before the LLM is
    // called, so no health question can be asked (or even generated) until YES is saved for the CURRENT
    // notice version. Only the customer's own words decide it, never the LLM. Any other state fails closed.
    const consentStatus = healthConsentStatus(cons);
    // Playbook 4.1 / 4.5 and FOLLOW_UP_TIME: steps with no health question run before the consent gate
    if (await this.handleLead(m, s, consentStatus, cons)) return;
    if (s.conversation.pending_action === "follow_up_time" && (await this.handleFollowUpTime(m, s)))
      return;
    // Client, 16 Nov 2026: "the customer can ask any question, the bot should respond". A question (or a
    // row that needs no health detail) before the consent is answered first, with NO health question and
    // nothing health-related stored; the notice follows right after the answer (askConsentLater). The consent
    // step itself runs for the first message (welcome), a YES / NO to the notice, and the health-need row.
    let consentLater: "none" | "awaiting" | null = null;
    if (consentStatus === "none" || consentStatus === "awaiting") {
      if (this.consentStepNow(consentStatus, m, s)) {
        await this.handleConsentStep(consentStatus, m, s, cons);
        return;
      }
      consentLater = consentStatus;
      (s as any).consentLater = consentStatus;
    }
    // refused, or not given yet: the LLM may talk, but never about health
    const healthBlocked = consentStatus === "refused" || !!consentLater;

    // 1c. Opening list (plan 12.2). A new conversation gets the welcome + 4-row list (state INTENT_MENU).
    // A tap on a row goes to that row's state with a fixed reply. Anything else is a normal conversation.
    if (consentStatus === "granted" || healthBlocked) {
      const row = matchMenuRow(m.text);
      const tapped = !!row && m.text.trim().toLowerCase() === row.id; // a list tap sends the row id
      if (row && (tapped || s.conversation.state === ConversationState.IntentMenu)) {
        await this.sendAndSave(
          s.customer.id,
          await this.rowReply(row, s, healthBlocked),
          m.waMessageId,
        );
        await this.enterRow(row, s);
        return;
      }
      if (s.conversation.state === ConversationState.New) {
        await this.sendAndSave(s.customer.id, openingList(s.customer.language), m.waMessageId);
        await this.setState(s, [ConversationState.IntentMenu]);
        return;
      }
    }

    // 1d. Answers the system is waiting for, and questions with an approved fixed answer (no LLM)
    if (await this.handleCmbGate(m, s)) return;
    if (await this.handleLocationShare(m, s)) return;
    if (await this.handleCentreLocationText(m, s)) return;
    if (await this.handleCentreRadius(m, s)) return;
    if (await this.handleCentreCity(m, s)) return;
    if (await this.handleRebookOffer(m, s)) return;
    if (await this.handleCentrePick(m, s)) return;
    if (await this.handleBooking(m, s)) return;
    if (await this.handleNearbyAsk(m, s)) return;
    if (await this.handleFollowUpTime(m, s)) return;
    if (await this.handlePlanSpend(m, s)) return;
    if (await this.handlePlanAge(m, s)) return;
    if (await this.handlePriceSpend(m, s)) return;
    if (await this.handleCloseOffer(m, s)) return;
    if (await this.handleActivationAnswer(m, s)) return;
    if (await this.handleSoftActivationAnswer(m, s)) return;
    if (await this.handlePaymentReply(m, s)) return;
    if (await this.handleInsurance(m, s)) return;
    if (await this.handleCentreSaving(m, s)) return;
    if (await this.handleFaq(m, s, healthBlocked)) return;
    if (await this.handlePlanNextStep(m, s)) return;
    if (await this.handleServiceRequest(m, s)) return;
    if (await this.handleBarrier(m, s)) return;
    if (await this.handleMedicine(m, s, healthBlocked)) return;
    if (await this.handleObjection(m, s, healthBlocked)) return;
    if (await this.handleClosing(m, s, healthBlocked)) return;
    if (await this.handleRescueSignal(m, s, healthBlocked)) return;

    // the first message of a conversation starts the discovery
    await this.setState(s, [ConversationState.Discovery]);

    // 2. Last 20 messages
    const rows = await message.find({
      where: { conversation_id: s.conversation.id },
      order: { created_on: "DESC" } as any,
      take: 20,
    });
    const history: ChatTurn[] = rows
      .reverse()
      .filter((r) => r.body)
      .map((r) => ({ role: r.direction === "in" ? "user" : "assistant", content: r.body }));
    // The LLM needs the conversation to start with and end on a user turn
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length) history.push({ role: "user", content: m.text });
    // the current message must be the last (user) turn
    if (history[history.length - 1].role !== "user")
      history.push({ role: "user", content: m.text });

    const context = this.describe(
      s.customer,
      cons,
      !healthBlocked,
      s.conversation,
      await this.knownFacts(s, !healthBlocked),
    );

    // 3. The LLM + validator (retry once)
    let result: LlmResult | null = null;
    let feedback: string | undefined;
    // what the customer already answered: a draft that asks it again is rewritten (seen 16 Nov: "what
    // consultation …?" asked twice, "for you or a family member?" after "for me")
    let knownNeed: need | null = null;
    try {
      knownNeed = await need.findOne({ where: { conversation_id: s.conversation.id } });
    } catch {
      knownNeed = null; // no check is better than no reply
    }
    const settled = await this.activationSettled(s);
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        const draft = await this._Llm.generate(history, context, feedback);
        if (draft.needs_human && !draft.reply_text) break;
        // refused customer: a reply that asks about health is never sent (checked here, not by prompt)
        if (healthBlocked && asksHealthQuestion(draft.reply_text)) {
          feedback = "do not ask any health question";
          continue;
        }
        // promises the bot cannot keep (seen 16 Nov): a booking "noted" before it is saved, a payment taken
        // in the chat, the names of medicines
        const wrong =
          draftProblem(draft.reply_text, isBookingPending(s.conversation.pending_action)) ??
          asksKnownAgain(draft.reply_text, knownNeed as any);
        const repitch = wrong ? null : repitchProblem(draft.reply_text, settled, m.text);
        // the second draft still offers it: its closing question goes, the answer stays (never a hand-over
        // only for that)
        if (repitch && attempt === 1) draft.reply_text = withoutLastQuestion(draft.reply_text);
        else if (repitch) {
          feedback = repitch;
          continue;
        }
        if (wrong) {
          feedback = wrong;
          continue;
        }
        // prices and plan names only from plan_catalog; nothing about a second product
        const lockedProduct = s.customer.active_product || s.conversation.selected_product || null;
        const v = await this._Validator.validate(draft.reply_text, { lockedProduct });
        if (v.ok && draft.reply_text) result = draft;
        else {
          feedback = v.reasons.join("; ") || "empty reply";
          // the reasons only (never the draft text) go to the log
          this.logger.warn(
            `conversation ${s.conversation.id}: draft rejected (attempt ${attempt + 1}): ${feedback}`,
          );
        }
      } catch (e: any) {
        this.logger.error(`LLM call failed: ${e.message}`);
        feedback = "technical error";
      }
    }
    if (!result && this.busyWithQuestion(s)) {
      // mid-booking / mid-gate: no hand-over for one side question; the step is asked again
      this.logger.warn(
        `conversation ${s.conversation.id}: no usable draft mid-step, the step is asked again: ${feedback ?? "n/a"}`,
      );
      await this.sendAndSave(
        s.customer.id,
        [say(NOT_SURE_HERE_T, s.customer.language), ...this.pendingBack(s)].join("\n\n"),
        m.waMessageId,
      );
      return;
    }
    if (!result && s.conversation.state === ConversationState.Escalated) {
      // the team already has this chat: no second task, no second set of callback options
      this.logger.warn(
        `conversation ${s.conversation.id}: no usable draft while escalated: ${feedback ?? "n/a"}`,
      );
      await this.sendAndSave(
        s.customer.id,
        `${say(NOT_SURE_HERE_T, s.customer.language)}\n\n${await this.teamHasItText(s)}`,
        m.waMessageId,
      );
      return;
    }
    if (!result) {
      this.logger.warn(
        `conversation ${s.conversation.id}: draft replaced by the fixed holding message: ${feedback ?? "n/a"}`,
      );
      const holdTaskId = await this.createTask(
        TaskType.HoldingMessage,
        TaskPriority.High,
        s,
        `Draft rejected: ${feedback ?? "n/a"}`,
      );
      // a human picks it up (the task above). ESCALATED, not PAUSE: PAUSE is the safety state and
      // would be counted as an emergency in the trigger suppression and the KPIs
      await this.setState(s, [ConversationState.Escalated]);
      // Playbook 16.4: a callback the customer can choose, not an open-ended wait
      await this.sendAndSave(
        s.customer.id,
        await this.withCallbackOptions(s, holdTaskId, say(HOLDING_MESSAGE_T, s.customer.language)),
        m.waMessageId,
      );
      return;
    }

    // Playbook 1.1: one question per message, enforced (the LLM sometimes asks two)
    result = { ...result, reply_text: oneQuestion(result.reply_text) };
    // A side question in the middle of the booking or the Cut Medi Bills gate is answered and the same
    // step is asked again: the flow is still running, so the chat is not handed to a person for it.
    // (Asking for a person, complaints and safety are caught before the LLM and still escalate.)
    if (result.needs_human && this.busyWithQuestion(s)) {
      this.logger.log(
        `conversation ${s.conversation.id}: needs_human ignored, the booking/gate step continues`,
      );
      result = { ...result, needs_human: false };
    }

    // 4. Apply extracted fields + system-built additions (prices, links, centres come from the DB)
    if (healthBlocked) {
      // health answers are not stored, and a plan pick (it needs the yearly medical spend) is not made
      result = {
        ...result,
        extracted_fields: withoutHealthFields(result.extracted_fields || {}),
        intent: result.intent === "recommend" ? "other" : result.intent,
      };
    }
    // "Monthly 20,000": the yearly spend is worked out here (x 12), not left to the LLM, and it brings the
    // value check in this same turn instead of another "would you like to explore a plan?"
    const statedSpend = healthBlocked ? null : statedYearlySpend(m.text);
    if (statedSpend) {
      result = {
        ...result,
        extracted_fields: { ...(result.extracted_fields || {}), annual_medical_spend: statedSpend },
        intent: ["collect_needs", "other", "greeting"].includes(result.intent)
          ? "recommend"
          : result.intent,
      };
    }
    // CENTRE_SEARCH (the "Find or book a centre" row): the answer to "which city and locality" is a centre search
    if (
      s.conversation.state === ConversationState.CentreSearch &&
      ["collect_needs", "other", "greeting"].includes(result.intent)
    )
      result = { ...result, intent: "find_centre" };
    const shown = new Set<string>();
    const extras = await this.applyResult(result, s, m, shown);
    // One trigger per turn, decided now and recorded only AFTER the reply went out, so a failed send
    // (retried job) does not leave a trigger that "fired" without its content.
    // While the Cut Medi Bills gate is open no trigger fires; Trigger I is recorded when it passes.
    let decision: TriggerDecision | null = null;
    let assetsToSend: approved_asset[] = [];
    let contentText: string | null = null;
    let replaceReply = false; // A and C have approved wording: it replaces the draft
    let cta: string | null = null;
    if (this._Triggers && !s.conversation.pending_action?.startsWith("cmb_gate:")) {
      let trig = this._Triggers.inferCandidate(
        result.intent,
        s.conversation.selected_product,
        result.needs_human,
      );
      // D / E / F / I only when the list, plan, illustration or offer was really shown in this reply
      if (trig && NEEDS_SHOWN.includes(trig) && !shown.has(trig)) trig = null;
      if (!trig && shown.has("F")) trig = "F";
      if (trig === "C" && !this.canWhyActivate(s)) trig = null;
      decision = await this._Triggers.decide(
        s.customer.id,
        s.conversation,
        trig,
        s.customer.active_product,
      );
      if (decision && !decision.suppression) {
        const lang = s.customer.language;
        if (decision.id === "A") {
          assetsToSend = trustPackAssets(await pickAssets("A", lang, s.conversation.id, 4));
          contentText = trustPackText(assetsToSend, true, s.customer.language);
          cta = officialReferences().website;
          replaceReply = true;
        } else if (decision.id === "C") {
          const asset = await pickAsset("C", lang, s.conversation.id);
          assetsToSend = asset ? [asset] : [];
          contentText = await this.whyActivateFor(s, asset);
          cta = asset?.url ?? null;
          replaceReply = true;
        } else if (ASSET_REQUIRED.includes(decision.id)) {
          // L: approved proof only, never an invented story; nothing approved = L does not fire
          assetsToSend = await pickAssets(decision.id, lang, s.conversation.id, 3);
          if (!assetsToSend.length) decision = null;
          else {
            contentText = proofText(assetsToSend, s.customer.language);
            cta = assetsToSend[0].url;
          }
        }
      }
    }
    // the booking flow asks its own question, and the centre list is the answer: the LLM draft would be a
    // second question or a second list (its own list is never sent: names it wrote are not checked)
    // (the same for a plan recommendation, the price disclosure and the age question: the LLM's own
    // recommendation next to it is what made the customer read the same plan twice)
    // (and the city / travel-distance question or the no-centre answer: the LLM wrote empty "1. 2. 3." lists there)
    if (["G", "D", "E", "AGE", "ASK"].some((k) => shown.has(k))) replaceReply = true;
    // a centre step (location, radius, list, no centre): the system's text is the whole reply. A list of
    // hospitals the LLM wrote by itself must never ride along with it.
    if (shown.has("LOC") || shown.has("CENTRE_STEP")) replaceReply = true;
    // a question interrupted the gate or the booking: answer it, then ask the same question again (12.2)
    let back = extras.length ? [] : this.pendingBack(s);
    // the same open question is not repeated under every answer: the last bot message already asked it
    const prevBot = [...history].reverse().find((t) => t.role === "assistant")?.content ?? "";
    if (back.length && prevBot.trim().endsWith(back[back.length - 1].trim())) back = [];
    // the draft loses its own question when the system asks one, any "please hold on" promise, and a
    // "Thank you for sharing" opener right after another one (Helper/ReplyTidy.ts)
    let callbackText = "";
    if (result.needs_human && s.conversation.state === ConversationState.Escalated) {
      // the team already has this chat: no second task, no second set of callback options
      callbackText = await this.teamHasItText(s);
    } else if (result.needs_human) {
      const taskId = await this.createTask(
        TaskType.HumanHandoff,
        TaskPriority.Normal,
        s,
        // no message text: it may hold health or payment details and this summary goes to the CRM (Playbook 16.3)
        `wamid:${m.waMessageId} the assistant could not answer confidently (intent ${result.intent}); read the chat`,
      );
      await this.setState(s, [ConversationState.Escalated]);
      // Trigger O: why a callback, then the options (never the bare list)
      callbackText = await this.withCallbackOptions(
        s,
        taskId,
        say(CALLBACK_REASON_T, s.customer.language),
      );
    }
    const systemParts = [...extras, contentText, ...back, callbackText].filter(
      (x): x is string => !!x,
    );
    const draftText = replaceReply
      ? null
      : tidyDraft(result.reply_text, {
          // the callback options ask for a choice too (they end with "Reply 1, 2 or 3", no question mark)
          systemAsks: !!callbackText || systemParts.some((x) => hasQuestion(x)),
          previousBotText:
            [...history].reverse().find((t) => t.role === "assistant")?.content ?? null,
        });
    const finalText = [draftText, ...systemParts].filter((x): x is string => !!x).join("\n\n");
    if (!s.conversation.pending_action && !s.customer.active_product && asksSpend(finalText) && !healthBlocked)
      await this.setPending(s, "plan_spend");
    // the LLM asked the age itself with the spend already known: the answer is read by handlePlanAge, which
    // picks ONE plan by value (client, 17 Nov: after the age it asked the expenses again)
    else if (
      !s.conversation.pending_action &&
      !s.customer.active_product &&
      !s.conversation.recommended_plan &&
      !healthBlocked &&
      asksAge(finalText) &&
      (await quiet(() => need.findOne({ where: { conversation_id: s.conversation.id } })))
        ?.annual_medical_spend
    )
      await this.setPending(s, "plan_age");
    // the location question goes out with the "Send location" button
    const withPinButton = shown.has("LOC") && [...finalText].length <= 1024;
    await this.sendAndSave(
      s.customer.id,
      withPinButton ? { kind: "location_request", body: finalText } : finalText,
      m.waMessageId,
    );
    if (decision)
      await this._Triggers!.record(s.customer.id, s.conversation, decision, result.intent, {
        assets: assetsToSend.map((a) => a.id),
        cta,
      });
    for (const a of assetsToSend) await this.logAssetSend(s, a, m.waMessageId);
  }

  // Playbook 1.1: reply in the customer's language. A message that is clearly Hindi (Devanagari),
  // Hinglish or English sets it; anything unclear keeps the stored one.
  private async mirrorLanguage(m: Inbound, s: Saved) {
    const detected = detectLanguage(m.text);
    if (!detected || detected === s.customer.language) return;
    s.customer.language = detected;
    try {
      await customer.update(s.customer.id, { language: detected });
    } catch (e) {
      this.logger.debug(`language not saved: ${(e as Error).message}`);
    }
  }

  // The question the bot is still waiting for (Cut Medi Bills gate or booking step), asked again after
  // an interruption (plan 12.2: answer the question, then return to the last unfinished question)
  private pendingBack(s: Saved): string[] {
    const openGate = s.conversation.pending_action?.startsWith("cmb_gate:")
      ? (s.conversation.pending_action.split(":")[1] as GateStep)
      : null;
    if (openGate && GATE_QUESTION[openGate]) return [gateQuestion(openGate, s.customer.language)];
    const d = readDraft(s.conversation.pending_action);
    return d ? [bookingQuestion(d.step, d, s.customer.language)] : [];
  }

  // Trigger C is about activating Oxxy: never with an active product, on the Cut Medi Bills route, or
  // after the customer clearly declined activation (Trigger layer 5)
  private canWhyActivate(s: Saved): boolean {
    return (
      !s.customer.active_product &&
      s.conversation.selected_product !== ProductType.CutMediBills &&
      s.conversation.outcome !== "activation_declined"
    );
  }

  private async whyActivateFor(s: Saved, asset: approved_asset | null): Promise<string> {
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    return whyActivateText(
      whyActivateVariant(n, s.customer.age ?? null),
      asset,
      s.customer.language,
    );
  }

  // Barriers with approved wording, answered without the LLM (Trigger layer 3, 5, 7 and 14.1):
  //  A "is this genuine?" -> the trust pack (first time: full message + approved proof; again: the links)
  //  C "why activate?"    -> preparedness message with the customer's variant (once per journey)
  //  E "compare plans"    -> the compact four-plan comparison with one plan marked (no link)
  private async handleBarrier(m: Inbound, s: Saved): Promise<boolean> {
    const text = m.text;
    const lang = s.customer.language;
    const reply = async (body: string) =>
      this.sendAndSave(s.customer.id, [body, ...this.pendingBack(s)].join("\n\n"), m.waMessageId);
    const decide = async (id: "A" | "C" | "E") =>
      (await this._Triggers?.decide(
        s.customer.id,
        s.conversation,
        id,
        s.customer.active_product,
      )) ?? null;

    if (asksTrust(text)) {
      const d = await decide("A");
      const first = this._Triggers ? !!d && !d.suppression : true;
      const assets = first
        ? trustPackAssets(await pickAssets("A", lang, s.conversation.id, 4))
        : [];
      await reply(trustPackText(assets, first, s.customer.language));
      if (d)
        await this._Triggers!.record(s.customer.id, s.conversation, d, "trust doubt", {
          assets: assets.map((a) => a.id),
          cta: officialReferences().website,
        });
      for (const a of assets) await this.logAssetSend(s, a, m.waMessageId);
      return true;
    }

    if (asksWhyActivate(text) && this.canWhyActivate(s)) {
      const d = await decide("C");
      if (this._Triggers && (!d || d.suppression)) return false; // explained already: the LLM answers
      const asset = await pickAsset("C", lang, s.conversation.id);
      await reply(await this.whyActivateFor(s, asset));
      if (d)
        await this._Triggers!.record(s.customer.id, s.conversation, d, "why activate", {
          assets: asset ? [asset.id] : [],
          cta: asset?.url ?? null,
        });
      if (asset) await this.logAssetSend(s, asset, m.waMessageId);
      return true;
    }

    // the price (Playbook 7 / 12.1): asked, or YES to the bot's own "would you like to know the price?"
    const priceAsked =
      asksPrice(text) || (isShortYes(text) && askedAboutPrice(await this.lastBotText(s)));
    if (priceAsked && !asksComparePlans(text)) {
      const body = await this.priceReply(s).catch((e: Error) => {
        this.logger.warn(`price reply not built: ${e.message}`);
        return null; // the normal reply answers it
      });
      if (body) {
        await reply(body);
        return true;
      }
    }

    if (asksComparePlans(text) && s.customer.active_product !== ProductType.CutMediBills) {
      const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      const body = await this.comparison(s, n);
      if (!body) return false;
      // asked explicitly: shown every time; recorded as E once per journey
      const d = await decide("E");
      await reply(body);
      if (d) await this._Triggers!.record(s.customer.id, s.conversation, d, "plan comparison");
      return true;
    }
    return false;
  }

  // Trigger layer 7: the four Oxxy plans from plan_catalog, ONE marked (the recommended plan, else the
  // plan that fits the need and age). No age yet = ask it instead of marking a plan. Never a link.
  private async comparison(s: Saved, n: need | null): Promise<string | null> {
    const rows = await plan_catalog.find({ where: { product: ProductType.Oxxy, status: true } });
    if (!rows.length) return null;
    const table: ComparisonRow[] = PLAN_ORDER.filter((p) => rows.some((r) => r.plan === p)).map(
      (p) => {
        const of = (b: string) => rows.find((r) => r.plan === p && r.billing === b);
        return {
          plan: p,
          monthly: of(BillingCycle.Monthly)?.price ?? null,
          yearly: of(BillingCycle.Yearly)?.price ?? null,
          age_limit: (of(BillingCycle.Yearly) ?? of(BillingCycle.Monthly))?.age_limit ?? null,
        };
      },
    );
    const conv = s.conversation;
    let rec = conv.recommended_plan;
    let ask: string | null = null;
    if (!rec && conv.selected_product !== ProductType.CutMediBills) {
      const yearly = rows.filter((r) => r.billing === BillingCycle.Yearly) as unknown as PlanLike[];
      const p = planForNeed(s.customer.age ?? null, n?.healthcare_need, yearly);
      if (p?.status === "plan") {
        rec = p.plan;
        await this.saveRecommendation(s, p.plan);
      } else if (p?.status === "ask_age") ask = say(ASK_AGE_T, s.customer.language);
    }
    return planComparisonText(
      table,
      rec ? { plan: rec, reason: planReason(rec, s.customer.language) } : null,
      ask,
      s.customer.language,
    );
  }

  // Routing group (Playbook 17) for a plan picked by need and age only: no value check ran
  // Playbook 7 / 9.2: the Oxxy plan by age and need, then the value check against the yearly spend. A plan
  // that does not pay for itself is still named with its price, honestly (no savings pitch). Saved at once.
  private async oxxyPlanByValue(
    s: Saved,
    n: need,
  ): Promise<{ askAge: boolean; text: string } | null> {
    const c = s.customer;
    const conv = s.conversation;
    const spend = Number(n.annual_medical_spend);
    const pick = await this._ValueCheck.recommend(spend, c.age ?? null, n.healthcare_need, ProductType.Oxxy);
    if (!pick) return null;
    if (pick.status === "ask_age") return { askAge: true, text: say(ASK_AGE_T, c.language) };
    const prices = await this._ValueCheck.prices(ProductType.Oxxy, pick.plan);
    conv.selected_product = ProductType.Oxxy;
    conv.recommended_plan = pick.plan;
    // Routing group (Playbook 17)
    conv.recommendation_reason = PLAN_REASON[pick.plan] ?? null;
    conv.value_check_passed = pick.status === "recommend";
    conv.alternate_product_suppressed = true;
    await conversation.update(conv.id, {
      selected_product: conv.selected_product,
      recommended_plan: conv.recommended_plan,
      recommendation_reason: conv.recommendation_reason,
      value_check_passed: conv.value_check_passed,
      alternate_product_suppressed: true,
    });
    await this.setState(s, [ConversationState.Routing, ConversationState.PlanFit]);
    const yearly = prices.yearly ?? pick.price;
    return {
      askAge: false,
      text:
        pick.status === "recommend"
          ? recommendText(pick.plan, yearly, prices.monthly, spend, pick.saving, c.language)
          : honestText(pick.plan, yearly, prices.monthly, spend, c.language),
    };
  }

  // The answer to "how much does your family spend on healthcare?" (client, 16 Nov: "it asked the expenses,
  // then the age, then the expenses again"): read here, never left to the LLM, saved as the yearly amount,
  // then the age question (pending plan_age) or ONE plan with its price. Not an amount = answered normally.
  private async handlePlanSpend(m: Inbound, s: Saved): Promise<boolean> {
    const pa = s.conversation.pending_action;
    if (pa !== "plan_spend" && pa !== PLAN_SPEND_ACTIVATE) return false;
    const activate = pa === PLAN_SPEND_ACTIVATE;
    await this.setPending(s, null);
    const amount = spendAnswer(m.text);
    if (!amount) return false;
    const cons = await consent.findOne({ where: { customer_id: s.customer.id } });
    if (healthConsentStatus(cons) !== "granted") return false; // the spend is health data: only with consent
    const n = await this.needRow(s);
    n.annual_medical_spend = amount;
    await n.save();
    const pick = await this.oxxyPlanByValue(s, n);
    if (!pick) return false;
    if (pick.askAge) await this.setPending(s, activate ? PLAN_AGE_ACTIVATE : "plan_age");
    const text = activate && !pick.askAge ? await this.pickThenActivate(s, pick.text) : pick.text;
    await this.sendAndSave(s.customer.id, text, m.waMessageId);
    return true;
  }

  // The answer to "may I know the patient's age?" (asked for the plan choice): saved, then ONE plan with its
  // price, by value when the yearly spend is known, else by need. Not an age = answered normally.
  private async handlePlanAge(m: Inbound, s: Saved): Promise<boolean> {
    const pa = s.conversation.pending_action;
    if (pa !== "plan_age" && pa !== PLAN_AGE_ACTIVATE) return false;
    const activate = pa === PLAN_AGE_ACTIVATE;
    await this.setPending(s, null);
    const age = parsePatientAge(m.text);
    if (!age) return false;
    s.customer.age = age;
    await customer.update(s.customer.id, { age });
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    const l = s.customer.language;
    let text: string | null = null;
    if (n?.annual_medical_spend) {
      const pick = await this.oxxyPlanByValue(s, n);
      if (pick && !pick.askAge) text = pick.text;
    }
    if (!text) {
      const plans = await plan_catalog.find({
        where: { product: ProductType.Oxxy, billing: BillingCycle.Yearly, status: true },
      });
      const p = planForNeed(age, n?.healthcare_need, plans as unknown as PlanLike[]);
      if (p?.status === "plan") {
        await this.saveRecommendation(s, p.plan);
        const prices = await this._ValueCheck.prices(ProductType.Oxxy, p.plan);
        text = prices.yearly
          ? `${needRecommendationText(p.plan, planReason(p.plan, l), l)} ${planPriceText(p.plan, prices.yearly, prices.monthly, l)}`
          : needRecommendationText(p.plan, planReason(p.plan, l), l);
      }
    }
    if (!text) return false;
    if (activate) text = await this.pickThenActivate(s, text);
    await this.sendAndSave(s.customer.id, text, m.waMessageId);
    return true;
  }

  // "What is the price?" (or YES to the bot's own "would you like to know the price?"): the price from
  // plan_catalog, never "the team will share it" and never a callback for it. No plan picked yet = the
  // four-plan comparison. No price in the catalogue = false (the normal path, which hands it to a person).
  private async priceReply(s: Saved): Promise<string | null> {
    const conv = s.conversation;
    const l = s.customer.language;
    const product = s.customer.active_product || conv.selected_product;
    if (product === ProductType.CutMediBills) {
      const p = await this._ValueCheck.prices(ProductType.CutMediBills, "cut_medi_bills");
      const rows = await plan_catalog.find({
        where: { product: ProductType.CutMediBills, status: true },
      });
      const by = (b: string) => rows.find((r) => r.billing === b)?.price ?? null;
      const monthly = p.monthly ?? by(BillingCycle.Monthly);
      const yearly = p.yearly ?? by(BillingCycle.Yearly);
      return monthly || yearly
        ? cmbPriceText(monthly ? Number(monthly) : null, yearly ? Number(yearly) : null, l)
        : null;
    }
    const plan = s.customer.active_plan || conv.recommended_plan;
    if (plan) {
      const prices = await this._ValueCheck.prices(ProductType.Oxxy, plan);
      if (prices.yearly)
        return planPriceText(
          plan,
          Number(prices.yearly),
          prices.monthly ? Number(prices.monthly) : null,
          l,
        );
    }
    const n = await need.findOne({ where: { conversation_id: conv.id } });
    return await this.comparison(s, n);
  }

  private async handleMedia(media: string, m: Inbound, s: Saved) {
    if (media === "sticker" || media === "reaction") return; // nothing to answer
    const l = s.customer.language;
    if (media === "audio" || media === "voice") {
      await this.sendAndSave(s.customer.id, say(MEDIA_VOICE_T, l), m.waMessageId);
      return;
    }
    await this.createTaskOnce(
      TaskType.Servicing,
      TaskPriority.Normal,
      s,
      `Customer sent a ${media} (bill, prescription or report?): open the chat to see it`,
    );
    await this.sendAndSave(s.customer.id, say(MEDIA_FILE_T, l), m.waMessageId);
  }

  /** The bot's last message in this chat (to read a short "yes" / "ok" as the answer to it) */
  private async lastBotText(s: Saved): Promise<string | null> {
    const row = await message.findOne({
      where: { conversation_id: s.conversation.id, direction: "out" },
      order: { created_on: "DESC" },
    });
    return row?.body ?? null;
  }

  private async saveRecommendation(s: Saved, plan: string) {
    const conv = s.conversation;
    conv.selected_product = ProductType.Oxxy;
    conv.recommended_plan = plan;
    conv.recommendation_reason = PLAN_REASON[plan] ?? null;
    conv.alternate_product_suppressed = true;
    await conversation.update(conv.id, {
      selected_product: conv.selected_product,
      recommended_plan: plan,
      recommendation_reason: conv.recommendation_reason,
      alternate_product_suppressed: true,
    });
  }

  // Content group (Playbook 17): which approved asset went out, in which WhatsApp message
  private async logAssetSend(s: Saved, a: approved_asset, inboundWamid: string) {
    try {
      const out = await message.findOne({
        where: { direction: "out", reply_to_wa_message_id: inboundWamid },
      });
      await asset_send.save(
        asset_send.create({
          customer_id: s.customer.id,
          conversation_id: s.conversation.id,
          asset_id: a.id,
          kind: a.kind,
          wa_message_id: out?.wa_message_id ?? null,
          source: "whatsapp_inbound",
        } as any),
      );
    } catch (e) {
      this.logger.warn(`asset send not logged: ${(e as Error).message}`);
    }
  }

  private describe(
    c: customer,
    cons: consent | null,
    healthQuestionsAllowed: boolean,
    conv?: conversation,
    known?: Record<string, unknown>,
  ): string {
    return JSON.stringify({
      first_name: c.first_name,
      language: c.language,
      age: c.age,
      active_product: c.active_product,
      whatsapp_consent: cons?.whatsapp_consent,
      health_questions_allowed: healthQuestionsAllowed,
      // what the customer already told us and where the conversation stands: never asked again
      ...(known ?? {}),
      // the human agent's hand-back note (Full Plan 12.9), for a week after the hand-back
      ...(teamNote(conv) ? { team_note: teamNote(conv) } : {}),
      // what the customer already told the voice AI on the phone (StartConversation), for a week
      ...(freshCallContext(conv) ? { call_context: freshCallContext(conv) } : {}),
    });
  }

  // What is already stored about this customer, for the LLM: without it the bot only "remembers" what is
  // still inside the last 20 messages and asks again for the city, the patient or the spend it already has.
  //  known            = the answers of THIS conversation (need row) + where it stands (state, plan, booking)
  //  from_earlier_chat = the answers and the plan of the customer's previous conversation, last 90 days
  //                      (to confirm in a few words, not to re-ask and not to assume)
  // Health fields are left out when the customer refused the health-data consent.
  private async knownFacts(s: Saved, healthAllowed: boolean): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const pick = (row: Record<string, any> | null, keys: string[]) => {
      const o: Record<string, unknown> = {};
      for (const k of keys) if (row?.[k] != null && row[k] !== "") o[k] = row[k];
      return healthAllowed ? o : withoutHealthFields(o);
    };
    try {
      const conv = s.conversation;
      const n = await need.findOne({ where: { conversation_id: conv.id } });
      const known = pick(n as any, KNOWN_NEED_FIELDS);
      if (conv.selected_product) known.selected_product = conv.selected_product;
      if (conv.recommended_plan) known.recommended_plan = conv.recommended_plan;
      if (conv.objection) known.objection = conv.objection;
      if (conv.outcome) known.outcome = conv.outcome;
      const b = await booking_request.findOne({
        where: {
          conversation_id: conv.id,
          booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]),
        },
      });
      if (b)
        known.booking_request = {
          status: (b as any).booking_status,
          preferred_date: (b as any).preferred_date,
        };
      if (Object.keys(known).length) out.known = known;
      out.conversation_state = conv.state;
      if (!n) {
        const earlier = await need
          .createQueryBuilder("n")
          .innerJoin(conversation, "c", "c.id = n.conversation_id")
          .where(
            `c.customer_id = :cid AND c.id <> :cur AND n.created_on > now() - interval '90 days'
             AND n.created_on > COALESCE((SELECT MAX(x.closed_at) FROM conversation x
                                           WHERE x.customer_id = :cid AND x.outcome = '${RESTARTED_FRESH}'), 'epoch')`,
            {
              cid: s.customer.id,
              cur: conv.id,
            },
          )
          .orderBy("n.created_on", "DESC")
          .getOne();
        // the last 90 days only: older answers (need, spend) are likely out of date
        const before = pick(earlier as any, EARLIER_NEED_FIELDS);
        const prev = earlier
          ? await conversation.findOne({ where: { id: (earlier as any).conversation_id } })
          : null;
        if (prev?.selected_product) before.selected_product = prev.selected_product;
        if (prev?.recommended_plan) before.recommended_plan = prev.recommended_plan;
        if (Object.keys(before).length) out.from_earlier_chat = before;
      }
    } catch (e) {
      this.logger.debug(`known facts not loaded: ${(e as Error).message}`);
    }
    return out;
  }

  // `shown` collects the triggers whose content this reply really carries (D list, E plan / disclosure)
  private async applyResult(
    r: LlmResult,
    s: Saved,
    m: Inbound,
    shown: Set<string> = new Set(),
  ): Promise<string[]> {
    const f = r.extracted_fields || {};
    const extras: string[] = [];
    const c = s.customer;
    const conv = s.conversation;
    // what the CRM had before this turn: an upsert goes out only when something changed
    const crmBefore = JSON.stringify(
      this.crmFields(s, await need.findOne({ where: { conversation_id: conv.id } })),
    );

    // customer fields
    if (f.first_name) c.first_name = String(f.first_name);
    if (["en", "hi", "hinglish"].includes(f.language)) c.language = f.language;
    if (Number.isFinite(Number(f.age)) && Number(f.age) > 0) c.age = Number(f.age);

    // rule: one active product per customer. Cut Medi Bills is set only after its eligibility gate
    // passes (plan 12.3 / 8.2), never straight from the LLM.
    let wantsCmb = false;
    if (f.selected_product && Object.values(ProductType).includes(f.selected_product)) {
      if (c.active_product && c.active_product !== f.selected_product) {
        extras.push(await this.blockOtherProduct(s));
      } else if (f.selected_product === ProductType.CutMediBills) {
        wantsCmb = conv.selected_product !== ProductType.CutMediBills;
      } else {
        conv.selected_product = f.selected_product;
      }
    }
    if (
      asksForCmb(m.text) &&
      !c.active_product &&
      conv.selected_product !== ProductType.CutMediBills
    )
      wantsCmb = true;
    // an active product blocks any other activation (Playbook 3.1): say so once and give the team a task
    const blockActive =
      !!c.active_product &&
      !extras.length &&
      (r.intent === "activate" ||
        (asksForCmb(m.text) && c.active_product !== ProductType.CutMediBills) ||
        (f.selected_product === ProductType.Oxxy && c.active_product === ProductType.CutMediBills));
    if (blockActive) extras.push(await this.blockOtherProduct(s));
    await c.save();

    // consent
    // health_data_consent is NOT read from the LLM: only the consent gate (the customer's own YES/NO) sets it
    if (f.whatsapp_consent != null) {
      const cons = await consent.findOne({ where: { customer_id: c.id } });
      if (f.whatsapp_consent != null) cons.whatsapp_consent = !!f.whatsapp_consent;
      await cons.save();
    }

    // needs
    const needKeys = [
      "beneficiary",
      "healthcare_need",
      "specialisation",
      "city",
      "locality",
      "travel_radius_km",
      "service_date",
      "expected_bill",
      "annual_medical_spend",
      "insurance_status",
      "urgency",
      "postcode",
      "condition_if_voluntary",
    ];
    const needData: any = {};
    for (const k of needKeys) if (f[k] != null && f[k] !== "") needData[k] = f[k];
    if (["ongoing", "single_expense"].includes(f.need_pattern))
      needData.need_pattern = f.need_pattern;
    else if (singleExpenseSignal(m.text)) needData.need_pattern = "single_expense"; // the LLM often leaves it out
    if (typeof f.pre_existing === "boolean") needData.pre_existing = f.pre_existing;
    let n = await need.findOne({ where: { conversation_id: conv.id } });
    const prevBill = n?.expected_bill != null ? Number(n.expected_bill) : null;
    // a new area named in the message ("near Peelamedu", "in the SITRA area"): read in code too, because the
    // LLM sees the stored area as "known" and often leaves it out (client, 17 Nov: every reply said Neelambur)
    const moved = await this.placeChange(m.text, n, needData);
    if (moved) {
      Object.assign(needData, moved);
      // asking about centres in the new area: the search runs there in this turn
      if (r.intent !== "book" && (conv.state === ConversationState.CentreSearch || asksNearby(m.text, true)))
        r.intent = "find_centre";
    }
    // another city with no locality: the old locality belonged to the old city ("Delhi" after "Neelambur")
    if (
      needData.city &&
      n?.city &&
      String(needData.city).trim().toLowerCase() !== String(n.city).trim().toLowerCase() &&
      needData.locality === undefined
    )
      needData.locality = null;
    if (Object.keys(needData).length) {
      if (!n) n = need.create({ conversation_id: conv.id } as any);
      Object.assign(n, needData);
      await n.save();
    }

    // Routing (plan 12.3): an explicit ask, or one known upcoming expense whose 30% saving beats the
    // monthly price + GST, goes to Cut Medi Bills, but only through the eligibility gate.
    let routedToCmb = false;
    const gateOpen = !!conv.pending_action?.startsWith("cmb_gate:");
    if (!gateOpen && !c.active_product && conv.selected_product !== ProductType.CutMediBills) {
      const single =
        r.intent === "recommend" &&
        n?.need_pattern === "single_expense" &&
        !!n?.expected_bill &&
        !n?.annual_medical_spend &&
        (await this.cmbValue(Number(n.expected_bill)))?.ok === true;
      if (wantsCmb || single) {
        const gate = await this.latestGate(conv.id);
        const named = f.centre_name ? String(f.centre_name).trim() : null;
        const otherCentre =
          !!named && named.toLowerCase() !== (gate?.centre_name || "").trim().toLowerCase();
        if (
          !gate ||
          (!gateFailed(gate) && !gateComplete(gate)) ||
          (gateFailed(gate) && otherCentre)
        ) {
          extras.push(await this.startCmbGate(s, n, named));
          routedToCmb = true;
        } else if (gateFailed(gate) && wantsCmb) {
          extras.push(say(GATE_FAILED_BEFORE_T, s.customer.language));
          routedToCmb = true;
        }
      }
    }

    // intent actions
    // Oxxy plan choice (12.3): age first, then by need, then the value check; an honest answer when no
    // plan pays for itself. Prices and the saving figure come from plan_catalog, never from the LLM.
    // "Yes, activate" with no plan picked yet but the yearly spend known: the plan is picked the same way as a
    // recommendation (value check, price from plan_catalog), never a second recommendation written by the LLM
    const oxxyRoute = (conv.selected_product || ProductType.Oxxy) === ProductType.Oxxy;
    const pickByValue =
      !routedToCmb &&
      !gateOpen &&
      oxxyRoute &&
      !!n?.annual_medical_spend &&
      (r.intent === "recommend" ||
        (r.intent === "activate" && !conv.recommended_plan && !c.active_product));
    // "activate" with the plan picked now: the recommendation without "Would you like the plan details?",
    // then the activation step below (client, 17 Nov: it went back to the plan details)
    let pickedToActivate = false;
    if (pickByValue) {
      const pick = await this.oxxyPlanByValue(s, n!);
      if (pick?.askAge) {
        extras.push(pick.text);
        shown.add("AGE");
        // the answer is read by handlePlanAge
        if (!conv.pending_action) conv.pending_action = r.intent === "activate" ? PLAN_AGE_ACTIVATE : "plan_age";
      } else if (pick) {
        pickedToActivate = r.intent === "activate";
        extras.push(pickedToActivate ? withoutLastQuestion(pick.text) : pick.text);
        shown.add("E");
      }
    }

    // Trigger F (Trigger layer 8, Playbook 9): a NEW expected bill on the Oxxy route gets the easy
    // illustration at 30%, or the recommended plan's lower rate (Everyday 20, Vital 25). Not when a plan
    // was just shown (that reply has its own figure) or on the Cut Medi Bills route (its offer has one).
    const bill = Number(f.expected_bill);
    if (
      !routedToCmb &&
      !gateOpen &&
      !shown.has("E") &&
      Number.isFinite(bill) &&
      bill > 0 &&
      bill !== prevBill &&
      conv.selected_product !== ProductType.CutMediBills &&
      c.active_product !== ProductType.CutMediBills
    ) {
      let rate = 30;
      if (conv.recommended_plan) {
        const row = await plan_catalog.findOne({
          where: {
            product: ProductType.Oxxy,
            plan: conv.recommended_plan,
            billing: BillingCycle.Yearly,
            status: true,
          },
        });
        const r2 = Number(row?.illustration_pct ?? row?.max_saving_pct);
        if (Number.isFinite(r2) && r2 > 0) rate = Math.min(30, r2);
      }
      const saving = computeSaving(bill, rate);
      if (saving > 0) {
        extras.push(illustrationText(rate, bill, saving, s.customer.language));
        shown.add("F");
      }
    }

    // Trigger E comparison when the LLM read the ask (the fixed phrases are handled before the LLM)
    if (
      r.intent === "compare_plans" &&
      !routedToCmb &&
      !gateOpen &&
      c.active_product !== ProductType.CutMediBills &&
      !shown.has("E")
    ) {
      const table = await this.comparison(s, n);
      if (table) {
        extras.push(table);
        shown.add("E");
      }
    }

    // Centre search steps: where (the "Send location" button, asked once; NO keeps the typed area), how far,
    // then the list. The draft never goes out with any of them: only the system names centres (Playbook 10).
    const centreStepFree = !isBookingPending(conv.pending_action) && !gateOpen;
    if (
      r.intent === "find_centre" &&
      !m.location &&
      centreStepFree &&
      (!n?.city || !(await this.locationAsked(s)))
    ) {
      conv.pending_action = "centre_location";
      extras.push(locationAskText(this.placeOf(n), s.customer.language));
      shown.add("LOC");
    } else if (r.intent === "find_centre" && !m.location && !n?.city) {
      extras.push(say(ASK_CITY_T, s.customer.language)); // never list centres from another city
      shown.add("ASK");
      shown.add("CENTRE_STEP");
    } else if (
      r.intent === "find_centre" &&
      !n?.travel_radius_km &&
      !m.location &&
      !isBookingPending(conv.pending_action) &&
      !gateOpen
    ) {
      // Playbook 10.1: collect the travel radius before suggesting centres
      conv.pending_action = "centre_radius";
      extras.push(say(RADIUS_Q, s.customer.language));
      shown.add("ASK");
      shown.add("CENTRE_STEP");
    } else if (r.intent === "find_centre" && readDraft(conv.pending_action)?.c) {
      // a booking for a verified centre is in progress: the list again would only confuse ("which doctor?")
    } else if (r.intent === "find_centre") {
      const text = await this.centreSuggestions(s, n, m.location);
      shown.add("CENTRE_STEP");
      if (text.shown) shown.add("D");
      else shown.add("ASK"); // no verified centre: that answer stands alone
      // "2" = the second centre. Any older marker (location or radius question) is replaced; a booking or
      // the Cut Medi Bills gate in progress keeps its own step.
      if (text.shown && !isBookingPending(conv.pending_action) && !gateOpen)
        conv.pending_action = "centre_pick";
      extras.push(text.text);
    }

    // Trigger G (Playbook 11): the step-by-step booking request, prefilled with what the LLM read
    if (
      r.intent === "book" &&
      !isBookingPending(conv.pending_action) &&
      !gateOpen &&
      !routedToCmb
    ) {
      extras.push(
        ...(await this.startBooking(s, {
          centreName: f.centre_name ? String(f.centre_name) : null,
          date: f.preferred_date ? String(f.preferred_date) : null,
          time: f.preferred_time ? String(f.preferred_time) : null,
          asked: asksToBook(m.text),
        })),
      );
      shown.add("G");
    }

    // Activation (12.5): price, GST and renewal first, then ask; the link goes only after a YES
    // (handleActivationAnswer). One product per customer.
    if (
      r.intent === "activate" &&
      (!pickByValue || pickedToActivate) &&
      !c.active_product &&
      !routedToCmb &&
      !gateOpen
    ) {
      const billing =
        f.billing || (/\bmonthly\b|\bmahina|\bmonth\b/i.test(m.text) ? "monthly" : undefined);
      let cat = await this.activationRow(conv, billing);
      // "Send me the link" with no plan picked yet (Trigger layer 15): ONE plan by need and age, its
      // price in the disclosure, no catalogue and no savings claim. No age yet = ask it first.
      if (
        !cat &&
        !conv.recommended_plan &&
        (conv.selected_product || ProductType.Oxxy) === ProductType.Oxxy
      ) {
        const plans = await plan_catalog.find({
          where: { product: ProductType.Oxxy, billing: BillingCycle.Yearly, status: true },
        });
        const p = planForNeed(c.age ?? null, n?.healthcare_need, plans as unknown as PlanLike[]);
        if (p?.status === "ask_age") {
          extras.push(say(ASK_AGE_T, s.customer.language));
          shown.add("AGE");
          if (!conv.pending_action) conv.pending_action = PLAN_AGE_ACTIVATE; // the activation follows the age
        } else if (p?.status === "plan") {
          await this.saveRecommendation(s, p.plan);
          extras.push(
            needRecommendationText(
              p.plan,
              planReason(p.plan, s.customer.language),
              s.customer.language,
            ),
          );
          cat = await this.activationRow(conv, billing);
        }
      }
      if (planReady(cat)) {
        conv.pending_action = `send_activation_link:${cat.id}`;
        await this.setState(s, this.activationPath(cat.product));
        shown.add("E");
        extras.push(
          disclosureText(
            this.productLabel(cat, s.customer.language),
            Number(cat.price),
            cat.billing,
            cat.renewal_terms,
            cat.activation_time,
            s.customer.language,
          ),
        );
      } else if (conv.selected_product || conv.recommended_plan) {
        const taskId = await this.createTaskOnce(
          TaskType.Activation,
          TaskPriority.Normal,
          s,
          `Customer wants to activate; plan not ready to sell, missing: ${planProblems(cat).join(", ")}`,
        );
        const l = s.customer.language;
        const label = cat ? this.productLabel(cat, l) : (conv.recommended_plan ?? "Oxxy");
        extras.push(
          await this.withCallbackOptions(s, taskId, say(ACTIVATION_BY_TEAM_T, l).replace("{plan}", label)),
        );
        shown.add("E"); // the fixed text answers it: the LLM's "I will process your payment" never goes out
      }
    }

    await conversation.update(conv.id, {
      selected_product: conv.selected_product,
      recommended_plan: conv.recommended_plan,
      pending_action: conv.pending_action ?? null,
      // Routing + Engagement groups (Playbook 17)
      recommendation_reason: conv.recommendation_reason ?? null,
      value_check_passed: conv.value_check_passed ?? null,
      alternate_product_suppressed: !!conv.alternate_product_suppressed || !!conv.selected_product,
      last_intent: r.intent,
      outcome: conv.outcome ?? null,
    });
    await this.syncCustomerToCrm(s, crmBefore, n);
    return extras;
  }

  // ---- CRM sync (Full Plan 3.2) ----

  /** The customer fields the CRM keeps (no health details: those stay in the bot, Playbook 16.3) */
  private crmFields(s: Saved, n?: need | null): Record<string, unknown> {
    const c = s.customer;
    const v = s.conversation;
    return {
      first_name: c.first_name ?? null,
      language: c.language ?? null,
      age: c.age ?? null,
      lead_id: c.lead_id ?? null,
      beneficiary: n?.beneficiary ?? null,
      city: n?.city ?? null,
      locality: n?.locality ?? null,
      need_pattern: n?.need_pattern ?? null,
      selected_product: v.selected_product ?? null,
      recommended_plan: v.recommended_plan ?? null,
    };
  }

  /** upsert_customer when a discovery field changed in this turn */
  private async syncCustomerToCrm(s: Saved, before: string, n?: need | null) {
    const now = this.crmFields(s, n);
    if (JSON.stringify(now) === before) return;
    await this._Outbox.emit?.(CrmAction.UpsertCustomer, s.customer.id, {
      customer_id: s.customer.id,
      whatsapp: `+${s.customer.wa_number}`,
      ...now,
    });
  }

  /** log_event: consent changes and other milestones the CRM record keeps */
  private async crmEvent(s: Saved, event: string, data: Record<string, unknown>) {
    await this._Outbox.emit?.(CrmAction.LogEvent, s.customer.id, {
      event,
      customer_id: s.customer.id,
      conversation_id: s.conversation.id,
      ...data,
      at: new Date().toISOString(),
    });
  }

  /**
   * lookup_customer on the first message of a conversation (Full Plan 3.2): the CRM's active product,
   * opt-out and id are copied in, so the one-product lock and STOP from a phone call hold in the chat too.
   * Runs in the queue worker (never in the webhook request). CRM off or slow = nothing changes.
   */
  private async lookupInCrm(s: Saved) {
    if (s.conversation.state !== ConversationState.New) return;
    const found = await this._Outbox.lookupCustomer?.(s.customer.wa_number);
    if (!found) return;
    const c = s.customer;
    const set: Record<string, unknown> = {};
    if (found.id && !c.crm_customer_id) set.crm_customer_id = found.id;
    if (found.active_product && !c.active_product) {
      set.active_product = found.active_product;
      set.active_plan = found.active_plan ?? null;
    }
    if (Object.keys(set).length) {
      await customer.update(c.id, set);
      Object.assign(c, set);
    }
    if (found.opted_out) {
      const cons = await consent.findOne({ where: { customer_id: c.id } });
      if (!cons?.opt_out_at)
        await this.saveConsentRow(c.id, cons, (x) => {
          x.opt_out_at = new Date();
          x.marketing_consent = false;
        });
    }
  }

  // ---- Cut Medi Bills gate (plan 8.2, 12.3). pending_action = "cmb_gate:<step>:<eligibility id>" ----

  private async latestGate(conversationId: string): Promise<eligibility | null> {
    return await eligibility.findOne({
      where: { conversation_id: conversationId },
      order: { created_on: "DESC" } as any,
    });
  }

  private async cmbPrices(): Promise<{
    monthly: plan_catalog | null;
    yearly: plan_catalog | null;
  }> {
    const rows = await plan_catalog.find({
      where: { product: ProductType.CutMediBills, status: true },
    });
    return {
      monthly: rows.find((r) => r.billing === BillingCycle.Monthly) ?? null,
      yearly: rows.find((r) => r.billing === BillingCycle.Yearly) ?? null,
    };
  }

  // value check on the one bill against the monthly price + GST; null when the catalogue has no price
  private async cmbValue(bill: number): Promise<{ ok: boolean; saving: number } | null> {
    const { monthly } = await this.cmbPrices();
    if (!monthly || !bill) return null;
    return cmbWorthIt(
      bill,
      Number(monthly.price),
      Number((monthly as any).illustration_pct ?? monthly.max_saving_pct ?? 30),
      Number(monthly.gst_rate) || 0.18,
    );
  }

  // Opens the gate and returns the first question. The answers are kept per centre in `eligibility`.
  private async startCmbGate(s: Saved, n: need | null, centreName: string | null): Promise<string> {
    const name = (centreName || "").trim().slice(0, 80) || null;
    const ctr = name ? await this.findVerifiedCentre(name) : null;
    const row = await eligibility.save(
      eligibility.create({
        customer_id: s.customer.id,
        conversation_id: s.conversation.id,
        centre_id: ctr?.id ?? null,
        centre_name: name,
        booking_state: "unknown",
        registration_state: "unknown",
        treatment_state: "unknown",
        bill_state: "unknown",
      } as any),
    );
    const step: GateStep = name ? "booking" : "centre";
    s.conversation.pending_action = `cmb_gate:${step}:${(row as any).id}`;
    await this.setState(s, [ConversationState.Routing, ConversationState.CutMediBillsFit]);
    return `${say(GATE_INTRO_T, s.customer.language)}\n\n${gateQuestion(step, s.customer.language)}`;
  }

  private async setPending(s: Saved, value: string | null) {
    await conversation.update(s.conversation.id, { pending_action: value });
    s.conversation.pending_action = value;
  }

  // One gate answer per turn. Returns true when this message was handled.
  private async handleCmbGate(m: Inbound, s: Saved): Promise<boolean> {
    const pending = s.conversation.pending_action;
    if (!pending?.startsWith("cmb_gate:")) return false;
    const [, step, id] = pending.split(":") as [string, GateStep, string];
    const row = await eligibility.findOne({ where: { id } });
    if (!row) {
      await this.setPending(s, null);
      return false;
    }
    const reply = (text: string) => this.sendAndSave(s.customer.id, text, m.waMessageId);
    const isQuestion = /\?\s*$/.test(m.text.trim());

    if (step === "centre") {
      if (isQuestion || !m.text.trim()) return false; // answered normally, then the same question again
      const name = m.text.trim().slice(0, 80);
      const ctr = await this.findVerifiedCentre(name);
      row.centre_name = name;
      row.centre_id = ctr?.id ?? null;
      await row.save();
      await this.setPending(s, `cmb_gate:booking:${id}`);
      await reply(gateQuestion("booking", s.customer.language));
      return true;
    }

    if (step === "bill_amount") {
      const amount = parseAmount(m.text);
      if (!amount) {
        if (isQuestion) return false;
        await reply(
          `${gateQuestion("bill_amount", s.customer.language)} ${say(ROUGH_AMOUNT_T, s.customer.language)}`,
        );
        return true;
      }
      let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
      n.expected_bill = amount;
      n.need_pattern = "single_expense";
      await n.save();
      await this.setPending(s, null);
      await reply(await this.cmbOutcome(s, amount));
      return true;
    }

    const gateStep = step as (typeof GATE_STEPS)[number];
    if (!GATE_STEPS.includes(gateStep)) {
      await this.setPending(s, null);
      return false;
    }
    const answer = parseConsentAnswer(m.text);
    if (answer === "unclear") {
      if (isQuestion) return false;
      await reply(gateQuestion(gateStep, s.customer.language));
      return true;
    }
    (row as any)[columnFor(gateStep)] =
      answer === "yes" ? (gateStep === "bill" ? "generated" : "done") : "none";
    await row.save();

    if (answer === "yes") {
      // not eligible at this centre: never offer Cut Medi Bills for it; Oxxy stays possible
      await this.setPending(s, null);
      await reply(notEligibleText(gateStep, s.customer.language));
      return true;
    }
    const next = GATE_STEPS[GATE_STEPS.indexOf(gateStep) + 1];
    if (next) {
      await this.setPending(s, `cmb_gate:${next}:${id}`);
      await reply(gateQuestion(next, s.customer.language));
      return true;
    }
    // all four answered NO: eligible. The value check needs the expected bill.
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    if (!n?.expected_bill) {
      await this.setPending(s, `cmb_gate:bill_amount:${id}`);
      await reply(gateQuestion("bill_amount", s.customer.language));
      return true;
    }
    await this.setPending(s, null);
    await reply(await this.cmbOutcome(s, Number(n.expected_bill)));
    return true;
  }

  // Eligible: run the value check, then offer Cut Medi Bills (Trigger I) or give the honest answer.
  private async cmbOutcome(s: Saved, bill: number): Promise<string> {
    const { monthly, yearly } = await this.cmbPrices();
    const value = await this.cmbValue(bill);
    if (!value) {
      await this.createTask(
        TaskType.Activation,
        TaskPriority.Normal,
        s,
        "Cut Medi Bills price missing in plan_catalog",
      );
      return say(HOLDING_MESSAGE_T, s.customer.language);
    }
    if (!value.ok) {
      await conversation.update(s.conversation.id, { value_check_passed: false });
      return cmbNotWorthText(bill, monthly ? Number(monthly.price) : null, s.customer.language);
    }
    await conversation.update(s.conversation.id, {
      selected_product: ProductType.CutMediBills,
      recommended_plan: null,
      // Routing group (Playbook 17)
      recommendation_reason: "one known upcoming expense, nothing done yet at the centre",
      value_check_passed: true,
      alternate_product_suppressed: true,
    });
    s.conversation.selected_product = ProductType.CutMediBills;
    s.conversation.recommended_plan = null;
    await this.recordTrigger(s, "I", "one upcoming expense, eligible");
    return cmbOfferText(
      bill,
      value.saving,
      monthly ? Number(monthly.price) : null,
      yearly ? Number(yearly.price) : null,
      [monthly?.activation_time, yearly?.activation_time].find((x) => !isPlaceholder(x)) ?? null,
      s.customer.language,
    );
  }

  private productLabel(cat: plan_catalog, l?: string | null): string {
    const hi = lang(l) === "hi";
    if (cat.product === ProductType.CutMediBills)
      return hi
        ? `Cut Medi Bills (${cat.billing === "monthly" ? "मासिक" : "वार्षिक"})`
        : `Cut Medi Bills (${cat.billing === "monthly" ? "monthly" : "annual"})`;
    return `Oxxy ${cat.plan.charAt(0).toUpperCase()}${cat.plan.slice(1)} ${hi ? "प्लान" : "plan"}`;
  }

  // The catalog row for the selected product: the recommended Oxxy plan (yearly unless the customer asked
  // for monthly), or Cut Medi Bills monthly / yearly.
  private async activationRow(
    conv: conversation,
    billingWanted?: string,
  ): Promise<plan_catalog | null> {
    const product = conv.selected_product || (conv.recommended_plan ? ProductType.Oxxy : null);
    if (!product) return null;
    const billing =
      billingWanted === BillingCycle.Monthly ? BillingCycle.Monthly : BillingCycle.Yearly;
    if (product === ProductType.Oxxy) {
      if (!conv.recommended_plan) return null;
      return await plan_catalog.findOne({
        where: { product, plan: conv.recommended_plan, billing, status: true },
      });
    }
    return await plan_catalog.findOne({ where: { product, billing, status: true } });
  }

  // The customer's answer to "Shall I send the official secure activation link?"
  // Returns true when this message was that answer (the turn is then finished).
  private async handleActivationAnswer(m: Inbound, s: Saved): Promise<boolean> {
    const pending = s.conversation.pending_action;
    if (!pending?.startsWith("send_activation_link:")) return false;
    // "I will discuss with my family", "let me think", "busy now": not a YES or a NO. The objection answer
    // (summary + a follow-up time, handleObjection) replies to it, never the next sales step (client, 17 Nov)
    const objection = detectObjection(m.text);
    const answer = objection && objection !== "not_interested" ? "unclear" : parseConsentAnswer(m.text);
    if (answer === "unclear") {
      await conversation.update(s.conversation.id, { pending_action: null }); // a question etc.: the LLM answers it
      s.conversation.pending_action = null;
      return false;
    }
    await conversation.update(s.conversation.id, { pending_action: null });
    s.conversation.pending_action = null;
    if (answer === "no") {
      await this.markTriggerResponse(s.conversation.id, "declined", {
        triggerId: "E",
        force: true,
      });
      await conversation.update(s.conversation.id, { outcome: "activation_declined" });
      await this.setPending(s, "follow_up_time");
      await this.sendAndSave(
        s.customer.id,
        `${say(LINK_DECLINED_T, s.customer.language)}\n\n${followUpQuestion(followUpOptions(), s.customer.language)}`,
        m.waMessageId,
      );
      return true;
    }
    await this.markTriggerResponse(s.conversation.id, "clicked", { triggerId: "E", force: true });
    const cat = await plan_catalog.findOne({ where: { id: pending.split(":")[1], status: true } });
    if (!cat || !planReady(cat) || s.customer.active_product) {
      await this.createTask(
        TaskType.Activation,
        TaskPriority.Normal,
        s,
        "Activation link could not be sent",
      );
      await this.sendAndSave(
        s.customer.id,
        say(HOLDING_MESSAGE_T, s.customer.language),
        m.waMessageId,
      );
      return true;
    }
    const actRow = await this._DataSource.transaction(async (mg) => {
      // switching before payment: the earlier unpaid link is cancelled, only the new product stays
      await mg.update(
        activation,
        {
          customer_id: s.customer.id,
          activation_status: In([ActivationStatus.Pending, ActivationStatus.LinkSent]),
        },
        { activation_status: ActivationStatus.Failed, payment_status: "cancelled" },
      );
      const a = await mg.save(
        mg.create(activation, {
          customer_id: s.customer.id,
          catalog_id: cat.id,
          product: cat.product,
          plan: cat.plan,
          billing: cat.billing,
          link_sent_at: new Date(),
          link_version: cat.version,
          // what the customer was shown (Playbook 17 Activation group): the disclosure always comes first
          price: cat.price,
          gst_rate: cat.gst_rate,
          renewal_terms_shown: true,
          payment_status: PaymentStatus.Pending,
          activation_status: ActivationStatus.LinkSent,
        } as any),
      );
      return await this._Outbox.enqueue(mg, CrmAction.CreateActivation, s.customer.id, {
        activation_id: (a as any).id,
        product: cat.product,
        plan: cat.plan,
        billing: cat.billing,
      });
    });
    await this._Outbox.dispatch(actRow);
    await this.setState(s, [ConversationState.AwaitingPayment]);
    await this.sendAndSave(
      s.customer.id,
      linkText(cat.activation_link, s.customer.language),
      m.waMessageId,
    );
    // Trigger Q: one reminder if the link is still unpaid (the scheduler re-checks everything at send time)
    await this._Scheduler?.create({
      customerId: s.customer.id,
      conversationId: s.conversation.id,
      kind: "trigger_q",
      scheduledFor: new Date(Date.now() + triggerQDelayMs()),
      templateName: "activation_reminder",
      reason: "link sent, payment not completed",
      selectedProduct: cat.product,
      source: "whatsapp_inbound",
    });
    return true;
  }

  private activationPath(product: string): ConversationState[] {
    return [
      ConversationState.Routing,
      product === ProductType.CutMediBills
        ? ConversationState.CutMediBillsFit
        : ConversationState.PlanFit,
      ConversationState.Activation,
    ];
  }

  // After a booking request (plan 12.4): the timing caution and ONE soft activation suggestion per
  // journey, never when a product is already active. Returns the text to add, or null.
  private async softActivationOffer(s: Saved, preferredDate: string): Promise<string | null> {
    if (s.customer.active_product) return null;
    const offered = await trigger_event.findOne({
      where: { conversation_id: s.conversation.id, trigger_id: "E", reason: "soft_activation" },
    });
    if (offered) return null;
    const product = s.conversation.selected_product || ProductType.Oxxy;
    const cat = await plan_catalog.findOne({
      where:
        product === ProductType.Oxxy && s.conversation.recommended_plan
          ? { product, plan: s.conversation.recommended_plan, status: true }
          : { product, status: true },
    });
    const caution =
      cat?.activation_time &&
      !isPlaceholder(cat.activation_time) &&
      activationAfter(preferredDate, cat.activation_time)
        ? timingCaution(cat.activation_time, s.customer.language)
        : null;
    await trigger_event.save(
      trigger_event.create({
        customer_id: s.customer.id,
        conversation_id: s.conversation.id,
        trigger_id: "E",
        reason: "soft_activation",
      } as any),
    );
    await this.setPending(s, "soft_activation");
    // Playbook 11.2 backend action: activation incomplete and not declined -> a human follow-up that may
    // answer activation questions (a decline turns it into booking confirmation only, no pitch)
    await this.createTask(
      TaskType.ActivationFollowUp,
      TaskPriority.Normal,
      s,
      `Booking recorded, activation not done: follow up on the booking and answer activation questions (${product === ProductType.CutMediBills ? "Cut Medi Bills" : `Oxxy${s.conversation.recommended_plan ? ` ${s.conversation.recommended_plan}` : ""}`})`,
      { extra: { selected_product: product, activation_pitch_allowed: true } },
    );
    const plan = s.conversation.recommended_plan;
    const planName =
      product === ProductType.Oxxy && plan
        ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`
        : null;
    return softActivationText(
      product === ProductType.CutMediBills ? "cut_medi_bills" : "oxxy",
      planName,
      caution,
      s.customer.language,
    );
  }

  // Declined after booking (Playbook 11.2 / 22.1): the follow-up covers booking confirmation only. The open
  // activation follow-up is closed and the CRM told not to pitch.
  private async stopActivationPitch(s: Saved) {
    const open = await task.find({
      where: {
        conversation_id: s.conversation.id,
        type: TaskType.ActivationFollowUp,
        task_status: TaskStatus.Open,
      } as any,
    });
    for (const t of open ?? []) {
      await task.update((t as any).id, {
        task_status: TaskStatus.Done,
        outcome: "customer declined activation: booking confirmation only, no activation pitch",
      } as any);
    }
    await this.crmEvent(s, "activation_declined", { activation_pitch_allowed: false });
  }

  // The answer to the soft activation suggestion. YES = disclosure (12.5), NO = booking stays recorded.
  private async handleSoftActivationAnswer(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "soft_activation") return false;
    const objection = detectObjection(m.text); // "discuss with my family": answered by handleObjection
    const answer = objection && objection !== "not_interested" ? "unclear" : parseConsentAnswer(m.text);
    await conversation.update(s.conversation.id, { pending_action: null });
    s.conversation.pending_action = null;
    if (answer === "unclear") return false; // a question: answered normally
    if (answer === "no") {
      await conversation.update(s.conversation.id, { outcome: "activation_declined" });
      s.conversation.outcome = "activation_declined";
      await this.markTriggerResponse(s.conversation.id, "declined", {
        triggerId: "E",
        force: true,
      });
      await this.stopActivationPitch(s);
      await this.sendAndSave(
        s.customer.id,
        say(SOFT_ACTIVATION_DECLINED_T, s.customer.language),
        m.waMessageId,
      );
      return true;
    }
    await this.startActivation(m, s);
    return true;
  }

  // Playbook 12.1: the customer wants to activate. Price, GST and renewal first (the link only after their
  // YES, handleActivationAnswer). No plan picked yet = the spend question. No official link in the catalogue
  // yet = said plainly, a person sends it (a task and callback times), never "send your payment method".
  private async startActivation(m: Inbound, s: Saved) {
    const l = s.customer.language;
    const text = await this.activationText(s);
    if (text === null) {
      // the spend is already known (no plan picked yet, e.g. the age question was skipped): never asked
      // again (client, 17 Nov: "expenses details two times"); the plan by value, or the age first
      const known = await quiet(() => need.findOne({ where: { conversation_id: s.conversation.id } }));
      if (known?.annual_medical_spend && !s.customer.active_product) {
        const pick = await this.oxxyPlanByValue(s, known);
        if (pick?.askAge) {
          await this.setPending(s, PLAN_AGE_ACTIVATE);
          await this.sendAndSave(s.customer.id, pick.text, m.waMessageId);
          return;
        }
        if (pick) {
          await this.sendAndSave(s.customer.id, await this.pickThenActivate(s, pick.text), m.waMessageId);
          return;
        }
      }
      // the answer is read by handlePlanSpend; ":activate" = once the plan is picked, the activation step
      // follows at once (client, 17 Nov: after the spend and the age it went back to "plan details?")
      await this.setPending(s, PLAN_SPEND_ACTIVATE);
      await this.sendAndSave(s.customer.id, say(T.spendFirst, l), m.waMessageId);
      return;
    }
    await this.sendAndSave(s.customer.id, text, m.waMessageId);
  }

  // The activation step for the plan picked: price, GST and renewal with "Shall I send the official secure
  // activation link?" (pending send_activation_link), or "our team will send the official link" with
  // callback times when the catalogue row is not ready to sell. null = no plan picked yet.
  private async activationText(s: Saved): Promise<string | null> {
    const l = s.customer.language;
    const cat = await this.activationRow(s.conversation);
    if (!cat) return null;
    if (!planReady(cat)) {
      const taskId = await this.createTaskOnce(
        TaskType.Activation,
        TaskPriority.Normal,
        s,
        `Customer wants to activate; plan not ready to sell, missing: ${planProblems(cat).join(", ")}`,
      );
      const text = say(ACTIVATION_BY_TEAM_T, l).replace("{plan}", this.productLabel(cat, l));
      return await this.withCallbackOptions(s, taskId, text);
    }
    await conversation.update(s.conversation.id, { pending_action: `send_activation_link:${cat.id}` });
    s.conversation.pending_action = `send_activation_link:${cat.id}`;
    await this.setState(s, this.activationPath(cat.product));
    return disclosureText(
      this.productLabel(cat, l),
      Number(cat.price),
      cat.billing,
      cat.renewal_terms,
      cat.activation_time,
      l,
    );
  }

  // The plan was picked for a customer who asked to activate: the recommendation without its closing
  // "Would you like the plan details?", then the activation step. No plan row = the recommendation alone.
  private async pickThenActivate(s: Saved, pickText: string): Promise<string> {
    const act = await this.activationText(s);
    return act ? `${withoutLastQuestion(pickText)}\n\n${act}` : pickText;
  }

  // After a plan was named: "yes" to "help activating it?" / "proceed with activation?", "I'll take this plan",
  // the Activate button = the activation (above); "yes" to "Would you like the plan details?" or "details" =
  // the plan's details (Playbook 7). Never left to the LLM: it used to promise payments it cannot take.
  private async handlePlanNextStep(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action || s.customer.active_product) return false;
    const text = (m.text || "").trim();
    if (!text || /\?\s*$/.test(text)) return false; // a question: answered normally
    const plan = s.conversation.recommended_plan;
    const cmb = s.conversation.selected_product === ProductType.CutMediBills;
    if (!plan && !cmb) return false;
    const last = await this.lastBotText(s);
    const yes = isShortYes(text) || parseConsentAnswer(text) === "yes";
    if (wantsToActivate(text) || (yes && askedAboutActivation(last))) {
      await this.startActivation(m, s);
      return true;
    }
    if (plan && !cmb && (wantsPlanDetails(text) || (yes && askedAboutPlanDetails(last)))) {
      const p = await this._ValueCheck.prices(ProductType.Oxxy, plan);
      await this.sendAndSave(
        s.customer.id,
        planDetailsText(plan, p.yearly ? Number(p.yearly) : null, p.monthly ? Number(p.monthly) : null, s.customer.language),
        m.waMessageId,
      );
      return true;
    }
    return false;
  }

  // Replies after the activation link (plan 12.5, AWAITING_PAYMENT). Charged twice is a complaint and
  // is handled by the guardrail before this. A question returns false and is answered normally.
  private async handlePaymentReply(m: Inbound, s: Saved): Promise<boolean> {
    const kind = paymentReplyKind(m.text);
    if (!kind) return false;
    const open = await activation.findOne({
      where: {
        customer_id: s.customer.id,
        payment_status: PaymentStatus.Pending,
        activation_status: ActivationStatus.LinkSent,
      },
      order: { created_on: "DESC" } as any,
    });
    if (!open) return false;

    if (kind === "done") {
      await this.createTaskOnce(
        TaskType.VerifyActivation,
        TaskPriority.High,
        s,
        `Customer says payment is done (activation ${(open as any).id})`,
      );
      await this.recordTrigger(s, "P", "customer said done");
      await this.setState(s, [ConversationState.FollowUp]);
      await this.sendAndSave(
        s.customer.id,
        say(PAYMENT_DONE_T, s.customer.language),
        m.waMessageId,
      );
      return true;
    }
    if (kind === "failed") {
      await this.createTaskOnce(
        TaskType.PaymentIssue,
        TaskPriority.High,
        s,
        `Payment failed (activation ${(open as any).id})`,
      );
      await this.setState(s, [ConversationState.Escalated]);
      await this.sendAndSave(
        s.customer.id,
        say(PAYMENT_FAILED_T, s.customer.language),
        m.waMessageId,
      );
      return true;
    }
    await this.setState(s, [ConversationState.FollowUp]);
    await this.setPending(s, "follow_up_time");
    await this.sendAndSave(
      s.customer.id,
      `${say(PAYMENT_NOT_NOW_T, s.customer.language)}\n\n${followUpQuestion(followUpOptions(), s.customer.language)}`,
      m.waMessageId,
    );
    return true;
  }

  // Sets customer_response on the latest trigger of this journey that has none yet (or, with force,
  // overrides it: e.g. YES to the activation link = clicked). Ignored = still empty after 24 hours.
  private async markTriggerResponse(
    conversationId: string,
    response: "replied" | "clicked" | "declined" | "opted_out" | "escalated",
    opts: { triggerId?: string; force?: boolean } = {},
  ) {
    try {
      const qb = trigger_event
        .createQueryBuilder("t")
        .addSelect("t.created_on") // not selected by default (BaseTable)
        .where("t.conversation_id = :c", { c: conversationId });
      if (opts.triggerId) qb.andWhere("t.trigger_id = :id", { id: opts.triggerId });
      const last = await qb.orderBy("t.created_on", "DESC").getOne();
      if (!last || (last.response && !opts.force)) return;
      if (Date.now() - new Date(last.created_on).getTime() > 24 * 60 * 60 * 1000 && !opts.force)
        return;
      await trigger_event.update(last.id, { response });
    } catch (e) {
      this.logger.debug(`trigger response not saved: ${(e as Error).message}`);
    }
  }

  private async recordTrigger(s: Saved, id: string, reason: string, extra: { cta?: string } = {}) {
    try {
      await trigger_event.save(
        trigger_event.create({
          customer_id: s.customer.id,
          conversation_id: s.conversation.id,
          trigger_id: id,
          reason,
          cta: extra.cta ?? null,
          conversation_source: "whatsapp_inbound",
          next_state: s.conversation.state,
        } as any),
      );
    } catch (e) {
      this.logger.debug(`trigger ${id} not recorded: ${(e as Error).message}`);
    }
  }

  // Trigger B / J: insurance questions get the approved fixed answer (the LLM never words this)
  private async handleInsurance(m: Inbound, s: Saved): Promise<boolean> {
    const t = (m.text || "").toLowerCase();
    if (!/insurance|\bbima\b|बीमा|इंश्योरेंस/.test(t)) return false;
    const has = hasInsurance(t);
    if (has) {
      let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
      n.insurance_status = "has_insurance";
      await n.save();
    }
    // Trigger layer 9 (M: "Fire Trigger B or J depending on the selected product"):
    //  Cut Medi Bills route + has insurance -> J (tell the team before insurance is applied)
    //  otherwise B: "I have insurance" -> keep it, Oxxy complements it; "Is Oxxy insurance?" -> plainly no
    const product = s.customer.active_product || s.conversation.selected_product;
    const trig = has && product === ProductType.CutMediBills ? "J" : "B";
    const text = say(
      trig === "J" ? INSURANCE_COORDINATION_T : has ? INSURANCE_HAS_ANSWER_T : INSURANCE_ANSWER_T,
      s.customer.language,
    );
    const decision =
      (await this._Triggers?.decide(
        s.customer.id,
        s.conversation,
        trig,
        s.customer.active_product,
      )) ?? null;
    // B adds its approved comparison when one is approved and not yet sent in this journey
    const asset =
      decision?.id === "B" && !decision.suppression
        ? await pickAsset("B", s.customer.language, s.conversation.id)
        : null;
    await this.sendAndSave(
      s.customer.id,
      [text, ...(asset ? [assetLine(asset)] : []), ...this.pendingBack(s)].join("\n\n"),
      m.waMessageId,
    );
    if (decision)
      await this._Triggers!.record(
        s.customer.id,
        s.conversation,
        decision,
        trig === "J"
          ? "has insurance, Cut Medi Bills route"
          : has
            ? "has insurance"
            : "is Oxxy insurance",
        { assets: asset ? [asset.id] : [], cta: asset?.url ?? null },
      );
    if (asset) await this.logAssetSend(s, asset, m.waMessageId);
    return true;
  }

  // "Do I get a discount at this hospital?" (Playbook 10, Trigger layer 6 and acceptance tests): the
  // neutral savings line, never a tie-up or an implied saving. Fixed text, so it is never a rejected
  // LLM draft. During the Cut Medi Bills gate the same gate question follows.
  // Playbook 13 FAQ, 4.3, 4.4 and 16.2: the approved answer, word for word (never an LLM rewording).
  // A question asked in the middle of the gate or the booking is answered, then the same step is asked
  // again; the answer's own closing question is dropped then, so the customer gets one question (1.1).
  private async handleFaq(m: Inbound, s: Saved, noHealth: boolean): Promise<boolean> {
    const key = matchFaq(m.text);
    if (!key) return false;
    const product = s.customer.active_product || s.conversation.selected_product || null;
    const lang = s.customer.language;
    const unsure = faqNeedsPerson(key, product);
    if (unsure) {
      // 16.4: "I want to give you a precise answer rather than guess", with callback windows
      const taskId = await this.createTaskOnce(
        TaskType.Escalation,
        TaskPriority.Normal,
        s,
        `Question needs a person: ${unsure}`,
      );
      await this.recordTrigger(s, "O", unsure);
      await this.setState(s, [ConversationState.Escalated]);
      await this.sendAndSave(
        s.customer.id,
        await this.withCallbackOptions(s, taskId, say(SERVICE_ESCALATE, lang)),
        m.waMessageId,
      );
      return true;
    }
    if (key === "early_activation") {
      // the customer asked, so the review is requested (never promised, never used for urgency)
      await this.createTaskOnce(
        TaskType.Activation,
        TaskPriority.Normal,
        s,
        "Customer asked for a senior review for earlier activation",
      );
    }
    let answer = faqAnswer(key, { product, noHealth }, lang);
    const back = this.pendingBack(s);
    if (back.length) answer = withoutClosingQuestion(answer);
    await this.sendAndSave(s.customer.id, [answer, ...back].join("\n\n"), m.waMessageId);
    return true;
  }

  private async handleCentreSaving(m: Inbound, s: Saved): Promise<boolean> {
    if (!asksCentreSaving(m.text)) return false;
    await this.sendAndSave(
      s.customer.id,
      [centreSavingReply(s.customer.language), ...this.pendingBack(s)].join("\n\n"),
      m.waMessageId,
    );
    return true;
  }

  // ---- Booking request (Playbook 11, Trigger layer G / H). pending_action = "booking:<draft json>" ----

  // Health consent refused: the specialisation question is a health question, so it is skipped
  private async noHealthQuestions(s: Saved): Promise<boolean> {
    const cons = await consent.findOne({ where: { customer_id: s.customer.id } });
    return healthConsentStatus(cons) !== "granted";
  }

  private async resolveCentre(name: string): Promise<Pick<BookingDraft, "c" | "cn" | "u">> {
    const clean = name.trim().slice(0, 80);
    const ctr = await this.findVerifiedCentre(clean);
    if (ctr)
      return { c: ctr.id, cn: ctr.branch ? `${ctr.name}, ${ctr.branch}` : ctr.name, u: false };
    // never rejected because we did not suggest it: the team checks it (plan 12.4, Playbook 10.2)
    return { c: null, cn: clean, u: true };
  }

  /** Starts the request with what is already known; returns the next question (or the saved request) */
  private async startBooking(
    s: Saved,
    pre: {
      centreName?: string | null;
      date?: string | null;
      time?: string | null;
      asked?: boolean;
    },
  ): Promise<string[]> {
    // "we are consulting in PSG hospital" names a centre, it does not ask for a booking: the offer
    // ("May I do your booking at ...?") comes first. Asked in so many words = no second asking.
    const d: BookingDraft = {
      step: "centre",
      ok: pre.asked !== false,
      ns: await this.noHealthQuestions(s),
    };
    if (pre.centreName?.trim()) Object.assign(d, await this.resolveCentre(pre.centreName));
    let dateNote: string | null = null;
    if (pre.date) {
      const iso = parseCustomerDate(pre.date);
      const chk = iso ? this._DateWindow.validate(iso) : null;
      if (iso && chk?.valid) d.d = iso;
      // "tomorrow" is outside the booking window: said at once, never dropped silently
      else if (iso && chk)
        dateNote = dateProblemText(String(chk.reason), undefined, s.customer.language);
    }
    if (pre.time?.trim()) d.t = pre.time.trim().slice(0, 40);
    const parts = await this.advanceBooking(s, d);
    return dateNote ? [dateNote, ...parts] : parts;
  }

  /** Asks the next unanswered question, or records the request when nothing is missing */
  private async advanceBooking(s: Saved, d: BookingDraft): Promise<string[]> {
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    const step = nextStep(d, !!n?.specialisation);
    if (!step) return await this.finishBooking(s, d, n);
    d.step = step;
    await this.setPending(s, writeDraft(d));
    await this.setState(s, [ConversationState.BookingCapture]);
    return [bookingQuestion(step, d, s.customer.language)];
  }

  private async finishBooking(s: Saved, d: BookingDraft, n: need | null): Promise<string[]> {
    await this.setPending(s, null);
    const date = d.d!;
    const time = d.t!;
    const spec = n?.specialisation || null;
    let text: string;
    if (d.c) {
      const ctr = await centre.findOne({ where: { id: d.c } });
      // activation is never a precondition (Playbook 3.1): always pending_confirmation
      await this._Booking.create({
        customer_id: s.customer.id,
        conversation_id: s.conversation.id,
        centre_id: d.c,
        specialisation: spec ?? undefined,
        preferred_date: date,
        preferred_time: time,
      });
      // the CRM creates the sales team's "confirm booking" task from create_booking_request,
      // so this local row is the console's mirror only (no second create_task call)
      await this.createTask(
        TaskType.BookingConfirm,
        TaskPriority.Normal,
        s,
        `Booking request at ${ctr?.name ?? d.cn} on ${date}, ${time}`,
        { sendToCrm: false },
      );
      if (n) {
        n.preferred_centre_id = d.c;
        await n.save();
      }
      await this.setState(s, [ConversationState.BookingCapture, ConversationState.BookingRecorded]);
      text = bookingSavedText({
        date,
        time,
        centre: ctr?.name ?? d.cn ?? "",
        branch: ctr?.branch,
        specialisation: spec,
        lang: s.customer.language,
      });
    } else {
      // a booking row needs a directory centre: the team checks the centre, then makes the booking
      await this.createTaskOnce(
        TaskType.DirectoryVerification,
        TaskPriority.Normal,
        s,
        `Booking request at a centre not in the directory: ${d.cn} (near ${d.l ?? "?"}) on ${date}, ${time}`,
      );
      text = bookingSavedText({
        date,
        time,
        centre: d.cn ?? "",
        specialisation: spec,
        unverified: true,
        lang: s.customer.language,
      });
    }
    await conversation.update(s.conversation.id, { outcome: "booking_requested" });
    s.conversation.outcome = "booking_requested";
    await this.recordTrigger(
      s,
      "H",
      d.c ? "booking request saved" : "booking request, centre to be verified",
    );
    const soft = await this.softActivationOffer(s, date);
    return soft ? [text, soft] : [text];
  }

  // After the centre list: "2" picks the second centre shown, then the booking offer (Trigger G).
  // Anything else ends the wait and is answered normally.
  // Up to five verified private centres for the customer's area and need (Playbook 10.1, Trigger D).
  // The ids shown are kept (Provider group), so "2" picks the second one.
  private async centreSuggestions(
    s: Saved,
    n: need | null,
    location?: { latitude: number; longitude: number },
    exclude?: string[],
  ): Promise<{ text: string; shown: boolean }> {
    // where the customer is: the pin they shared, else their locality looked up on the map (Google Geocoding)
    const origin = await this.originFor(n, location);
    const radiusKm = n?.travel_radius_km ?? 10;
    const query = {
      exclude,
      latitude: origin?.latitude,
      longitude: origin?.longitude,
      radiusKm,
      specialisation: n?.specialisation,
      city: n?.city,
      locality: n?.locality,
    };
    let list = await this._CentreSearch.search(query);
    // nothing inside the travel distance: the nearest verified centres a little further, said plainly
    // (client, 17 Nov: "no verified centre in Neelambur" in a loop, with two centres about 8 km away)
    let further = false;
    if (!list.length && origin && radiusKm < NEAREST_MAX_KM) {
      list = (await this._CentreSearch.search({ ...query, radiusKm: NEAREST_MAX_KM })).slice(0, 3);
      further = list.length > 0;
    }
    if (n) {
      n.suggested_centre_ids = list.map((x) => x.id);
      await n.save();
    }
    if (!list.length) return { text: await this.noCentreReply(s, n, origin), shown: false };
    // road distance and drive time for the few centres shown (Routes API); without it the straight line stays
    if (origin && this._Maps?.enabled) {
      const withPoint = list.filter((c) => Number(c.latitude) && Number(c.longitude));
      const travel = await this._Maps.travel(
        origin,
        withPoint.map((c) => ({ latitude: Number(c.latitude), longitude: Number(c.longitude) })),
      );
      withPoint.forEach((c, i) => {
        if (travel[i])
          Object.assign(c, { distance_km: travel[i]!.distance_km, minutes: travel[i]!.minutes });
      });
    }
    const spec = normaliseSpecialisation(n?.specialisation) ?? null;
    if (further)
      return {
        text: nearestListText(list, spec, this.placeOf(n) ?? n?.locality ?? null, radiusKm, s.customer.language),
        shown: true,
      };
    return { text: centreListText(list, spec, s.customer.language), shown: true };
  }

  // No verified centre for this place. First time: say so and ask for another centre and branch (this or
  // another location). Asked again right after: never the same sentence in a loop; the team gets a task
  // to check the options there and the customer is told so.
  private async noCentreReply(s: Saved, n: need | null, origin?: GeoPoint | null): Promise<string> {
    const l = s.customer.language;
    const place =
      [n?.locality, n?.city]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join(", ") || null;
    const last = await message.findOne({
      where: { conversation_id: s.conversation.id, direction: "out" },
      order: { created_on: "DESC" } as any,
    });
    const lastBody = String((last as any)?.body ?? "");
    // "again" only for the SAME place: a new area named after a no-centre reply is a fresh search
    const again = isNoCentreText(lastBody) && (!place || lastBody.includes(place));
    // the second reply was already sent: a third, different line (never the same sentence in a loop)
    const third = again && isRepeatNoCentreText(lastBody);
    // the team hears about the gap: always the second time, and at once when Google Maps can list what is there
    if ((again && !third) || (!again && origin && this._Maps?.enabled))
      await this.reportCentreGap(s, place, origin ?? null, n?.travel_radius_km ?? 10);
    // where verified centres ARE (customers asked "in which area do you have centres?"); naming one of those
    // cities next searches there (handleCentreCity)
    const cities = await this.centreCities();
    const here = String(n?.city ?? "").trim().toLowerCase();
    const others = cities.filter((c) => c.toLowerCase() !== here);
    const text = noCentreText(place, again, l, third);
    if (!others.length) return text;
    await this.setPending(s, "centre_city");
    return `${text}\n\n${say(CENTRE_CITIES_T, l).replace("{cities}", others.slice(0, 6).join(", "))}`;
  }

  /**
   * The area named in this message when it differs from the stored one: { locality, city? } to save, or
   * null (nothing named, the same area, or the LLM already read it). A city with a verified centre named
   * alone ("centres in Coimbatore") is the city, not a locality. With Google Maps the place is looked up so
   * the city and spelling come from the map; without it the customer's words are kept.
   */
  private async placeChange(
    text: string,
    n: need | null,
    llm: { city?: unknown; locality?: unknown },
  ): Promise<{ locality: string | null; city?: string } | null> {
    const p = namedPlace(text);
    if (!p) return null;
    const low = (x: unknown) => String(x ?? "").trim().toLowerCase();
    if (llm.locality && low(llm.locality).includes(low(p.locality))) return null; // the LLM read it already
    let locality: string | null = p.locality;
    let city: string | null = p.city;
    if (!city) {
      const asCity = (await this.centreCities()).find((c) => low(c) === low(locality));
      if (asCity) [city, locality] = [asCity, null];
    }
    if (this._Maps?.enabled) {
      const q = [locality, city ?? (locality ? n?.city : null)].filter(Boolean).join(", ");
      const geo = q ? await this._Maps.geocode(q).catch(() => null) : null;
      if (geo?.city) city = geo.city;
      if (locality && geo?.locality) locality = geo.locality;
    }
    const sameCity = !city || low(city) === low(n?.city);
    if (sameCity && (locality ? low(locality) === low(n?.locality) : true)) return null;
    return city ? { locality: locality ? locality.slice(0, 80) : null, city } : { locality: locality!.slice(0, 80) };
  }

  /** Cities with at least one verified, active centre */
  private async centreCities(): Promise<string[]> {
    try {
      const rows = await centre.find({ where: { verified: true, active: true } as any, take: 2000 });
      const seen = new Map<string, string>();
      for (const r of rows) {
        const c = String((r as any).city ?? "").trim();
        if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
      }
      return [...seen.values()].sort();
    } catch {
      return [];
    }
  }

  // After "no verified centre here … Verified centres are available in: Coimbatore": a city from that list
  // searches there (the travel distance already given stays). Anything else: answered normally.
  private async handleCentreCity(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "centre_city") return false;
    await this.setPending(s, null);
    const text = (m.text || "").trim().toLowerCase();
    const city = (await this.centreCities()).find((c) => text.includes(c.toLowerCase()));
    if (!city) return false;
    const n = await this.needRow(s);
    n.city = city;
    n.locality = null as any;
    await n.save();
    await this.replyCentreList(m, s, n, undefined, `centres in ${city} after none nearby`);
    return true;
  }

  // One task per conversation for a place without a verified centre. With Google Maps the task lists the
  // hospitals and clinics that exist there, as candidates for the TEAM to verify and add to the directory.
  // They are never shown to the customer (Playbook 10: only the verified directory is suggested).
  private async reportCentreGap(
    s: Saved,
    place: string | null,
    origin: GeoPoint | null,
    radiusKm: number,
  ) {
    try {
      const exists = await task.findOne({
        where: {
          conversation_id: s.conversation.id,
          type: TaskType.DirectoryVerification,
          summary: Like("No verified centre%"),
        },
      });
      if (exists) return;
      let summary = `No verified centre${place ? ` for ${place}` : ""}: the customer needs options`;
      const near =
        origin && this._Maps?.enabled ? await this._Maps.nearbyCandidates(origin, radiusKm) : [];
      if (near.length)
        summary =
          `${summary}. Not verified, from Google Maps, to check before adding to the directory: ${near
            .map((c) => `${c.name} (${c.address})`)
            .join("; ")}`.slice(0, 1800);
      await this.createTask(TaskType.DirectoryVerification, TaskPriority.Normal, s, summary);
    } catch (e) {
      this.logger.warn(`centre gap not reported: ${(e as Error).message}`);
    }
  }

  // The customer's spot for a centre search: the pin they shared, else their locality on the map. A whole
  // city or a text Google only half matched is not used (the city match in the directory is better then).
  private async originFor(n: need | null, location?: GeoPoint): Promise<GeoPoint | null> {
    if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude))
      return location;
    const locality = String(n?.locality ?? "").trim();
    if (!locality || !this._Maps) return null;
    const geo = await this._Maps.geocode([locality, n?.city].filter(Boolean).join(", "));
    return geo && !geo.approximate ? { latitude: geo.latitude, longitude: geo.longitude } : null;
  }

  // The centre list for a spot, sent as this turn's reply (Trigger D)
  private async replyCentreList(
    m: Inbound,
    s: Saved,
    n: need | null,
    origin: GeoPoint | undefined,
    reason: string,
  ) {
    await this.setState(s, [ConversationState.CentreSearch]);
    const res = await this.centreSuggestions(s, n, origin);
    const decision = res.shown
      ? ((await this._Triggers?.decide(
          s.customer.id,
          s.conversation,
          "D",
          s.customer.active_product,
        )) ?? null)
      : null;
    await this.setPending(s, res.shown ? "centre_pick" : null);
    await this.sendAndSave(s.customer.id, res.text, m.waMessageId);
    if (decision) await this._Triggers!.record(s.customer.id, s.conversation, decision, reason);
  }

  private async needRow(s: Saved): Promise<need> {
    return (
      (await need.findOne({ where: { conversation_id: s.conversation.id } })) ??
      (need.create({ conversation_id: s.conversation.id } as any) as unknown as need)
    );
  }

  // "Send location" button + the same question in words. The answer is a pin (handleLocationShare) or a
  // typed area (handleCentreLocationText).
  private async askLocation(m: Inbound, s: Saved, n?: need | null) {
    await this.setState(s, [ConversationState.CentreSearch]);
    await this.setPending(s, "centre_location");
    await this.sendAndSave(
      s.customer.id,
      { kind: "location_request", body: locationAskText(this.placeOf(n), s.customer.language) },
      m.waMessageId,
    );
  }

  /** "Peelamedu, Coimbatore": the area the customer already gave, or null */
  private placeOf(n?: need | null): string | null {
    if (!n?.city) return null;
    return [n.locality, n.city]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  // The "Send location" question is asked once per conversation when the area is already known (a customer
  // who said NO is not asked again). Without any area it is asked whenever a centre search needs it.
  private async locationAsked(s: Saved): Promise<boolean> {
    try {
      return !!(await message.findOne({
        where: { conversation_id: s.conversation.id, direction: "out", type: "location_request" } as any,
      }));
    } catch {
      return false;
    }
  }

  // The area is known and no pin came: how far the patient can travel (Playbook 10.1), then the list
  private async continueWithArea(
    m: Inbound,
    s: Saved,
    n: need,
    origin: GeoPoint | undefined,
    reason: string,
  ) {
    if (!n.travel_radius_km) {
      await this.setState(s, [ConversationState.CentreSearch]);
      await this.setPending(s, "centre_radius");
      await this.sendAndSave(s.customer.id, say(RADIUS_Q, s.customer.language), m.waMessageId);
      return;
    }
    await this.replyCentreList(m, s, n, origin, reason);
  }

  // The customer shared a location pin: centres around that spot, nearest first. The pin is used for this
  // search only and is not stored. Not while the Cut Medi Bills gate or a later booking step waits.
  private async handleLocationShare(m: Inbound, s: Saved): Promise<boolean> {
    if (!m.location) return false;
    const pending = s.conversation.pending_action;
    if (pending?.startsWith("cmb_gate:")) return false;
    const draft = readDraft(pending);
    if (draft && draft.step !== "centre") return false;
    const n = await this.needRow(s);
    await this.replyCentreList(m, s, n, m.location, "location shared");
    return true;
  }

  // The area typed after the location question ("Peelamedu, Coimbatore"): looked up on the map, saved as
  // locality / city, then the list. Not found on the map = answered normally (the LLM reads the city).
  private async handleCentreLocationText(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "centre_location" || m.location) return false;
    const n = await this.needRow(s);
    if (m.type === "location") {
      // a pin whose coordinates did not arrive (a message recovered after a restart): ask once more
      await this.askLocation(m, s, n);
      return true;
    }
    const text = (m.text || "").trim();
    if (text && agreesToShare(text)) {
      // "ok": the button once more, so one tap sends the pin (the wait stays)
      await this.sendAndSave(
        s.customer.id,
        { kind: "location_request", body: say(LOCATION_ASK_T, s.customer.language) },
        m.waMessageId,
      );
      return true;
    }
    await this.setPending(s, null);
    if (n.city && text && (declinesLocation(text) || onlyRadius(text))) {
      // no pin: the area already given is used. "10 km" answers the next question at the same time.
      if (onlyRadius(text)) {
        const km = parseRadius(text);
        if (km != null) {
          n.travel_radius_km = km;
          await n.save();
        }
      }
      await this.continueWithArea(m, s, n, undefined, "location not shared: the area given earlier");
      return true;
    }
    if (!text || declinesLocation(text) || /\?\s*$/.test(text) || text.split(/\s+/).length > 8)
      return false;
    const geo = (await this._Maps?.geocode(text)) ?? null;
    if (!geo) return false;
    n.locality = (geo.locality ?? text).slice(0, 80);
    if (geo.city) n.city = geo.city;
    await n.save();
    await this.continueWithArea(
      m,
      s,
      n,
      geo.approximate ? undefined : { latitude: geo.latitude, longitude: geo.longitude },
      "area typed after the location question",
    );
    return true;
  }

  // "Any hospital near me?" with no location known: ask for it with the one-tap button
  private async handleNearbyAsk(m: Inbound, s: Saved): Promise<boolean> {
    if (m.location || s.conversation.pending_action) return false;
    if (!asksNearby(m.text, s.conversation.state === ConversationState.CentreSearch)) return false;
    await this.askLocation(
      m,
      s,
      await need.findOne({ where: { conversation_id: s.conversation.id } }),
    );
    return true;
  }

  // After a centre is picked: its pin on the map, so the customer can open directions with one tap
  private async sendCentrePin(s: Saved, ctr: centre) {
    const lat = Number(ctr.latitude);
    const lon = Number(ctr.longitude);
    if (!lat || !lon) return;
    const name = ctr.branch ? `${ctr.name}, ${ctr.branch}` : ctr.name;
    try {
      await this._Wa.send(
        s.customer.id,
        {
          kind: "location",
          latitude: lat,
          longitude: lon,
          name,
          address:
            [(ctr as any).address, ctr.locality, ctr.city].filter(Boolean).join(", ") || undefined,
          body: `[Map pin] ${name}`,
        },
        "reply",
      );
    } catch (e) {
      this.logger.warn(`centre pin not sent: ${(e as Error).message}`);
    }
  }

  // The answer to the radius question: then the list (Trigger D). A question returns false (answered normally).
  private async handleCentreRadius(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "centre_radius") return false;
    let km = parseRadius(m.text);
    let note = "";
    if (km == null) {
      // a question about something else: answered normally. "I want the hospital details" / "ok" / anything
      // that is not a distance: the list within about 10 km, never the same distance question again
      if (/\?\s*$/.test(m.text.trim()) && !/hospital|centre|center|clinic|detail|list|suggest|option/i.test(m.text))
        return false;
      km = 10;
      note = say(RADIUS_DEFAULT_T, s.customer.language);
    }
    let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
    n.travel_radius_km = km;
    // "near Peelamedu, within 5 km": the new area counts too
    const moved = await this.placeChange(m.text, n, {});
    if (moved) Object.assign(n, moved);
    await n.save();
    await this.setPending(s, null);
    const res = await this.centreSuggestions(s, n);
    const decision = res.shown
      ? ((await this._Triggers?.decide(
          s.customer.id,
          s.conversation,
          "D",
          s.customer.active_product,
        )) ?? null)
      : null;
    if (res.shown) await this.setPending(s, "centre_pick");
    await this.sendAndSave(s.customer.id, note ? `${note}

${res.text}` : res.text, m.waMessageId);
    if (decision)
      await this._Triggers!.record(
        s.customer.id,
        s.conversation,
        decision,
        "centre list after the radius",
      );
    return true;
  }

  // CRM booking.cancelled (Full Plan 3.3): the booking_cancelled template asked once whether to suggest
  // another centre. YES = a fresh list without the cancelled centre (Trigger D); NO = a kind close.
  private async handleRebookOffer(m: Inbound, s: Saved): Promise<boolean> {
    const pa = s.conversation.pending_action || "";
    if (!pa.startsWith("rebook_offer:")) return false;
    const answer = parseConsentAnswer(m.text);
    await this.setPending(s, null);
    if (answer === "unclear") return false; // a question or a new request: answered normally
    const l = s.customer.language;
    if (answer === "no") {
      await this.sendAndSave(s.customer.id, say(REBOOK_DECLINED_T, l), m.waMessageId);
      return true;
    }
    const cancelled = await booking_request.findOne({
      where: { id: pa.slice("rebook_offer:".length) },
    });
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    await this.setState(s, [ConversationState.CentreSearch]);
    const res = await this.centreSuggestions(
      s,
      n,
      undefined,
      cancelled?.centre_id ? [cancelled.centre_id] : undefined,
    );
    const decision = res.shown
      ? ((await this._Triggers?.decide(
          s.customer.id,
          s.conversation,
          "D",
          s.customer.active_product,
        )) ?? null)
      : null;
    if (res.shown) await this.setPending(s, "centre_pick");
    await this.sendAndSave(s.customer.id, res.text, m.waMessageId);
    if (decision)
      await this._Triggers!.record(
        s.customer.id,
        s.conversation,
        decision,
        "another centre after a cancelled booking",
      );
    return true;
  }

  private async handleCentrePick(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "centre_pick") return false;
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    const ids = n?.suggested_centre_ids ?? [];
    const inOrder = await this.listedCentres(ids);
    // a number, "second one", or the centre's name and branch typed as text (client, 17 Nov: "KMCH
    // Peelamedu" typed after the list showed the list again)
    const digit = m.text.trim().match(/^(?:option|no\.?|number|centre|center)?\s*([1-9])\s*\.?$/i);
    const picked = digit ? null : pickFromList(m.text, inOrder);
    if (!digit && picked === null) {
      await this.setPending(s, null);
      return false;
    }
    const id =
      digit ? ids[Number(digit[1]) - 1] : typeof picked === "number" ? inOrder[picked]?.id : undefined;
    if (!id) {
      await this.sendAndSave(
        s.customer.id,
        say(T.pickNumber, s.customer.language).replace("{n}", String(ids.length || 5)),
        m.waMessageId,
      );
      return true;
    }
    const ctr = await centre.findOne({ where: { id, verified: true, active: true } });
    if (!ctr) {
      await this.setPending(s, null);
      return false;
    }
    const d: BookingDraft = {
      step: "offer",
      c: ctr.id,
      cn: ctr.branch ? `${ctr.name}, ${ctr.branch}` : ctr.name,
      u: false,
      ok: false, // the mandatory offer first (Playbook 11)
      ns: await this.noHealthQuestions(s),
    };
    const decision =
      (await this._Triggers?.decide(
        s.customer.id,
        s.conversation,
        "G",
        s.customer.active_product,
      )) ?? null;
    await this.sendAndSave(
      s.customer.id,
      (await this.advanceBooking(s, d)).join("\n\n"),
      m.waMessageId,
    );
    await this.sendCentrePin(s, ctr); // the centre on the map, one tap for directions
    if (decision)
      await this._Triggers!.record(
        s.customer.id,
        s.conversation,
        decision,
        "centre picked from the list",
      );
    return true;
  }

  // The LLM reads one unclear booking answer (never writes the reply). null = no LLM, an error, or the
  // health questions are not allowed for this customer: the caller falls back to the word rules.
  private async readAnswer(
    step: AnswerStep,
    d: BookingDraft,
    s: Saved,
    text: string,
  ): Promise<AnswerReading | null> {
    if (typeof this._Llm?.classifyAnswer !== "function") return null;
    try {
      return await this._Llm.classifyAnswer(step, bookingQuestion(step, d, "en"), text, todayIST());
    } catch {
      return null;
    }
  }

  // "Suggest one for me" while the bot waits for a centre name: the booking capture stops and the centre
  // search takes over (Trigger D): city first, then the travel radius, then up to five verified centres.
  // Picking one from the list starts the booking again with that centre.
  private async suggestInsteadOfBooking(m: Inbound, s: Saved, n: need | null) {
    const l = s.customer.language;
    await this.setPending(s, null);
    await this.setState(s, [ConversationState.CentreSearch]);
    if (!m.location && (!n?.city || !(await this.locationAsked(s)))) {
      // one tap on "Send location" for the nearest centres, or the area typed / NO for the area already given
      await this.askLocation(m, s, n);
      return;
    }
    if (!n?.travel_radius_km && !m.location) {
      await this.setPending(s, "centre_radius");
      await this.sendAndSave(s.customer.id, say(RADIUS_Q, l), m.waMessageId);
      return;
    }
    const res = await this.centreSuggestions(s, n, m.location);
    const decision = res.shown
      ? ((await this._Triggers?.decide(
          s.customer.id,
          s.conversation,
          "D",
          s.customer.active_product,
        )) ?? null)
      : null;
    if (res.shown) await this.setPending(s, "centre_pick");
    await this.sendAndSave(s.customer.id, res.text, m.waMessageId);
    if (decision)
      await this._Triggers!.record(
        s.customer.id,
        s.conversation,
        decision,
        "asked for a suggestion at the booking step",
      );
  }

  // One booking answer per turn. A question returns false: answered normally, then the same step again.
  private async handleBooking(m: Inbound, s: Saved): Promise<boolean> {
    const d = readDraft(s.conversation.pending_action);
    if (!d) return false;
    const raw = (m.text || "").trim();
    const reply = (parts: string[]) =>
      this.sendAndSave(s.customer.id, parts.join("\n\n"), m.waMessageId);
    const l = s.customer.language;
    // questions about the booking itself get a plain answer here, never an LLM guess or a callback
    if (d.step === "offer" && asksWhyBooking(raw)) {
      await reply([whyBookingText(d, l)]);
      return true;
    }
    if (d.step === "date" && asksWhyDate(raw)) {
      await reply([dateRuleText(l)]);
      return true;
    }
    // "tomorrow ??", "yes?": an answer with question marks is still an answer
    const bare = raw.replace(/[\s?!.]+$/, "");
    const answerish =
      (d.step === "date" && !!parseCustomerDate(bare)) ||
      (d.step === "offer" && saysYesToOffer(bare, d.cn));
    const text = answerish ? bare : raw;
    if (!text || (/\?\s*$/.test(raw) && !answerish)) return false;

    // reported 16 Nov: the customer chose "KMCH" from the list while the request was still for the centre
    // they typed first, gave "tomorrow 11 am" at the specialisation step, and "I don't know" the doctor.
    if (d.step !== "offer" && d.step !== "centre") {
      const sw = await this.centreSwitch(text, s);
      if (sw && sw.c !== d.c) {
        Object.assign(d, sw);
        const done = say(CENTRE_CHANGED_T, l).replace("{centre}", String(sw.cn));
        await reply([done, ...(await this.advanceBooking(s, d))]);
        return true;
      }
    }
    if ((d.step === "landmark" || d.step === "specialisation") && !d.d) {
      const early = parseCustomerDate(text);
      if (early) {
        const tm = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:morning|afternoon|evening)\b/i);
        if (tm && !d.t) d.t = tm[0];
        const chk = this._DateWindow.validate(early);
        if (chk.valid) {
          d.d = early;
          await reply([say(DATE_NOTED_T, l).replace("{date}", showDate(early)), ...(await this.advanceBooking(s, d))]);
        } else {
          // the rule now, then the same step: the date is asked again when its turn comes
          await this.setPending(s, writeDraft(d));
          await reply([
            chk.reason === "too_soon"
              ? dateRuleText(l, undefined, false)
              : dateProblemText(String(chk.reason), undefined, l),
            bookingQuestion(d.step, d, l),
          ]);
        }
        return true;
      }
    }
    if (d.step === "specialisation" && knowsNotWhichDoctor(text)) {
      const n = (await need.findOne({ where: { conversation_id: s.conversation.id } })) ??
        need.create({ conversation_id: s.conversation.id } as any);
      n.specialisation = NOT_SURE_SPECIALISATION;
      await n.save();
      await reply([say(DOCTOR_NOT_SURE_T, l), ...(await this.advanceBooking(s, d))]);
      return true;
    }

    if (d.step === "offer" || d.step === "centre") {
      const answer =
        d.step === "offer" && saysYesToOffer(text, d.cn) ? "yes" : parseConsentAnswer(text);
      if (answer === "no") {
        await this.setPending(s, null);
        await reply([say(BOOKING_OFFER_DECLINED_T, s.customer.language)]);
        return true;
      }
      if (answer !== "yes" || d.step === "centre") {
        // a centre name (or a number from the list just shown)
        const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
        const k = text.match(/^([1-9])\.?$/);
        const listed = k ? n?.suggested_centre_ids?.[Number(k[1]) - 1] : null;
        const ctr = listed
          ? await centre.findOne({ where: { id: listed, verified: true, active: true } })
          : null;
        if (ctr)
          Object.assign(d, {
            c: ctr.id,
            cn: ctr.branch ? `${ctr.name}, ${ctr.branch}` : ctr.name,
            u: false,
          });
        else if (answer === "yes") {
          await reply([bookingQuestion(d.step, d, s.customer.language)]);
          return true;
        } else if (asksForSuggestion(text)) {
          // no centre in mind: suggest verified centres instead of saving the sentence as a centre name
          await this.suggestInsteadOfBooking(m, s, n);
          return true;
        } else if (await this.findVerifiedCentre(text.slice(0, 80))) {
          Object.assign(d, { l: null }, await this.resolveCentre(text)); // a centre from the directory: no doubt
        } else {
          // not in the directory: a real centre name the team must check, or just a sentence? The LLM reads
          // it; without an LLM answer the word rules decide.
          const r = await this.readAnswer("centre", d, s, text);
          if (r?.kind === "wants_suggestion") {
            await this.suggestInsteadOfBooking(m, s, n);
            return true;
          }
          if (r?.kind === "decline") {
            await this.setPending(s, null);
            await reply([say(BOOKING_OFFER_DECLINED_T, s.customer.language)]);
            return true;
          }
          const name = r
            ? r.kind === "answer"
              ? r.value
              : null
            : looksLikeCentreName(text)
              ? text
              : null;
          if (!name) return false; // a sentence, not a name: answered normally, then the same question again
          Object.assign(d, { l: null }, await this.resolveCentre(name));
        }
      }
      d.ok = true;
    } else if (d.step === "landmark") {
      // a short place name is taken as it is; a sentence is read first ("no, suggest another one for me")
      const plain = text.split(/\s+/).length <= 4 && !asksForSuggestion(text);
      const r = plain ? null : await this.readAnswer("landmark", d, s, text);
      if (r?.kind === "wants_suggestion" || (!r && asksForSuggestion(text))) {
        await this.suggestInsteadOfBooking(
          m,
          s,
          await need.findOne({ where: { conversation_id: s.conversation.id } }),
        );
        return true;
      }
      if (r && r.kind !== "answer") return false;
      d.l = (r?.value ?? text).slice(0, 120);
    } else if (d.step === "specialisation") {
      let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
      // words the directory knows are kept; anything else ("orthi") is read and corrected by the LLM
      let spec = text;
      if (!knownSpecialisation(text)) {
        const r = await this.readAnswer("specialisation", d, s, text);
        if (r && r.kind !== "answer") return false; // not a specialisation: answered normally, asked again
        if (r?.value) spec = r.value;
      }
      n.specialisation = spec.slice(0, 80);
      await n.save();
    } else if (d.step === "date") {
      let iso = parseCustomerDate(text);
      if (!iso) {
        // "coming friday", "next month 5th": the LLM works the date out; the window check below still decides
        const r = await this.readAnswer("date", d, s, text);
        if (r?.kind === "answer" && /^\d{4}-\d{2}-\d{2}$/.test(r.value ?? ""))
          iso = parseCustomerDate(r.value!);
        else if (r && r.kind !== "answer" && r.kind !== "other") return false;
      }
      if (!iso) {
        await reply([dateProblemText("invalid_date", undefined, s.customer.language)]);
        return true;
      }
      const chk = this._DateWindow.validate(iso);
      if (!chk.valid) {
        await reply([
          chk.reason === "too_soon"
            ? dateRuleText(l) // why the date is too soon, and the earliest date
            : dateProblemText(String(chk.reason), undefined, l),
        ]);
        return true;
      }
      d.d = iso;
      // "20 Nov at 10 am": the time came with the date
      const tm = text.match(
        /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:morning|afternoon|evening)\b/i,
      );
      if (tm && !d.t) d.t = tm[0];
    } else if (d.step === "time") {
      d.t = text.slice(0, 40);
    }
    await reply(await this.advanceBooking(s, d));
    return true;
  }

  /** The centres of the list shown, in its order (at most 5) */
  private async listedCentres(ids: string[]): Promise<centre[]> {
    const out: centre[] = [];
    for (const id of ids.slice(0, 10)) {
      const c = await quiet(() => centre.findOne({ where: { id } }));
      if (c) out.push(c);
    }
    return out;
  }

  // A centre from the list just shown ("1", "2") or named ("KMCH", "PSG") while a booking is being taken:
  // the booking moves to that verified centre. null = not a centre from the list.
  private async centreSwitch(
    text: string,
    s: Saved,
  ): Promise<Pick<BookingDraft, "c" | "cn" | "u" | "l"> | null> {
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    const ids = n?.suggested_centre_ids ?? [];
    if (!ids.length) return null;
    const t = text.trim().toLowerCase();
    let id: string | undefined;
    const k = t.match(/^(?:option|no\.?|number)?\s*([1-9])\.?$/);
    if (k) {
      const last = String((await this.lastBotText(s)) ?? "");
      if (/Reply with (1|1 or 2|1-\d)\b|(1|1 or 2|1-\d) (mein se|में से)/i.test(last)) id = ids[Number(k[1]) - 1];
    }
    if (!id && !k && t.split(/\s+/).length <= 6) {
      // the name (and branch, when two share a name) of a centre in the list: Helper/CentreReplies pickFromList
      const inOrder = await this.listedCentres(ids);
      const p = pickFromList(t, inOrder);
      if (typeof p === "number") id = inOrder[p]?.id;
    }
    if (!id) return null;
    const ctr = await centre.findOne({ where: { id, verified: true, active: true } as any });
    if (!ctr) return null;
    return { c: ctr.id, cn: ctr.branch ? `${ctr.name}, ${ctr.branch}` : ctr.name, u: false, l: null };
  }

  // ---- Recovery: objections (M), agreed follow-ups (N), medicines (K), rescue (Playbook 14, 15) ----

  // The customer wrote: nothing that was waiting for them is needed any more, so nothing goes out for no reason:
  // the rescue, an agreed follow-up (they came back by themselves; a new one can be agreed in this turn) and a
  // first-contact message queued for 09:00. The "two in a row" rescue count starts again.
  private async customerReplied(s: Saved) {
    try {
      await this._Scheduler?.cancelForConversation(
        s.conversation.id,
        CANCEL_ON_REPLY,
        "customer_replied",
      );
      if ((s.conversation.rescue_count ?? 0) > 0) {
        await conversation.update(s.conversation.id, { rescue_count: 0 });
        s.conversation.rescue_count = 0;
      }
    } catch (e) {
      this.logger.warn(`rescue reset skipped: ${(e as Error).message}`);
    }
  }

  // After a reply in an open sales conversation: one rescue alarm if the customer goes quiet
  // (Playbook 15: at most two in a row; never while a human, a safety event, a payment reminder,
  // an agreed follow-up or a recorded booking already covers the next step)
  private async afterTurn(m: Inbound, s: Saved) {
    if (!this._Scheduler) return;
    try {
      if (!(await this.alreadyReplied(m.waMessageId))) return;
      const conv = await conversation.findOne({ where: { id: s.conversation.id } });
      if (!conv || conv.closed_at || !RESCUE_STATES.has(conv.state as ConversationState)) return;
      const done = conv.rescue_count ?? 0;
      if (done >= MAX_RESCUES) return;
      const cons = await consent.findOne({ where: { customer_id: s.customer.id } });
      if (cons?.opt_out_at || cons?.privacy_request_at) return;
      if (await this._Scheduler.hasScheduled(conv.id, ["rescue", "agreed_follow_up", "trigger_q"]))
        return;
      await this._Scheduler.create({
        customerId: s.customer.id,
        conversationId: conv.id,
        kind: "rescue",
        scheduledFor: new Date(Date.now() + rescueDelayMs(done)),
        templateName: RESCUE_TEMPLATES[done],
        reason: `no reply, rescue ${done + 1} of ${MAX_RESCUES}`,
        selectedProduct: conv.selected_product ?? null,
        source: "whatsapp_inbound",
      });
    } catch (e) {
      this.logger.warn(`rescue not scheduled: ${(e as Error).message}`);
    }
  }

  private busyWithQuestion(s: Saved): boolean {
    return (
      isBookingPending(s.conversation.pending_action) ||
      !!s.conversation.pending_action?.startsWith("cmb_gate:")
    );
  }

  // The 3-line summary (no health detail when health consent was refused)
  private async summary(s: Saved, noHealth: boolean): Promise<string> {
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    const b = await booking_request.findOne({
      where: {
        conversation_id: s.conversation.id,
        booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]),
      } as any,
      order: { created_on: "DESC" } as any,
    });
    // the details of the chat (client, 17 Nov: "it does not give a summary of the details at the end")
    const ctr = b?.centre_id ? await quiet(() => centre.findOne({ where: { id: b.centre_id } })) : null;
    const plan = s.conversation.recommended_plan;
    let price: string | null = null;
    if (plan && s.conversation.selected_product !== ProductType.CutMediBills) {
      const p = await quiet(() => this._ValueCheck.prices(ProductType.Oxxy, plan));
      const rs = (x: number) => "₹" + Math.round(Number(x)).toLocaleString("en-IN");
      if (p?.yearly)
        price = p.monthly
          ? `${rs(p.monthly)} ${say({ en: "monthly or", hi: "मासिक या", hinglish: "monthly ya" }, s.customer.language)} ${rs(p.yearly)} ${say({ en: "yearly", hi: "वार्षिक", hinglish: "yearly" }, s.customer.language)}`
          : `${rs(p.yearly)} ${say({ en: "yearly", hi: "वार्षिक", hinglish: "yearly" }, s.customer.language)}`;
    }
    const linkSent = !!(await quiet(() =>
      activation.findOne({
        where: {
          customer_id: s.customer.id,
          payment_status: PaymentStatus.Pending,
          activation_status: ActivationStatus.LinkSent,
        },
      }),
    ));
    const cb = await this.chosenCallback(s);
    return summaryLines(
      {
        need: noHealth ? null : (n?.healthcare_need ?? "").slice(0, 80) || null,
        product: s.conversation.selected_product,
        plan,
        reason: plan ? planReason(plan, s.customer.language) : s.conversation.recommendation_reason,
        booking: !!b,
        beneficiary: n?.beneficiary || null,
        area: [n?.locality, n?.city].filter(Boolean).join(", ") || null,
        price,
        bookingDetail: b
          ? {
              centre: ctr ? (ctr.branch ? `${ctr.name}, ${ctr.branch}` : ctr.name) : say({ en: "the chosen centre", hi: "चुना गया केंद्र", hinglish: "chuna gaya centre" }, s.customer.language),
              date: b.preferred_date ?? null,
              time: b.preferred_time ?? null,
              confirmed: b.booking_status === BookingStatus.Confirmed,
            }
          : null,
        linkSent,
        callback: cb?.callback_from
          ? `${showWindow({ from: cb.callback_from, to: cb.callback_to ?? cb.callback_from }, s.customer.language)} (${caseRef(cb.id)})`
          : null,
      },
      s.customer.language,
    );
  }

  // "Thanks", "bye", "that's all", "ok thank you": the chat is ending. The details summary once (what was
  // agreed: need, plan and price, booking, link, callback), then "message here any time". A plain "thanks"
  // with nothing done yet, or right after the summary, is answered normally.
  private async handleClosing(m: Inbound, s: Saved, noHealth: boolean): Promise<boolean> {
    if (s.conversation.pending_action) return false;
    if (!isClosingMessage(m.text)) return false;
    const conv = s.conversation;
    const booking = await quiet(() => booking_request.findOne({ where: { conversation_id: conv.id } as any }));
    const callback = await this.chosenCallback(s);
    if (!conv.recommended_plan && conv.selected_product !== ProductType.CutMediBills && !booking && !callback)
      return false;
    const last = String((await this.lastBotText(s)) ?? "");
    if (SUMMARY_HEAD_RE.test(last)) return false; // the summary was just sent: not twice
    const l = s.customer.language;
    await this.sendAndSave(
      s.customer.id,
      `${say(SUMMARY_HEAD_T, l)}\n${await this.summary(s, noHealth)}\n\n${say(SUMMARY_CLOSE_T, l)}`,
      m.waMessageId,
    );
    return true;
  }

  // Playbook 9.2 value check on the yearly spend, then the recommendation or the honest answer
  private async valueAnswer(s: Saved, n: need | null, spend: number): Promise<string | null> {
    const pick = await this._ValueCheck.recommend(
      spend,
      s.customer.age ?? null,
      n?.healthcare_need,
      ProductType.Oxxy,
    );
    if (!pick) return null;
    if (pick.status === "ask_age") return say(ASK_AGE_T, s.customer.language);
    const prices = await this._ValueCheck.prices(ProductType.Oxxy, pick.plan);
    await this.saveRecommendation(s, pick.plan);
    await conversation.update(s.conversation.id, {
      value_check_passed: pick.status === "recommend",
    });
    s.conversation.value_check_passed = pick.status === "recommend";
    return pick.status === "recommend"
      ? recommendText(
          pick.plan,
          prices.yearly ?? pick.price,
          prices.monthly,
          spend,
          pick.saving,
          s.customer.language,
        )
      : honestText(
          pick.plan,
          prices.yearly ?? pick.price,
          prices.monthly,
          spend,
          s.customer.language,
        );
  }

  // Trigger M: one objection, one resolution (Trigger layer 9, Playbook 14). Trust and expected use
  // are A and C (handleBarrier). Follow-up (N) only after the customer agrees to a time.
  private async handleObjection(m: Inbound, s: Saved, noHealth: boolean): Promise<boolean> {
    const kind = detectObjection(m.text);
    if (!kind) return false;
    if (kind === "price" && s.conversation.selected_product === ProductType.CutMediBills)
      return false;
    await conversation.update(s.conversation.id, { objection: kind });
    s.conversation.objection = kind;
    const decision =
      (await this._Triggers?.decide(
        s.customer.id,
        s.conversation,
        "M",
        s.customer.active_product,
      )) ?? null;
    const busy = this.busyWithQuestion(s);
    let body: string;
    let pending: string | null = null;
    if (kind === "price") {
      const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      const spend = Number(n?.annual_medical_spend);
      if (noHealth)
        body = `${say(UNDERSTAND_T, s.customer.language)} ${say(PRICE_BUDGET_QUESTION_T, s.customer.language)}`; // the yearly spend is a health question
      else if (!spend) {
        body = say(PRICE_ASK_T, s.customer.language);
        pending = "price_spend";
      } else {
        const v = await this.valueAnswer(s, n, spend);
        body = v
          ? /\?\s*$/.test(v)
            ? v
            : `${v} ${say(PRICE_BUDGET_QUESTION_T, s.customer.language)}`
          : say(PRICE_ASK_T, s.customer.language);
      }
    } else if (kind === "not_interested") {
      body = say(NOT_INTERESTED_ASK_T, s.customer.language);
      pending = "close_offer";
    } else if (kind === "no_provider") {
      body = say(NO_PROVIDER_ANSWER_T, s.customer.language);
    } else {
      body = objectionReply(
        kind,
        await this.summary(s, noHealth),
        followUpOptions(),
        s.customer.language,
      );
      pending = "follow_up_time";
    }
    // a booking or gate question is still open: keep it, and ask it again after this answer
    if (pending && !busy) await this.setPending(s, pending);
    await this.sendAndSave(
      s.customer.id,
      [body, ...(busy ? this.pendingBack(s) : [])].join("\n\n"),
      m.waMessageId,
    );
    if (decision)
      await this._Triggers!.record(s.customer.id, s.conversation, decision, `objection: ${kind}`);
    return true;
  }

  // Playbook 15 in-chat rescue: one-word replies, "I don't know", "you are repeating". Two attempts per
  // signal (the second "I don't know" asks for a spend bucket and reads the answer as the yearly spend),
  // then the summary / follow-up / closure offer. Another kind of message resets the count.
  private async handleRescueSignal(m: Inbound, s: Saved, noHealth: boolean): Promise<boolean> {
    if (s.conversation.pending_action) return false; // a question is waiting: its own handler reads the answer
    let signal = detectRescueSignal(m.text);
    const prev = readRescue(s.conversation.objection);
    if (!signal) {
      if (prev) await conversation.update(s.conversation.id, { objection: null });
      return false;
    }
    if (signal === "dont_know" && noHealth) signal = "one_word"; // the spend questions are health questions
    // the second "I don't know" asks the yearly spend: not when it is already known (never asked twice)
    if (signal === "dont_know" && prev?.signal === "dont_know") {
      const known = await quiet(() => need.findOne({ where: { conversation_id: s.conversation.id } }));
      if (known?.annual_medical_spend) signal = "one_word";
    }
    // "Okay" right after the bot asked something ("Would you like to proceed?") answers that question:
    // the normal reply reads it, the Playbook 15 "main benefit or price?" line would ignore it
    if (signal === "one_word") {
      const last = (await this.lastBotText(s)) ?? "";
      if (/\?\s*$|reply (yes|1)/i.test(last.trim())) {
        if (prev) await conversation.update(s.conversation.id, { objection: null });
        return false;
      }
    }
    const attempts = prev?.signal === signal ? prev.attempts + 1 : 1;
    const marker = `rescue:${signal}:${attempts}`;
    await conversation.update(s.conversation.id, { objection: marker });
    s.conversation.objection = marker;
    const l = s.customer.language;
    if (attempts >= 3) {
      await this.setPending(s, "close_offer");
      await this.sendAndSave(s.customer.id, say(NOT_INTERESTED_ASK_T, l), m.waMessageId);
      return true;
    }
    if (signal === "dont_know" && attempts === 2) await this.setPending(s, "price_spend");
    await this.sendAndSave(s.customer.id, rescueLine(signal, attempts as 1 | 2, l), m.waMessageId);
    return true;
  }

  // The yearly spend after "too expensive": the value check, never a net loss as a saving
  private async handlePriceSpend(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "price_spend") return false;
    await this.setPending(s, null);
    const amount = parseAmount(m.text);
    if (!amount || /\?\s*$/.test(m.text.trim())) return false;
    let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
    n.annual_medical_spend = amount;
    await n.save();
    const v = await this.valueAnswer(s, n, amount);
    if (!v) return false;
    await this.sendAndSave(
      s.customer.id,
      /\?\s*$/.test(v) ? v : `${v} ${say(PRICE_BUDGET_QUESTION_T, s.customer.language)}`,
      m.waMessageId,
    );
    return true;
  }

  // Trigger N: the follow-up time the customer agreed to (after M, "not now", or the "Talk to me later" row)
  private async handleFollowUpTime(m: Inbound, s: Saved): Promise<boolean> {
    const waiting =
      s.conversation.pending_action === "follow_up_time" ||
      (s.conversation.state === ConversationState.FollowUpTime && !s.conversation.pending_action);
    if (!waiting) return false;
    const text = (m.text || "").trim();
    if (!text || /\?\s*$/.test(text)) return false; // a question: answered, the offer stays open
    const options = followUpOptions();
    const reply = (body: string) => this.sendAndSave(s.customer.id, body, m.waMessageId);
    if (/\bsummary\b/i.test(text)) {
      await reply(
        `${await this.summary(s, await this.noHealthQuestions(s))}\n\n${followUpQuestion(options, s.customer.language)}`,
      );
      return true;
    }
    const answer = parseConsentAnswer(text);
    if (
      answer === "no" ||
      /\b(no need|not needed|i will message|i'll message|i will contact|i'll contact)\b/i.test(text)
    ) {
      await this.setPending(s, null);
      await reply(say(FOLLOW_UP_NOT_WANTED_T, s.customer.language));
      return true;
    }
    const when = parseFollowUpTime(text, options);
    if (!when) {
      if (answer === "yes") {
        await reply(followUpQuestion(options, s.customer.language));
        return true;
      }
      await this.setPending(s, null); // something else: answered normally
      return false;
    }
    const problem = followUpProblem(when);
    if (problem) {
      await reply(followUpProblemText(problem, options, s.customer.language));
      return true;
    }
    await this.scheduleAgreedFollowUp(s, when);
    await reply(followUpSavedText(when, s.customer.language));
    return true;
  }

  private async scheduleAgreedFollowUp(s: Saved, when: Date) {
    await this.setPending(s, null);
    const product =
      s.customer.active_product || s.conversation.selected_product || ProductType.Oxxy;
    const reason = `agreed in chat${s.conversation.objection ? ` (${s.conversation.objection})` : ""}`;
    if (this._Scheduler) {
      await this._Scheduler.create({
        customerId: s.customer.id,
        conversationId: s.conversation.id,
        kind: "agreed_follow_up",
        scheduledFor: when,
        templateName: "agreed_follow_up",
        reason,
        selectedProduct: product,
        source: "whatsapp_inbound",
        // Playbook 18 follow-up template: First_Name, Need, Selected_Product (no health detail in the job)
        params: [
          s.customer.first_name || "there",
          "your healthcare requirement",
          product === ProductType.CutMediBills ? "Cut Medi Bills" : "Oxxy",
        ],
      });
      await this._Scheduler.cancelForConversation(
        s.conversation.id,
        ["rescue"],
        "agreed_follow_up",
      );
    } else {
      await this.createTask(
        TaskType.HumanHandoff,
        TaskPriority.Normal,
        s,
        `Agreed follow-up at ${when.toISOString()}`,
      );
    }
    await conversation.update(s.conversation.id, { follow_up_at: when });
    await this.setState(s, [ConversationState.FollowUp]);
    await this.recordTrigger(s, "N", reason, { cta: when.toISOString() });
  }

  // "Not interested" -> summary or close (Playbook 14). Closing ends the decision journey.
  private async handleCloseOffer(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "close_offer") return false;
    const text = (m.text || "").trim();
    if (!text || /\?\s*$/.test(text)) return false;
    await this.setPending(s, null);
    if (/\bsummary\b/i.test(text)) {
      await this.sendAndSave(
        s.customer.id,
        `${await this.summary(s, await this.noHealthQuestions(s))}\n\n${say(SUMMARY_CLOSE_T, s.customer.language)}`,
        m.waMessageId,
      );
      return true;
    }
    const answer = parseConsentAnswer(text);
    if (answer === "unclear" && !/\b(close|end|bye|stop it|that's all|thats all)\b/i.test(text))
      return false;
    await this._Scheduler?.cancelForConversation(
      s.conversation.id,
      ["rescue", "agreed_follow_up", "trigger_q"],
      "closed",
    );
    await conversation.update(s.conversation.id, { outcome: "declined" });
    s.conversation.outcome = "declined";
    await this.markTriggerResponse(s.conversation.id, "declined", { force: true });
    // the reply first: a closed conversation cannot send any more
    await this.sendAndSave(
      s.customer.id,
      say(CLOSED_POLITELY_T, s.customer.language),
      m.waMessageId,
    );
    await this.setState(s, [ConversationState.FollowUp, ConversationState.Closed]);
    return true;
  }

  // Trigger K: medicines, naming only the selected product (default Oxxy), once per journey
  private async handleMedicine(m: Inbound, s: Saved, noHealth: boolean): Promise<boolean> {
    if (!asksMedicine(m.text)) return false;
    const d =
      (await this._Triggers?.decide(
        s.customer.id,
        s.conversation,
        "K",
        s.customer.active_product,
      )) ?? null;
    if (this._Triggers && (!d || d.suppression)) return false; // explained already: the LLM answers
    const cmb =
      (s.customer.active_product || s.conversation.selected_product) === ProductType.CutMediBills;
    await this.sendAndSave(
      s.customer.id,
      [
        medicineText(cmb ? "Cut Medi Bills" : "Oxxy", !noHealth, s.customer.language),
        ...this.pendingBack(s),
      ].join("\n\n"),
      m.waMessageId,
    );
    if (d) await this._Triggers!.record(s.customer.id, s.conversation, d, "medicine requirement");
    return true;
  }

  /** Match a centre by full text or stripped base name (e.g. "Sample Dental Clinic, Adyar (Adyar)"). */
  private async findVerifiedCentre(rawName: string): Promise<centre | null> {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const direct = await centre.findOne({
      where: { name: ILike(`%${trimmed}%`), verified: true, active: true },
    });
    if (direct) return direct;
    const baseName = trimmed
      .replace(/^\d+\.\s*/, "")
      .replace(/\(.*?\)/g, "")
      .split(",")[0]
      .trim();
    if (!baseName || baseName === trimmed) return null;
    return await centre.findOne({
      where: { name: ILike(`%${baseName}%`), verified: true, active: true },
    });
  }
}
