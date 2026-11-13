// System-built replies for plans, prices and activation. Prices and links always come from plan_catalog.
// Wording follows the prototype simulator and the Full Development Plan (12.3, 12.5). [CONFIRM] before go-live.
// Every text has English (approved), Hindi and Hinglish (drafts, see Helper/Lang.ts). The English constants
// stay exported as before; `say(X_T, lang)` / the `l` argument gives the customer's language.
import { L, lang, say } from "./Lang";

const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const PLAN_REASON_T: Record<string, L> = {
  everyday: {
    en: "it suits routine consultations, tests and check-ups",
    hi: "यह नियमित परामर्श, जाँच और चेक-अप के लिए उपयुक्त है",
    hinglish: "yeh routine consultations, tests aur check-ups ke liye sahi hai",
  },
  vital: {
    en: "it covers OPD and possible hospitalisation",
    hi: "यह OPD और संभावित अस्पताल में भर्ती की ज़रूरतों में मदद करता है",
    hinglish: "yeh OPD aur possible hospitalisation mein madad karta hai",
  },
  thrive: {
    en: "it supports pre-existing conditions and larger expected expenses",
    hi: "यह पहले से मौजूद बीमारियों और बड़े अपेक्षित खर्चों में मदद करता है",
    hinglish: "yeh pre-existing conditions aur bade expected kharchon mein madad karta hai",
  },
  infinity: {
    en: "it has no age limit and the broadest scope",
    hi: "इसमें कोई आयु सीमा नहीं है और इसका दायरा सबसे व्यापक है",
    hinglish: "ismein koi age limit nahi hai aur iska scope sabse broad hai",
  },
};
export const PLAN_REASON: Record<string, string> = Object.fromEntries(
  Object.entries(PLAN_REASON_T).map(([k, v]) => [k, v.en]),
);
export const planReason = (plan: string, l?: string | null): string =>
  PLAN_REASON_T[plan] ? say(PLAN_REASON_T[plan], l) : say(FITS_T, l);
const FITS_T: L = {
  en: "it fits what you shared",
  hi: "यह आपकी बताई गई ज़रूरत के अनुसार है",
  hinglish: "yeh aapki batayi zaroorat ke hisaab se sahi hai",
};

export const ASK_AGE_T: L = {
  en: "To suggest the right plan, may I know the patient's age?",
  hi: "सही प्लान सुझाने के लिए, क्या मैं मरीज़ की उम्र जान सकता हूँ?",
  hinglish: "Sahi plan suggest karne ke liye, kya main patient ki age jaan sakta hoon?",
};
export const ASK_CITY_T: L = {
  en: "Which city and area should I search in? You can also share your location.",
  hi: "मैं किस शहर और इलाके में खोजूँ? आप अपनी लोकेशन भी भेज सकते हैं।",
  hinglish: "Main kis city aur area mein search karun? Aap apni location bhi share kar sakte hain.",
};
export const NO_CENTRE_T: L = {
  en: "I could not find a verified option in that area. Would you like me to widen the search, or do you have a centre in mind?",
  hi: "उस इलाके में मुझे कोई सत्यापित विकल्प नहीं मिला। क्या मैं खोज का दायरा बढ़ाऊँ, या आपके मन में कोई केंद्र है?",
  hinglish: "Us area mein mujhe koi verified option nahi mila. Kya main search badhaun, ya aapke mann mein koi centre hai?",
};
export const ASK_AGE = ASK_AGE_T.en;
export const ASK_CITY = ASK_CITY_T.en;
export const NO_CENTRE = NO_CENTRE_T.en;

