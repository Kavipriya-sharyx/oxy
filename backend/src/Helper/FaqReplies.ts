// Approved WhatsApp answers (Playbook 13 FAQ, 4.3 "does not remember", 4.4 identity, 16.2 medical-advice
// boundary). Answered before Claude, word for word: Claude never rewords these. English is the approved
// text; Hindi / Hinglish are drafts [CONFIRM] (Helper/Lang.ts). Product-aware: answers on the Oxxy route
// never mention Cut Medi Bills (Playbook 22.1), and the Cut Medi Bills route gets its own lines.
// Insurance (Trigger B / J), medicines (Trigger K), trust / verify (Trigger A) and centre discounts (neutral
// savings line) have their own handlers and are NOT here.
import { L, say } from "./Lang";
import { officialReferences } from "./TriggerReplies";

export type FaqKey =
  | "what_is_oxxy"
  | "who_pays"
  | "repeat_use"
  | "pre_existing"
  | "activation_time"
  | "after_paying"
  | "cmb_age"
  | "both_products"
  | "guarantee"
  | "booking_confirmed"
  | "policies"
  | "medical_advice"
  | "identity"
  | "dont_remember"
  | "member_pricing"
  | "cmb_cancel"
  | "early_activation";

const MAX_LEN = 220; // a longer message is more than one question: Claude handles it

