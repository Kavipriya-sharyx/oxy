// Cut Medi Bills routing and eligibility gate (Full Plan 6.1, 8.2, 12.3). Pure rules + fixed texts;
// the chat pipeline stores the answers in `eligibility` and asks one question per turn.
import { eligibility } from "@Database/Table/Oxxy/eligibility";
import { L, lang, say } from "@Helper/Lang";

const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

/** The customer names Cut Medi Bills themself */
export function asksForCmb(text: string): boolean {
  return /cut\s*-?\s*medi(cal)?\s*bills?|\bcmb\b/i.test(text || "");
}

// One question per turn, in this order. A YES to any of them = not eligible at that centre.
export const GATE_STEPS = ["booking", "registration", "treatment", "bill"] as const;
export type GateStep = (typeof GATE_STEPS)[number] | "centre" | "bill_amount";

export const GATE_QUESTION_T: Record<GateStep, L> = {
  centre: {
    en: "Cut Medi Bills is for one upcoming expense at one centre. At which hospital or centre will this happen?",
    hi: "Cut Medi Bills एक केंद्र पर एक आने वाले खर्च के लिए है। यह किस अस्पताल या केंद्र में होगा?",
    hinglish: "Cut Medi Bills ek centre par ek upcoming kharche ke liye hai. Yeh kis hospital ya centre mein hoga?",
  },
  booking: {
    en: "Have you already booked an appointment there yourself for this (not through Oxxy)? Reply YES or NO.",
    hi: "क्या आपने इसके लिए वहाँ खुद पहले से अपॉइंटमेंट बुक की है (Oxxy के ज़रिए नहीं)? हाँ या नहीं लिखें।",
    hinglish: "Kya aapne iske liye wahan khud pehle se appointment book ki hai (Oxxy ke through nahi)? YES ya NO likhein.",
  },
  registration: {
    en: "Have you already registered as a patient there for this? Reply YES or NO.",
    hi: "क्या आपने इसके लिए वहाँ पहले से मरीज़ के रूप में रजिस्ट्रेशन कराया है? हाँ या नहीं लिखें।",
    hinglish: "Kya aapne iske liye wahan pehle se patient registration karaya hai? YES ya NO likhein.",
  },
  treatment: {
    en: "Has the treatment for this already started? Reply YES or NO.",
    hi: "क्या इसका इलाज पहले से शुरू हो चुका है? हाँ या नहीं लिखें।",
    hinglish: "Kya iska treatment pehle se shuru ho chuka hai? YES ya NO likhein.",
  },
  bill: {
    en: "Have you already received or paid any bill there for this? Reply YES or NO.",
    hi: "क्या आपको इसके लिए वहाँ पहले से कोई बिल मिला है या आपने भुगतान किया है? हाँ या नहीं लिखें।",
    hinglish: "Kya aapko iske liye wahan pehle se koi bill mila hai ya aapne payment kiya hai? YES ya NO likhein.",
  },
  bill_amount: {
    en: "Roughly how much is the expected bill for this?",
    hi: "इसका अनुमानित बिल लगभग कितना है?",
    hinglish: "Iska expected bill lagbhag kitna hai?",
  },
};
export const GATE_QUESTION: Record<GateStep, string> = Object.fromEntries(
  Object.entries(GATE_QUESTION_T).map(([k, v]) => [k, v.en]),
) as Record<GateStep, string>;
export const gateQuestion = (step: GateStep, l?: string | null): string => say(GATE_QUESTION_T[step], l);

/** Said once when the gate opens (before the first gate question) */
export const GATE_INTRO_T: L = {
  en: "Cut Medi Bills can be used only before anything is booked, registered, started or billed at the centre, so I will check that first.",
  hi: "Cut Medi Bills का उपयोग तभी हो सकता है जब केंद्र पर कुछ भी बुक, रजिस्टर, शुरू या बिल न हुआ हो, इसलिए मैं पहले यह जाँच लेता हूँ।",
  hinglish: "Cut Medi Bills tabhi use ho sakta hai jab centre par kuch bhi book, register, start ya bill na hua ho, isliye main pehle yeh check kar leta hoon.",
};
export const ROUGH_AMOUNT_T: L = {
  en: "A rough amount is fine, for example 80,000.",
  hi: "अनुमानित रकम भी ठीक है, जैसे 80,000।",
  hinglish: "Rough amount bhi chalega, jaise 80,000.",
};
export const GATE_FAILED_BEFORE_T: L = {
  en: "As we checked earlier, Cut Medi Bills cannot be used for that expense because something was already booked, registered, started or billed at that centre. If it is for a different centre, tell me its name.",
  hi: "जैसा हमने पहले देखा, उस केंद्र पर पहले से कुछ बुक, रजिस्टर, शुरू या बिल हो चुका है, इसलिए उस खर्च के लिए Cut Medi Bills का उपयोग नहीं हो सकता। अगर यह किसी दूसरे केंद्र के लिए है, तो उसका नाम बताइए।",
  hinglish: "Jaisa humne pehle check kiya, us centre par pehle se kuch book, register, start ya bill ho chuka hai, isliye us kharche ke liye Cut Medi Bills use nahi ho sakta. Agar yeh kisi dusre centre ke liye hai, to uska naam bataiye.",
};