// Trigger B: the approved answer to "Is Oxxy insurance?"
export const INSURANCE_ANSWER_T: L = {
  en:
    "No. Oxxy is not insurance and does not pay or reimburse claims. It is a healthcare-savings and support service " +
    "that can work alongside your insurance, so you should not cancel it. Are you asking about a specific planned service?",
  hi:
    "नहीं। Oxxy बीमा नहीं है और यह क्लेम का भुगतान या प्रतिपूर्ति नहीं करता। यह एक स्वास्थ्य-बचत और सहायता सेवा है " +
    "जो आपके बीमा के साथ काम कर सकती है, इसलिए आपको अपना बीमा रद्द नहीं करना चाहिए। क्या आप किसी खास नियोजित सेवा के बारे में पूछ रहे हैं?",
  hinglish:
    "Nahi. Oxxy insurance nahi hai aur claims ka payment ya reimbursement nahi karta. Yeh ek healthcare-savings aur " +
    "support service hai jo aapke insurance ke saath kaam kar sakti hai, isliye aapko apna insurance cancel nahi karna chahiye. " +
    "Kya aap kisi specific planned service ke baare mein pooch rahe hain?",
};

// Trigger B (Trigger layer 4): the customer already has insurance, Oxxy route. Never advise cancelling it.
export const INSURANCE_HAS_ANSWER_T: L = {
  en:
    "Oxxy is not insurance, and your insurance remains valuable, so you should not cancel it. Oxxy can complement it " +
    "by helping with eligible consultations, tests, medicines, planned treatments and expenses that insurance may not " +
    "fully address. Which healthcare expense would you most like help reducing?",
  hi:
    "Oxxy बीमा नहीं है, और आपका बीमा उपयोगी बना रहता है, इसलिए आपको उसे रद्द नहीं करना चाहिए। Oxxy योग्य परामर्श, जाँच, " +
    "दवाइयों, नियोजित इलाज और उन खर्चों में मदद करके उसका साथ दे सकता है जिन्हें बीमा पूरी तरह कवर न करे। " +
    "आप किस स्वास्थ्य खर्च को सबसे ज़्यादा कम करना चाहेंगे?",
  hinglish:
    "Oxxy insurance nahi hai, aur aapka insurance useful rehta hai, isliye use cancel nahi karna chahiye. Oxxy eligible " +
    "consultations, tests, medicines, planned treatments aur un kharchon mein madad karke uska saath de sakta hai jo " +
    "insurance poori tarah address na kare. Aap kis healthcare kharche ko sabse zyada kam karna chahenge?",
};

// Trigger J (Trigger layer 8 / Playbook 8): insurance with Cut Medi Bills, only when Cut Medi Bills is the route
export const INSURANCE_COORDINATION_T: L = {
  en:
    "Cut Medi Bills may be used with insurance if the Oxxy service team is informed before insurance is applied or " +
    "activated for the case and before the medical-centre appointment. Would you like the team to coordinate the next step?",
  hi:
    "Cut Medi Bills का उपयोग बीमा के साथ किया जा सकता है, अगर उस केस के लिए बीमा लागू या सक्रिय करने से पहले और मेडिकल-केंद्र " +
    "की अपॉइंटमेंट से पहले Oxxy सर्विस टीम को बताया जाए। क्या आप चाहेंगे कि टीम अगले कदम का समन्वय करे?",
  hinglish:
    "Cut Medi Bills insurance ke saath use ho sakta hai, agar us case ke liye insurance apply ya activate karne se pehle " +
    "aur medical-centre appointment se pehle Oxxy service team ko bataya jaaye. Kya aap chahenge ki team next step coordinate kare?",
};
export const INSURANCE_ANSWER = INSURANCE_ANSWER_T.en;
export const INSURANCE_HAS_ANSWER = INSURANCE_HAS_ANSWER_T.en;
export const INSURANCE_COORDINATION = INSURANCE_COORDINATION_T.en;

/** "Do I get a discount at this hospital?" - a saving question about a centre (Playbook 10, acceptance test) */
export function asksCentreSaving(text: string): boolean {
  const t = (text || "").toLowerCase();
  const money =
    /\b(discounts?|savings?|save|concessions?|cashback|cheaper|chhoot|chhut|kam paise)\b|छूट|बचत|डिस्काउंट/u.test(t);
  const place =
    /\b(hospitals?|centres?|centers?|clinics?|nursing home|labs?|diagnostics?|aspatal)\b|अस्पताल|हॉस्पिटल|क्लिनिक/u.test(t);
  return money && place;
}