// Order matters: the first match wins (specific before general).
const MATCHERS: [FaqKey, RegExp][] = [
  [
    "identity",
    /\b(are|r) (you|u) (a |an )?(bot|robot|human|real person|real|machine|ai|computer)\b|\b(talking|chatting|speaking) (to|with) (a |an )?(bot|robot|machine|ai|human|real person)\b|\b(aap|tum) (bot|robot|insaan|machine) (ho|hain|hai)\b|(आप|तुम) (बॉट|रोबोट|इंसान|मशीन)/iu,
  ],
  [
    "dont_remember",
    /\b(i )?(don'?t|dont|do not) (remember|recall)\b|\bwho (gave|shared) (you )?my (number|contact)\b|\bwhy (are you|did you|r u) (messag|text|contact|whatsapp)|\b(yaad nahi|yaad nahin)\b|याद नहीं/iu,
  ],
  [
    "medical_advice",
    /\b(diagnose|diagnosis|prescribe|prescription for)\b|\bwhat (medicine|tablet|treatment|medication) should (i|he|she|we) (take|have|get|do)\b|\bshould (i|he|she|we) (take|have|get|do|undergo) (the |this |a )?(surgery|operation|treatment|medicine|tablet)\b|\bis (it|this|my condition) (serious|cancer|dangerous)\b|\b(kaun si|konsi) (dawai|dawa|medicine) (lun|loon|le lun|leni chahiye)\b|कौन सी दवा/iu,
  ],
  [
    "both_products",
    /\b(both|dono|together)\b[^?.!]{0,40}\b(products?|plans?|oxxy|cut medi bills)\b|\b(oxxy|plan)\b[^?.!]{0,25}\b(and|aur|plus)\b[^?.!]{0,10}\bcut medi bills\b|\bcut medi bills\b[^?.!]{0,10}\b(and|aur|plus)\b[^?.!]{0,25}\b(oxxy|plan)\b|दोनों/iu,
  ],
  [
    // Playbook 8 member pricing (Cut Medi Bills) / 1.1 family pricing [CONFIRM] (Oxxy: escalated, 16.4)
    "member_pricing",
    /\b(family|families|members?|wife|husband|spouse|parents?|mother|father|kids?|children|parivar)\b[^?.!]{0,40}\b(price|pricing|discount|rate|fee|charges?|kitna|kitne)\b|\b(price|pricing|discount|rate|fee|charges?|kitna)\b[^?.!]{0,40}\b(family|members?|wife|husband|spouse|parents?|mother|father|kids?|children|parivar)\b|\b(additional|extra|second|another|more) (members?|person|people)\b|परिवार[^?.!]{0,30}(कीमत|दाम|प्राइस|छूट)/iu,
  ],
  [
    // Playbook 8 cancellation (never "cancel my insurance": that is Trigger B)
    "cmb_cancel",
    /\b(how|can|kaise|where)\b[^?.!]{0,25}\bcancel\b|\bcancel(lation)? (process|method|kaise|karna)\b|\b(stop|band) (the )?(auto[- ]?renew\w*|renewal|monthly|subscription|mandate)\b|कैसे (रद्द|कैंसल)/iu,
  ],
  [
    // Playbook 8 / 13: "I can request a senior review for earlier activation, but I cannot promise it."
    "early_activation",
    /\b(faster|quicker|earlier|sooner|urgent(ly)?|expedite|speed up|asap|jaldi)\b[^?.!]{0,30}\b(activat|active)|\bactivat\w*\b[^?.!]{0,30}\b(faster|quicker|earlier|sooner|urgent(ly)?|expedite|speed up|asap|jaldi)\b|जल्दी[^?.!]{0,20}(एक्टिव|सक्रिय)/iu,
  ],
  [
    "cmb_age",
    /\b(age limit|age bar|age restriction|umar|umr)\b[^?.!]{0,40}\bcut medi bills\b|\bcut medi bills\b[^?.!]{0,40}\b(age limit|age bar|any age|age restriction|umar|umr)\b|cut medi bills[^?.!]{0,40}उम्र/iu,
  ],
  [
    "guarantee",
    /\b(30|thirty|20|25|40)\s*(%|percent|per cent)[^?.!]{0,30}\b(guarantee|guaranteed|sure|pakka|fixed|confirm)/i,
  ],
  [
    "booking_confirmed",
    /\b(will|is|would) (my|the) (appointment|booking|slot)\b[^?.!]{0,30}\b(confirm|confirmed|sure|definitely|surely|guaranteed)\b|\b(appointment|booking) (pakka|confirm) (hoga|hogi|ho jayega|ho jayegi|milega|milegi)\b/iu,
  ],
  [
    "pre_existing",
    /\bpre[- ]?existing\b|\bexisting (disease|condition|illness|problem)s?\b|\bpurani (bimari|bimaari)\b|पुरानी बीमारी|पहले से (कोई )?बीमारी/iu,
  ],
  [
    "after_paying",
    /\b(already|have) (paid|made the payment)\b[^?.!]{0,40}\b(can|could|will|use|claim|get|adjust)\b|\bafter (paying|payment|i pay|i paid)\b[^?.!]{0,30}\b(can|could|use|claim|get|adjust)\b|\b(bill|payment) (already )?(paid|bhar diya|de diya)\b[^?.!]{0,30}\b(can|use|milega|milegi|claim)\b|पहले ही (भुगतान|पेमेंट)/iu,
  ],
  [
    "who_pays",
    /\bwho (pays|will pay|has to pay|pay)\b|\b(do|does|will) (oxxy|you) pay\b|\breimburs|\bbill kaun (bharega|dega|pay karega)\b|बिल कौन/iu,
  ],
  [
    "repeat_use",
    /\b(use|avail|claim) (it |this |oxxy |the plan )?(again|repeatedly|many times|multiple times|more than once|every time)\b|\bhow many times\b|\b(kitni|kitne) (baar|bar)\b|\bbaar baar\b|बार बार|कितनी बार/iu,
  ],
  [
    "activation_time",
    /\b(how long|how many days|when)\b[^?.!]{0,30}\b(activat|active|start working)|\bactivation (time|period|kab)\b|\b(kitne din|kab)\b[^?.!]{0,20}\b(active|activate|activation)\b|कब (एक्टिव|सक्रिय)|कितने दिन/iu,
  ],
  ["policies", /\b(policies|policy page|terms (and|&) conditions|t\s?&\s?c|refund policy|privacy policy)\b/i],
  [
    "what_is_oxxy",
    /\b(what is|what's|whats|wat is|tell me about|explain|what does)\s+(oxxy|this service|your service|your company)\b|\boxxy (kya|kya hai|kya hota hai|kya karta hai)\b|oxxy क्या/iu,
  ],
];

/** The FAQ this message asks, when it is one short question we have an approved answer for */
export function matchFaq(text: string): FaqKey | null {
  const t = (text || "").trim();
  if (!t || [...t].length > MAX_LEN) return null;
  // "insurance policy" is Trigger B, not the policies page
  for (const [key, re] of MATCHERS) {
    if ((key === "policies" || key === "cmb_cancel") && /insurance|bima|बीमा/i.test(t)) continue;
    // "can I cancel my booking" is a booking change for the team, not the Cut Medi Bills mandate
    if (key === "cmb_cancel" && /\b(booking|appointment|slot|request)\b/i.test(t)) continue;
    if (re.test(t)) return key;
  }
  return null;
}

// ---------------------------------------------------------------- approved texts

const WHAT_IS_OXXY: L = {
  en:
    "Oxxy is a lifelong healthcare savings and support partner. It helps reduce eligible bills for consultations, " +
    "tests, medicines, planned treatments and surgeries when contacted before the service. What type of expense do " +
    "you need help with?",
  hi:
    "Oxxy आपका जीवनभर का हेल्थकेयर सेविंग्स और सपोर्ट पार्टनर है। सेवा लेने से पहले संपर्क करने पर यह कंसल्टेशन, टेस्ट, " +
    "दवाइयों, प्लान किए गए इलाज और सर्जरी के योग्य बिल कम करने में मदद करता है। आपको किस तरह के खर्च में मदद चाहिए?",
  hinglish:
    "Oxxy aapka lifelong healthcare savings aur support partner hai. Service lene se pehle contact karne par yeh " +
    "consultation, tests, medicines, planned treatment aur surgery ke eligible bills kam karne mein madad karta hai. " +
    "Aapko kis tarah ke kharche mein madad chahiye?",
};

const WHO_PAYS: L = {
  en: "You pay the healthcare provider directly after the applicable saving is coordinated. Oxxy does not pay or reimburse the bill.",
  hi: "लागू बचत तय होने के बाद आप सीधे हेल्थकेयर प्रोवाइडर को भुगतान करते हैं। Oxxy बिल का भुगतान या रीइम्बर्समेंट नहीं करता।",
  hinglish:
    "Applicable saving coordinate hone ke baad aap seedha healthcare provider ko payment karte hain. Oxxy bill pay ya reimburse nahi karta.",
};

const REPEAT_USE: L = {
  en: "Yes. An active Oxxy plan can be used repeatedly according to its terms and provider availability.",
  hi: "हाँ। एक्टिव Oxxy प्लान अपनी शर्तों और प्रोवाइडर की उपलब्धता के अनुसार बार-बार इस्तेमाल किया जा सकता है।",
  hinglish: "Haan. Active Oxxy plan apni terms aur provider availability ke hisaab se baar-baar use kiya ja sakta hai.",
};

const PRE_EXISTING_OXXY: L = {
  en: "Oxxy Thrive and Infinity support pre-existing conditions, and I can confirm the exact terms for you.",
  hi: "Oxxy Thrive और Infinity पहले से मौजूद बीमारियों में सहायता करते हैं, और मैं आपके लिए सटीक शर्तें कन्फ़र्म करवा सकता हूँ।",
  hinglish: "Oxxy Thrive aur Infinity pre-existing conditions support karte hain, aur main aapke liye exact terms confirm karwa sakta hoon.",
};
const PRE_EXISTING_ASK: L = {
  en: "Which condition or service should I check?",
  hi: "मैं किस बीमारी या सेवा के लिए जाँच करूँ?",
  hinglish: "Main kis condition ya service ke liye check karoon?",
};
const PRE_EXISTING_CMB: L = {
  en: "Cut Medi Bills includes all pre-existing medical conditions.",
  hi: "Cut Medi Bills में पहले से मौजूद सभी बीमारियाँ शामिल हैं।",
  hinglish: "Cut Medi Bills mein saari pre-existing medical conditions shaamil hain.",
};

const ACTIVATION_OXXY: L = {
  en: "For an Oxxy plan, I will share the activation timeline from the official plan page before payment.",
  hi: "Oxxy प्लान के लिए मैं भुगतान से पहले आधिकारिक प्लान पेज से एक्टिवेशन की समय-सीमा बताऊँगा।",
  hinglish: "Oxxy plan ke liye main payment se pehle official plan page se activation timeline share karunga.",
};
const ACTIVATION_CMB: L = {
  en: "For Cut Medi Bills, activation normally takes 5 to 10 working days.",
  hi: "Cut Medi Bills के लिए एक्टिवेशन में आम तौर पर 5 से 10 कार्य दिवस लगते हैं।",
  hinglish: "Cut Medi Bills ke liye activation mein aam taur par 5 se 10 working days lagte hain.",
};

const AFTER_PAYING: L = {
  en: "No retrospective adjustment can be promised. Contact Oxxy before booking, treatment or payment.",
  hi: "पिछली तारीख से कोई समायोजन का वादा नहीं किया जा सकता। बुकिंग, इलाज या भुगतान से पहले Oxxy से संपर्क करें।",
  hinglish: "Retrospective adjustment ka koi promise nahi kiya ja sakta. Booking, treatment ya payment se pehle Oxxy se contact karein.",
};
const AFTER_PAYING_CMB: L = {
  en: "If Cut Medi Bills cannot work at the current centre, we can check a different centre.",
  hi: "अगर Cut Medi Bills मौजूदा सेंटर पर काम नहीं कर सकता, तो हम कोई दूसरा सेंटर देख सकते हैं।",
  hinglish: "Agar Cut Medi Bills current centre par kaam nahi kar sakta, to hum koi doosra centre check kar sakte hain.",
};

const CMB_AGE: L = {
  en: "No. Cut Medi Bills has no age limit.",
  hi: "नहीं। Cut Medi Bills की कोई उम्र सीमा नहीं है।",
  hinglish: "Nahi. Cut Medi Bills ki koi age limit nahi hai.",
};

const BOTH: L = {
  en:
    "No. One customer can activate either an Oxxy plan or Cut Medi Bills. Tell me whether you want broader ongoing " +
    "support or help with one specific upcoming expense, and I will guide you.",
  hi:
    "नहीं। एक ग्राहक या तो एक Oxxy प्लान या Cut Medi Bills एक्टिवेट कर सकता है। बताइए कि आपको लगातार व्यापक सहायता चाहिए " +
    "या किसी एक आने वाले खर्च में मदद, और मैं आपको सही रास्ता बताऊँगा।",
  hinglish:
    "Nahi. Ek customer ya to ek Oxxy plan ya Cut Medi Bills activate kar sakta hai. Bataiye aapko broader ongoing " +
    "support chahiye ya kisi ek upcoming expense mein help, aur main aapko guide karunga.",
};

const GUARANTEE: L = {
  en:
    "No. About 30% (20% for Everyday, 25% for Vital) is used only for an easy illustration. The actual saving depends " +
    "on the service, provider and location and must be confirmed.",
  hi:
    "नहीं। लगभग 30% (Everyday के लिए 20%, Vital के लिए 25%) केवल आसान उदाहरण के लिए है। असली बचत सेवा, प्रोवाइडर और " +
    "जगह पर निर्भर करती है और उसकी पुष्टि ज़रूरी है।",
  hinglish:
    "Nahi. Lagbhag 30% (Everyday ke liye 20%, Vital ke liye 25%) sirf easy illustration ke liye hai. Actual saving " +
    "service, provider aur location par depend karti hai aur confirm karni hogi.",
};

const BOOKING_CONFIRMED: L = {
  en:
    "I can record the booking request, but confirmation depends on the centre and doctor availability. The Oxxy team " +
    "will contact you regarding confirmation.",
  hi: "मैं बुकिंग रिक्वेस्ट दर्ज कर सकता हूँ, लेकिन कन्फ़र्मेशन सेंटर और डॉक्टर की उपलब्धता पर निर्भर करता है। कन्फ़र्मेशन के लिए Oxxy टीम आपसे संपर्क करेगी।",
  hinglish:
    "Main booking request record kar sakta hoon, lekin confirmation centre aur doctor ki availability par depend karta hai. " +
    "Confirmation ke liye Oxxy team aapse contact karegi.",
};

const POLICIES = (url: string): L => ({
  en: `The official policy page is ${url}. Is there a particular policy point you want clarified?`,
  hi: `आधिकारिक पॉलिसी पेज ${url} है। क्या कोई खास पॉलिसी पॉइंट है जिसे आप समझना चाहेंगे?`,
  hinglish: `Official policy page ${url} hai. Kya koi particular policy point hai jo aap clear karna chahenge?`,
});

const MEDICAL_ADVICE: L = {
  en:
    "I can help with plan information, centre options and booking coordination, but diagnosis and treatment decisions " +
    "must come from a qualified medical professional. Would you like help finding the right specialisation?",
  hi:
    "मैं प्लान की जानकारी, सेंटर के विकल्प और बुकिंग में मदद कर सकता हूँ, लेकिन जाँच और इलाज के फ़ैसले किसी योग्य डॉक्टर से " +
    "ही होने चाहिए। क्या आप सही स्पेशलाइज़ेशन ढूँढने में मदद चाहेंगे?",
  hinglish:
    "Main plan information, centre options aur booking coordination mein help kar sakta hoon, lekin diagnosis aur " +
    "treatment ke decisions kisi qualified doctor se hi aane chahiye. Kya aap sahi specialisation dhoondhne mein help chahenge?",
};

// Playbook 4.4. "automated assistant" is kept in every introduction (Playbook 22.2).
const IDENTITY: L = {
  en:
    "I am Oxxy Health's automated WhatsApp assistant. I can understand your requirement, answer approved questions, " +
    "take a booking request and help with activation. I can also arrange a human callback.",
  hi:
    "मैं Oxxy Health का ऑटोमेटेड WhatsApp असिस्टेंट हूँ। मैं आपकी ज़रूरत समझ सकता हूँ, स्वीकृत सवालों के जवाब दे सकता हूँ, " +
    "बुकिंग रिक्वेस्ट ले सकता हूँ और एक्टिवेशन में मदद कर सकता हूँ। मैं किसी व्यक्ति से कॉलबैक भी करवा सकता हूँ।",
  hinglish:
    "Main Oxxy Health ka automated WhatsApp assistant hoon. Main aapki requirement samajh sakta hoon, approved sawaalon " +
    "ke jawab de sakta hoon, booking request le sakta hoon aur activation mein help kar sakta hoon. Main human callback bhi arrange kar sakta hoon.",
};

// Playbook 4.3
const DONT_REMEMBER: L = {
  en:
    "No problem. The enquiry was about reducing expenses on consultations, tests, medicines, treatments and planned " +
    "surgeries. Is there a healthcare expense you are planning now?",
  hi:
    "कोई बात नहीं। यह पूछताछ कंसल्टेशन, टेस्ट, दवाइयों, इलाज और प्लान की गई सर्जरी के खर्च कम करने के बारे में थी। क्या आप " +
    "अभी कोई हेल्थकेयर खर्च प्लान कर रहे हैं?",
  hinglish:
    "Koi baat nahi. Yeh enquiry consultations, tests, medicines, treatments aur planned surgeries ke kharche kam karne " +
    "ke baare mein thi. Kya aap abhi koi healthcare expense plan kar rahe hain?",
};

// Playbook 8 member pricing (Cut Medi Bills route only; Oxxy family pricing is [CONFIRM] and escalated)
const MEMBER_PRICING_CMB: L = {
  en: "The listed Cut Medi Bills price is for one individual. Each additional member receives 30% off the listed price after the first member activates at full price.",
  hi: "Cut Medi Bills की बताई गई कीमत एक व्यक्ति के लिए है। पहले सदस्य के पूरी कीमत पर एक्टिवेट करने के बाद हर अतिरिक्त सदस्य को बताई गई कीमत पर 30% की छूट मिलती है।",
  hinglish: "Cut Medi Bills ki listed price ek individual ke liye hai. Pehle member ke full price par activate karne ke baad har additional member ko listed price par 30% off milta hai.",
};

// Playbook 8 cancellation. {method} = CMB_CANCELLATION_METHOD [CONFIRM]; when it is not set the question is escalated.
const CMB_CANCEL = (method: string): L => ({
  en: `The monthly Cut Medi Bills option may be cancelled anytime through ${method}; successful cancellation stops future charges. You will receive a notice before each renewal charge.`,
  hi: `मासिक Cut Medi Bills विकल्प को ${method} के ज़रिए कभी भी रद्द किया जा सकता है; सफल रद्दीकरण के बाद आगे कोई शुल्क नहीं लगता। हर रिन्यूअल शुल्क से पहले आपको सूचना मिलेगी।`,
  hinglish: `Monthly Cut Medi Bills option ko ${method} ke through kabhi bhi cancel kiya ja sakta hai; successful cancellation ke baad aage koi charge nahi lagta. Har renewal charge se pehle aapko notice milega.`,
});

const EARLY_ACTIVATION: L = {
  en: "I can request a senior review for earlier activation, but I cannot promise it.",
  hi: "मैं जल्दी एक्टिवेशन के लिए सीनियर रिव्यू का अनुरोध कर सकता हूँ, लेकिन इसका वादा नहीं कर सकता।",
  hinglish: "Main jaldi activation ke liye senior review request kar sakta hoon, lekin iska promise nahi kar sakta.",
};

/** Playbook 8 [CONFIRM]: how a monthly Cut Medi Bills mandate is cancelled */
export const cmbCancellationMethod = (): string | null => (process.env.CMB_CANCELLATION_METHOD || "").trim() || null;

/**
 * FAQs that are not answered from a fixed text on this route: Oxxy family pricing is not in the source
 * documents (1.1 [CONFIRM], escalate per 16.4), and the cancellation method is escalated until configured.
 */
export function faqNeedsPerson(key: FaqKey, product?: string | null): string | null {
  if (key === "member_pricing" && product !== "cut_medi_bills") return "family / multi-member pricing (Oxxy) [CONFIRM]";
  if (key === "cmb_cancel" && !cmbCancellationMethod()) return "Cut Medi Bills cancellation method (not configured)";
  return null;
}

export interface FaqContext {
  /** the selected or active product: answers differ on the Cut Medi Bills route */
  product?: string | null;
  /** health-data consent refused: no health question at the end */
  noHealth?: boolean;
}

export function faqAnswer(key: FaqKey, ctx: FaqContext, l?: string | null): string {
  const cmb = ctx.product === "cut_medi_bills";
  switch (key) {
    case "what_is_oxxy":
      return say(WHAT_IS_OXXY, l);
    case "who_pays":
      return say(WHO_PAYS, l);
    case "repeat_use":
      return say(REPEAT_USE, l);
    case "pre_existing":
      if (cmb) return say(PRE_EXISTING_CMB, l);
      return ctx.noHealth ? say(PRE_EXISTING_OXXY, l) : `${say(PRE_EXISTING_OXXY, l)} ${say(PRE_EXISTING_ASK, l)}`;
    case "activation_time":
      return say(cmb ? ACTIVATION_CMB : ACTIVATION_OXXY, l);
    case "after_paying":
      return cmb ? `${say(AFTER_PAYING, l)} ${say(AFTER_PAYING_CMB, l)}` : say(AFTER_PAYING, l);
    case "cmb_age":
      return say(CMB_AGE, l);
    case "both_products":
      return say(BOTH, l);
    case "guarantee":
      return say(GUARANTEE, l);
    case "booking_confirmed":
      return say(BOOKING_CONFIRMED, l);
    case "policies":
      return say(POLICIES(officialReferences().policies), l);
    case "medical_advice":
      return say(MEDICAL_ADVICE, l);
    case "identity":
      return say(IDENTITY, l);
    case "dont_remember":
      return say(DONT_REMEMBER, l);
    case "member_pricing":
      return say(MEMBER_PRICING_CMB, l); // the Oxxy route is escalated (faqNeedsPerson)
    case "cmb_cancel":
      return say(CMB_CANCEL(cmbCancellationMethod() ?? "the official cancellation process"), l);
    case "early_activation":
      return `${say(cmb ? ACTIVATION_CMB : ACTIVATION_OXXY, l)} ${say(EARLY_ACTIVATION, l)}`;
  }
}

/** The answer without its last sentence when that sentence is a question (one question per turn, 1.1) */
export function withoutClosingQuestion(text: string): string {
  const parts = text.trim().split(/(?<=[.!?।])\s+/);
  if (parts.length > 1 && /\?\s*$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

/** The approved answers in English, for the LLM prompt: paraphrased questions get the same facts */
export function faqForPrompt(): string {
  const o = officialReferences();
  return [
    `What is Oxxy? -> ${WHAT_IS_OXXY.en}`,
    `Who pays the bill? -> ${WHO_PAYS.en}`,
    `Can it be used repeatedly? -> ${REPEAT_USE.en}`,
    `Pre-existing diseases? -> Oxxy route: ${PRE_EXISTING_OXXY.en} Cut Medi Bills route: ${PRE_EXISTING_CMB.en}`,
    `When does activation happen? -> Oxxy route: ${ACTIVATION_OXXY.en} Cut Medi Bills route: ${ACTIVATION_CMB.en}`,
    `Can I use it after paying? -> ${AFTER_PAYING.en}`,
    `Age limit for Cut Medi Bills? -> ${CMB_AGE.en}`,
    `Can both products be activated? -> ${BOTH.en}`,
    `Cut Medi Bills member pricing -> ${MEMBER_PRICING_CMB.en} (Oxxy family pricing is not confirmed: escalate.)`,
    `Faster activation? -> ${EARLY_ACTIVATION.en} Never promise it or use it to create urgency.`,
    `Is 30% guaranteed? -> ${GUARANTEE.en}`,
    `Will my appointment definitely be confirmed? -> ${BOOKING_CONFIRMED.en}`,
    `Where are the policies? -> the system adds the official link (${o.policies}); never write it yourself.`,
    `Medical advice / diagnosis (only when categorically asked) -> ${MEDICAL_ADVICE.en}`,
    `Are you a bot? -> ${IDENTITY.en}`,
  ].join("\n");
}