const COLUMN: Record<(typeof GATE_STEPS)[number], keyof eligibility> = {
  booking: "booking_state",
  registration: "registration_state",
  treatment: "treatment_state",
  bill: "bill_state",
};

export function columnFor(step: (typeof GATE_STEPS)[number]): keyof eligibility {
  return COLUMN[step];
}

/** The plan's generated column: nothing booked independently, registered, started or billed */
export function isEligible(e: Partial<eligibility> | null | undefined): boolean {
  if (!e) return false;
  return GATE_STEPS.every((s) => (e[COLUMN[s]] ?? "none") === "none");
}

/** A YES to any gate question: not eligible at that centre */
export function gateFailed(e: Partial<eligibility> | null | undefined): boolean {
  if (!e) return false;
  return GATE_STEPS.some((s) => ["done", "generated", "part_paid", "paid"].includes(String(e[COLUMN[s]])));
}

/** True once every gate question has an answer */
export function gateComplete(e: Partial<eligibility> | null | undefined): boolean {
  if (!e) return false;
  return GATE_STEPS.every((s) => !!e[COLUMN[s]] && e[COLUMN[s]] !== "unknown");
}

/** "50,000", "50k", "1.5 lakh", "₹ 80000" -> number, or null */
export function parseAmount(text: string): number | null {
  const t = (text || "").toLowerCase().replace(/,/g, "").replace(/₹|rs\.?|inr/g, " ");
  const m = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l\b|k\b|thousand|hazaar|hazar)?/);
  if (!m) return null;
  let n = Number(m[1]);
  const unit = m[2] || "";
  if (/lakh|lac|^l$/.test(unit)) n *= 100000;
  else if (/k|thousand|haz/.test(unit)) n *= 1000;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function notEligibleText(step: (typeof GATE_STEPS)[number], l: string | null = "en"): string {
  const what: Record<(typeof GATE_STEPS)[number], L> = {
    booking: {
      en: "an appointment was already booked there",
      hi: "वहाँ पहले से अपॉइंटमेंट बुक हो चुकी है",
      hinglish: "wahan pehle se appointment book ho chuki hai",
    },
    registration: {
      en: "you are already registered there for this",
      hi: "आप इसके लिए वहाँ पहले से रजिस्टर्ड हैं",
      hinglish: "aap iske liye wahan pehle se registered hain",
    },
    treatment: {
      en: "the treatment has already started",
      hi: "इलाज पहले से शुरू हो चुका है",
      hinglish: "treatment pehle se shuru ho chuka hai",
    },
    bill: { en: "a bill has already been raised there", hi: "वहाँ पहले से बिल बन चुका है", hinglish: "wahan pehle se bill ban chuka hai" },
  };
  const w = say(what[step], l);
  return say(
    {
      en:
        `Thank you for telling me. Cut Medi Bills can be used only before you book, register, start treatment ` +
        `or get a bill at that centre, and ${w}, so it cannot be used for this expense. ` +
        `An Oxxy plan may still help with your healthcare needs, or I can help you find another centre. What would you prefer?`,
      hi:
        `बताने के लिए धन्यवाद। Cut Medi Bills का उपयोग उस केंद्र पर बुकिंग, रजिस्ट्रेशन, इलाज शुरू होने या बिल बनने से पहले ही हो सकता है, ` +
        `और ${w}, इसलिए इस खर्च के लिए इसका उपयोग नहीं हो सकता। Oxxy प्लान फिर भी आपकी स्वास्थ्य ज़रूरतों में मदद कर सकता है, ` +
        `या मैं कोई दूसरा केंद्र ढूँढने में मदद कर सकता हूँ। आप क्या चाहेंगे?`,
      hinglish:
        `Batane ke liye dhanyavaad. Cut Medi Bills us centre par booking, registration, treatment shuru hone ya bill banne se pehle hi ` +
        `use ho sakta hai, aur ${w}, isliye is kharche ke liye yeh use nahi ho sakta. Oxxy plan phir bhi aapki healthcare ` +
        `zarooraton mein madad kar sakta hai, ya main koi dusra centre dhoondhne mein madad kar sakta hoon. Aap kya chahenge?`,
    },
    l,
  );
}