const priceText = (yearly: number, monthly: number | null, l: string) => {
  const g = lang(l);
  if (g === "hi") return monthly ? `${inr(monthly)} मासिक या ${inr(yearly)} वार्षिक` : `${inr(yearly)} वार्षिक`;
  if (g === "hinglish") return monthly ? `${inr(monthly)} monthly ya ${inr(yearly)} yearly` : `${inr(yearly)} yearly`;
  return monthly ? `${inr(monthly)} monthly or ${inr(yearly)} yearly` : `${inr(yearly)} yearly`;
};

export function recommendText(
  plan: string,
  yearly: number,
  monthly: number | null,
  spend: number,
  saving: number,
  l: string | null = "en",
): string {
  const p = title(plan);
  const price = priceText(yearly, monthly, l || "en");
  const why = planReason(plan, l);
  switch (lang(l)) {
    case "hi":
      return (
        `मैं ${p} प्लान की सलाह देता हूँ क्योंकि ${why}। मौजूदा कीमत ${price} और लागू GST है।\n\n` +
        `आपने बताया कि आपका सालाना स्वास्थ्य खर्च लगभग ${inr(spend)} है। एक आसान उदाहरण के तौर पर, ${p} प्लान से साल में ` +
        `लगभग ${inr(saving)} की बचत हो सकती है, जबकि प्लान की कीमत ${inr(yearly)} और GST है। असली बचत इस्तेमाल की गई सेवाओं ` +
        `और प्रदाताओं पर निर्भर करती है। क्या आप प्लान की जानकारी चाहेंगे?`
      );
    case "hinglish":
      return (
        `Main ${p} plan recommend karta hoon kyunki ${why}. Current price ${price} plus applicable GST hai.\n\n` +
        `Aapne bataya ki aapka yearly healthcare kharcha lagbhag ${inr(spend)} hai. Ek easy illustration ke liye, ${p} plan se ` +
        `saal mein lagbhag ${inr(saving)} ki bachat ho sakti hai, jabki plan price ${inr(yearly)} plus GST hai. Actual bachat ` +
        `use ki gayi services aur providers par depend karti hai. Kya aap plan details chahenge?`
      );
    default:
      return (
        `I recommend the ${p} plan because ${why}. The current price is ${price} plus applicable GST.\n\n` +
        `You mentioned a yearly healthcare spend of about ${inr(spend)}. As an easy illustration, the ${p} plan could help you save ` +
        `about ${inr(saving)} a year, against a plan price of ${inr(yearly)} plus GST. Actual saving depends on the services and ` +
        `providers used. Would you like the plan details?`
      );
  }
}

export function honestText(
  plan: string,
  yearly: number,
  monthly: number | null,
  spend: number,
  l: string | null = "en",
): string {
  const price = priceText(yearly, monthly, l || "en");
  switch (lang(l)) {
    case "hi":
      return (
        `आपकी बताई जानकारी के अनुसार ${title(plan)} प्लान सबसे उपयुक्त है, ${price} और लागू GST पर। ` +
        `लगभग ${inr(spend)} सालाना खर्च पर, सिर्फ़ बचत से इसकी कीमत शायद पूरी न हो। ` +
        `मैं फिर भी बिना किसी शुल्क के केंद्र ढूँढने या बुकिंग अनुरोध लेने में मदद कर सकता हूँ।`
      );
    case "hinglish":
      return (
        `Aapki batayi jaankari ke hisaab se ${title(plan)} plan sabse sahi hai, ${price} plus applicable GST par. ` +
        `Lagbhag ${inr(spend)} yearly kharche par, sirf bachat se iski price shayad poori na ho. ` +
        `Main phir bhi bina kisi charge ke centre dhoondhne ya booking request lene mein madad kar sakta hoon.`
      );
    default:
      return (
        `Based on what you shared, the ${title(plan)} plan fits best, at ${price} plus applicable GST. ` +
        `At about ${inr(spend)} a year, it may not pay for itself in savings alone. ` +
        `I can still help you find a centre or take a booking request at no cost.`
      );
  }
}

export function disclosureText(
  productLabel: string,
  price: number,
  billing: string,
  renewalTerms: string | null,
  activationTime: string | null,
  l: string | null = "en",
): string {
  const monthly = billing === "monthly";
  const renewal = renewalTerms ? renewalTerms.replace(/[.\s]+$/, "") : null;
  switch (lang(l)) {
    case "hi":
      return (
        `चुना गया: ${productLabel}। कीमत: ${inr(price)} ${monthly ? "मासिक" : "वार्षिक"} और लागू GST।` +
        (renewal ? ` नवीनीकरण: ${renewal}।` : "") +
        (activationTime ? ` एक्टिवेशन: ${activationTime}।` : "") +
        ` भुगतान से पहले कृपया आधिकारिक पेज देखें। क्या मैं आधिकारिक सुरक्षित एक्टिवेशन लिंक भेजूँ? कृपया हाँ या नहीं लिखें।`
      );
    case "hinglish":
      return (
        `Selected: ${productLabel}. Price: ${inr(price)} ${monthly ? "monthly" : "yearly"} plus applicable GST.` +
        (renewal ? ` Renewal: ${renewal}.` : "") +
        (activationTime ? ` Activation: ${activationTime}.` : "") +
        ` Payment se pehle official page zaroor dekhein. Kya main official secure activation link bhejun? YES ya NO likhein.`
      );
    default:
      return (
        `Selected: ${productLabel}. Price: ${inr(price)} ${monthly ? "monthly" : "yearly"} plus applicable GST.` +
        (renewal ? ` Renewal: ${renewal}.` : "") +
        (activationTime ? ` Activation: ${activationTime}.` : "") +
        ` Please review the official page before payment. Shall I send the official secure activation link? Reply YES or NO.`
      );
  }
}

export function linkText(link: string, l: string | null = "en"): string {
  switch (lang(l)) {
    case "hi":
      return `यह आधिकारिक सुरक्षित एक्टिवेशन लिंक है: ${link}\nभुगतान से पहले कृपया प्लान, कीमत, GST और नवीनीकरण की जानकारी देखें। पूरा होने के बाद DONE लिखें।`;
    case "hinglish":
      return `Yeh official secure activation link hai: ${link}\nPayment se pehle plan, price, GST aur renewal details zaroor dekhein. Complete hone ke baad DONE likhein.`;
    default:
      return `Here is the official secure activation link: ${link}\nPlease review the plan, price, GST and renewal details before payment. Reply DONE once you have completed it.`;
  }
}

export const LINK_DECLINED_T: L = {
  en: "No problem. I can share a short summary, answer a question, or follow up at a time that suits you.",
  hi: "कोई बात नहीं। मैं एक छोटा सारांश भेज सकता हूँ, किसी सवाल का जवाब दे सकता हूँ, या आपके सुविधाजनक समय पर फ़ॉलो-अप कर सकता हूँ।",
  hinglish: "Koi baat nahi. Main ek short summary bhej sakta hoon, kisi sawaal ka jawab de sakta hoon, ya aapke convenient time par follow up kar sakta hoon.",
};
export const LINK_DECLINED = LINK_DECLINED_T.en;