export function cmbOfferText(
  bill: number,
  saving: number,
  monthly: number | null,
  yearly: number | null,
  activationTime: string | null = null,
  l: string | null = "en",
): string {
  const g = lang(l);
  const m = monthly
    ? g === "hi"
      ? `${inr(monthly)} प्रति माह, रद्द करने तक हर महीने नवीनीकरण`
      : g === "hinglish"
        ? `${inr(monthly)} har mahine, cancel karne tak monthly renew`
        : `${inr(monthly)} a month, renewing monthly until you cancel`
    : null;
  const y = yearly
    ? g === "hi"
      ? `${inr(yearly)} एक बार, एक साल के लिए`
      : g === "hinglish"
        ? `${inr(yearly)} one-time, ek saal ke liye`
        : `${inr(yearly)} one-time for one year`
    : null;
  const prices = [m, y].filter(Boolean).join(g === "en" ? ", or " : g === "hi" ? ", या " : ", ya ");
  if (g === "hi")
    return (
      `Cut Medi Bills इस एक आने वाले खर्च के लिए उपयुक्त है। मौजूदा कीमत ${prices}, और लागू GST है। ` +
      `लगभग ${inr(bill)} के अनुमानित बिल पर, एक आसान उदाहरण के तौर पर लगभग ${inr(saving)} की बचत हो सकती है। ` +
      `असली बचत केंद्र और इस्तेमाल की गई सेवाओं पर निर्भर करती है।` +
      (activationTime ? ` एक्टिवेशन में ${activationTime} लगते हैं।` : "") +
      ` क्या आप मासिक या एक साल वाला विकल्प चुनना चाहेंगे?`
    );
  if (g === "hinglish")
    return (
      `Cut Medi Bills is ek upcoming kharche ke liye sahi hai. Current price ${prices}, plus applicable GST hai. ` +
      `Lagbhag ${inr(bill)} ke expected bill par, ek easy illustration ke liye lagbhag ${inr(saving)} ki bachat ho sakti hai. ` +
      `Actual bachat centre aur use ki gayi services par depend karti hai.` +
      (activationTime ? ` Activation mein ${activationTime} lagte hain.` : "") +
      ` Kya aap monthly ya one-year option ke saath aage badhna chahenge?`
    );
  return (
    `Cut Medi Bills fits this one upcoming expense. The current price is ${prices}, plus applicable GST. ` +
    `For an expected bill of about ${inr(bill)}, as an easy illustration it could help you save about ${inr(saving)}. ` +
    `Actual saving depends on the centre and the services used.` +
    (activationTime ? ` Activation takes ${activationTime}.` : "") +
    ` ` +
    `Would you like to go ahead with the monthly or the one-year option?`
  );
}

export function cmbNotWorthText(bill: number, monthly: number | null, l: string | null = "en"): string {
  switch (lang(l)) {
    case "hi":
      return (
        `लगभग ${inr(bill)} के अनुमानित बिल पर, Cut Medi Bills${monthly ? ` (${inr(monthly)} प्रति माह और GST)` : ""} ` +
        `से इस खर्च पर इसकी कीमत शायद पूरी न हो। मैं फिर भी बिना शुल्क के केंद्र ढूँढने या बुकिंग अनुरोध लेने में मदद कर सकता हूँ, ` +
        `या लगातार ज़रूरतों के लिए Oxxy प्लान के बारे में बता सकता हूँ।`
      );
    case "hinglish":
      return (
        `Lagbhag ${inr(bill)} ke expected bill par, Cut Medi Bills${monthly ? ` (${inr(monthly)} har mahine plus GST)` : ""} ` +
        `is kharche par shayad apni price poori na kare. Main phir bhi bina charge ke centre dhoondhne ya booking request lene ` +
        `mein madad kar sakta hoon, ya ongoing needs ke liye Oxxy plans ke baare mein bata sakta hoon.`
      );
    default:
      return (
        `For an expected bill of about ${inr(bill)}, Cut Medi Bills${monthly ? ` (${inr(monthly)} a month plus GST)` : ""} ` +
        `may not pay for itself on this expense. I can still help you find a centre or take a booking request at no cost, ` +
        `or tell you about Oxxy plans for ongoing needs.`
      );
  }
}