// ---- After the link (plan 12.5, AWAITING_PAYMENT) ----
// Trigger P: the customer says the payment is done. Never called "active" until the sales team verifies it.
export const PAYMENT_DONE_T: L = {
  en:
    "Thank you. Our team will check the payment and confirm your activation on WhatsApp. " +
    "You do not need to share any card, UPI or bank details.",
  hi: "धन्यवाद। हमारी टीम भुगतान की जाँच करेगी और WhatsApp पर आपके एक्टिवेशन की पुष्टि करेगी। आपको कोई कार्ड, UPI या बैंक जानकारी साझा करने की ज़रूरत नहीं है।",
  hinglish:
    "Dhanyavaad. Hamari team payment check karegi aur WhatsApp par aapka activation confirm karegi. " +
    "Aapko koi card, UPI ya bank details share karne ki zaroorat nahi hai.",
};

// Payment failed: ask whether money was debited; never ask for credentials
export const PAYMENT_FAILED_T: L = {
  en:
    "Sorry about that. Was any money debited from your account? Please do not share card, UPI PIN or OTP details. " +
    "I have asked our payment support team to help you.",
  hi: "इसके लिए खेद है। क्या आपके खाते से कोई पैसा कटा है? कृपया कार्ड, UPI PIN या OTP की जानकारी साझा न करें। मैंने हमारी पेमेंट सपोर्ट टीम से आपकी मदद करने को कहा है।",
  hinglish:
    "Iske liye sorry. Kya aapke account se koi paisa kata hai? Kripya card, UPI PIN ya OTP details share na karein. " +
    "Maine hamari payment support team se aapki madad karne ko kaha hai.",
};

export const PAYMENT_NOT_NOW_T: L = {
  en: "No problem. The link stays valid. I can share a short summary, or follow up at a time that suits you.",
  hi: "कोई बात नहीं। लिंक मान्य रहेगा। मैं एक छोटा सारांश भेज सकता हूँ, या आपके सुविधाजनक समय पर फ़ॉलो-अप कर सकता हूँ।",
  hinglish: "Koi baat nahi. Link valid rahega. Main ek short summary bhej sakta hoon, ya aapke convenient time par follow up kar sakta hoon.",
};
export const PAYMENT_DONE = PAYMENT_DONE_T.en;
export const PAYMENT_FAILED = PAYMENT_FAILED_T.en;
export const PAYMENT_NOT_NOW = PAYMENT_NOT_NOW_T.en;

// ---- After a booking request (plan 12.4, BOOKING_RECORDED) ----
// Playbook 11.2: ONE soft suggestion for the selected product only, the neutral savings wording, no
// pressure, and an honest line that the human follow-up can also answer activation questions.
// `planName` = the recommended Oxxy plan ("Vital"), or null when none is picked yet.
export function softActivationText(
  product: "oxxy" | "cut_medi_bills",
  planName: string | null,
  caution: string | null,
  l: string | null = "en",
): string {
  const c = caution ? ` ${caution}` : "";
  switch (lang(l)) {
    case "hi": {
      const offer =
        product === "cut_medi_bills"
          ? "अगर आप इस ज़रूरत का खर्च कम करने में मदद चाहते हैं, तो आप अभी Cut Medi Bills एक्टिवेट कर सकते हैं।"
          : planName
            ? `अगर आप इस और आगे की स्वास्थ्य ज़रूरतों के लिए Oxxy की मदद चाहते हैं, तो आप अभी सुझाया गया ${planName} प्लान एक्टिवेट कर सकते हैं।`
            : "अगर आप इस और आगे की स्वास्थ्य ज़रूरतों के लिए Oxxy की मदद चाहते हैं, तो आप अभी कोई Oxxy प्लान एक्टिवेट कर सकते हैं।";
      return (
        `${offer} इस केंद्र पर किसी भी बचत की पुष्टि अलग से की जाती है। कोई दबाव नहीं है; आपका बुकिंग अनुरोध पहले से दर्ज है।${c}` +
        "\n\nOxxy टीम बुकिंग अनुरोध के बारे में आपसे संपर्क करेगी और एक्टिवेशन से जुड़े सवालों का जवाब भी दे सकती है। " +
        "क्या आप अभी एक्टिवेशन के बारे में और जानना चाहेंगे? कृपया हाँ या नहीं लिखें।"
      );
    }
    case "hinglish": {
      const offer =
        product === "cut_medi_bills"
          ? "Agar aap is requirement ka kharcha kam karne mein madad chahte hain, to aap abhi Cut Medi Bills activate kar sakte hain."
          : planName
            ? `Agar aap is aur aage ki healthcare zarooraton ke liye Oxxy support chahte hain, to aap abhi recommended ${planName} plan activate kar sakte hain.`
            : "Agar aap is aur aage ki healthcare zarooraton ke liye Oxxy support chahte hain, to aap abhi koi Oxxy plan activate kar sakte hain.";
      return (
        `${offer} Is centre par kisi bhi bachat ka confirmation alag se hota hai. Koi pressure nahi hai; aapka booking request pehle se recorded hai.${c}` +
        "\n\nOxxy team booking request ke baare mein aapse contact karegi aur activation ke sawaalon ka jawab bhi de sakti hai. " +
        "Kya aap abhi activation ke baare mein aur jaanna chahenge? YES ya NO likhein."
      );
    }
    default: {
      const offer =
        product === "cut_medi_bills"
          ? "If you would like help reducing the cost of this requirement, you may activate Cut Medi Bills now."
          : planName
            ? `If you would like Oxxy support for this and future healthcare needs, you may activate the recommended ${planName} plan now.`
            : "If you would like Oxxy support for this and future healthcare needs, you may activate an Oxxy plan now.";
      return (
        `${offer} Any saving at this centre is confirmed separately. There is no pressure; your booking request is already recorded.${c}` +
        "\n\nThe Oxxy team will contact you about the booking request and can also answer any activation questions. " +
        "Would you like to know more about activation now? Reply YES or NO."
      );
    }
  }
}

// Playbook 11.2 timing caution: the requested date is before activation normally completes
export function timingCaution(activationTime: string, l: string | null = "en"): string {
  switch (lang(l)) {
    case "hi":
      return `कृपया ध्यान दें कि एक्टिवेशन में आम तौर पर ${activationTime} लगते हैं, जो आपकी चुनी गई तारीख के बाद हो सकता है, इसलिए इस विज़िट पर बचत शायद उपलब्ध न हो।`;
    case "hinglish":
      return `Kripya dhyan dein ki activation mein aam taur par ${activationTime} lagte hain, jo aapki requested date ke baad ho sakta hai, isliye is visit par bachat shayad available na ho.`;
    default:
      return (
        `Please note that activation normally takes ${activationTime}, which may be after your requested date, ` +
        "so a saving may not be available for this visit."
      );
  }
}

// Playbook 11.2 "If customer declines": booking-confirmation contact only, no activation pitch
export const SOFT_ACTIVATION_DECLINED_T: L = {
  en:
    "Absolutely, no problem. Your booking request is recorded, and the Oxxy team will contact you regarding " +
    "confirmation. Is there anything else I can help with?",
  hi: "बिल्कुल, कोई बात नहीं। आपका बुकिंग अनुरोध दर्ज है, और पुष्टि के लिए Oxxy टीम आपसे संपर्क करेगी। क्या मैं किसी और चीज़ में मदद कर सकता हूँ?",
  hinglish:
    "Bilkul, koi baat nahi. Aapka booking request recorded hai, aur confirmation ke liye Oxxy team aapse contact karegi. " +
    "Kya main kisi aur cheez mein madad kar sakta hoon?",
};
export const SOFT_ACTIVATION_DECLINED = SOFT_ACTIVATION_DECLINED_T.en;

// A centre the customer named is not in the directory: never reject it (plan 12.4)
export function unknownCentreText(name: string): string {
  return (
    `Thank you. "${name}" is not in our directory yet, so our team will check it. ` +
    "Please share its address or a nearby landmark, and your preferred date."
  );
}
