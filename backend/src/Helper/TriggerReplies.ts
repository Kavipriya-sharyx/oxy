// Approved texts for the content triggers of the WhatsApp Trigger & Conversion Layer (A, C, E comparison,
// F, L) and the phrases that fire them (Trigger layer 14.1). System-built: Claude never words these.
// Links and contacts come from Playbook 21 (approved reference links); env vars may override them.
// Every text: English (approved) + Hindi / Hinglish drafts (Helper/Lang.ts); the last argument is the language.
import { L, lang, say } from "./Lang";

const inr = (n: number) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface LinkItem {
  title: string;
  url: string;
}

/** Playbook 21: official website, policies and support contacts */
export function officialReferences(): { website: string; policies: string; phone: string; email: string } {
  return {
    website: process.env.OXXY_WEBSITE_URL || "https://www.oxxy.in",
    policies: process.env.OXXY_POLICIES_URL || "https://www.oxxy.in/policies",
    phone: process.env.OXXY_SUPPORT_PHONE || "8800855340",
    email: process.env.OXXY_SUPPORT_EMAIL || "info@oxxy.in",
  };
}

const normUrl = (u: string) => u.trim().toLowerCase().replace(/\/+$/, "");

// ---------------------------------------------------------------- Trigger A: trust and legitimacy pack

/** Trigger layer 14.1 A. "scam" / "fraud" are complaint keywords (guardrail) and never reach this. */
export function asksTrust(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\b(genuine|legit|legitimate|fake|prove it|company details|can i trust|should i trust|(?:don't|dont|do not) trust|not sure (?:i can|if i can|we can) trust|trust (you|oxxy|this|it)\s*\?|is (this|oxxy|it|the company) (real|safe|registered)|verify (you|oxxy|this|the company)|asli|nakli|bharosa)\b|असली|नकली|भरोसा/u.test(
    t,
  );
}

const TRUST_LABELS: Record<"website" | "policies" | "support", L> = {
  website: { en: "Official website", hi: "आधिकारिक वेबसाइट", hinglish: "Official website" },
  policies: { en: "Official policies", hi: "आधिकारिक नीतियाँ", hinglish: "Official policies" },
  support: { en: "Support", hi: "सहायता", hinglish: "Support" },
};
const TRUST_INTRO: L = {
  en:
    "It is sensible to verify any healthcare service before paying. For your convenience, I am sending Oxxy's " +
    "official website, policy page, support contacts and a few approved independent references.",
  hi:
    "किसी भी स्वास्थ्य सेवा के लिए भुगतान से पहले उसकी जाँच करना समझदारी है। आपकी सुविधा के लिए मैं Oxxy की आधिकारिक " +
    "वेबसाइट, नीति पेज, सहायता संपर्क और कुछ स्वीकृत स्वतंत्र संदर्भ भेज रहा हूँ।",
  hinglish:
    "Kisi bhi healthcare service ke liye payment se pehle use verify karna samajhdaari hai. Aapki suvidha ke liye main " +
    "Oxxy ki official website, policy page, support contacts aur kuch approved independent references bhej raha hoon.",
};
const TRUST_CLOSE: L = {
  en: "Please review them and activate only through an official secure link. What would you like to verify first?",
  hi: "कृपया इन्हें देखें और केवल आधिकारिक सुरक्षित लिंक से ही एक्टिवेट करें। आप सबसे पहले क्या जाँचना चाहेंगे?",
  hinglish: "Kripya inhe dekhein aur sirf official secure link se hi activate karein. Aap sabse pehle kya verify karna chahenge?",
};
const TRUST_REPEAT: L = {
  en: "Here is Oxxy's official information:",
  hi: "यह Oxxy की आधिकारिक जानकारी है:",
  hinglish: "Yeh Oxxy ki official information hai:",
};

/**
 * Trigger layer 3. Order: official website, official policy, then the approved proof assets (2-4 items in
 * all). `extras` are approved assets; one with the same link as the website or policy is not repeated.
 * `withIntro` = the full approved message (first time in the journey); a repeat sends only the links.
 */
export function trustPackText(extras: LinkItem[], withIntro = true, l: string | null = "en"): string {
  const o = officialReferences();
  const more = trustPackAssets(extras);
  const lines = [
    `${say(TRUST_LABELS.website, l)}: ${o.website}`,
    `${say(TRUST_LABELS.policies, l)}: ${o.policies}`,
    `${say(TRUST_LABELS.support, l)}: ${o.phone}, ${o.email}`,
    ...more.map((x) => `${x.title}: ${x.url}`),
  ];
  return withIntro
    ? `${say(TRUST_INTRO, l)}\n\n${lines.join("\n")}\n\n${say(TRUST_CLOSE, l)}`
    : `${say(TRUST_REPEAT, l)}\n${lines.join("\n")}`;
}

/** How many of the extras trustPackText really shows (for the asset_send log) */
export function trustPackAssets<T extends LinkItem>(extras: T[]): T[] {
  const o = officialReferences();
  const seen = new Set([normUrl(o.website), normUrl(o.policies)]);
  return extras.filter((x) => !seen.has(normUrl(x.url))).slice(0, 2);
}

// ---------------------------------------------------------------- Trigger L: news and testimonials

const PROOF_INTRO: L = {
  en:
    "For your convenience, I am sending selected approved news coverage and customer references so you can " +
    "review Oxxy independently.",
  hi: "आपकी सुविधा के लिए मैं चुनी हुई स्वीकृत समाचार कवरेज और ग्राहक संदर्भ भेज रहा हूँ, ताकि आप Oxxy को स्वतंत्र रूप से जाँच सकें।",
  hinglish:
    "Aapki suvidha ke liye main selected approved news coverage aur customer references bhej raha hoon, taaki aap " +
    "Oxxy ko independently review kar sakein.",
};
const PROOF_CLOSE: L = {
  en: "Which point would you like to verify after reviewing them?",
  hi: "इन्हें देखने के बाद आप कौन-सी बात जाँचना चाहेंगे?",
  hinglish: "Inhe dekhne ke baad aap kaunsa point verify karna chahenge?",
};

export function proofText(assets: LinkItem[], l: string | null = "en"): string {
  return `${say(PROOF_INTRO, l)}\n\n${assets.map((x) => `${x.title}: ${x.url}`).join("\n")}\n\n${say(PROOF_CLOSE, l)}`;
}

// ---------------------------------------------------------------- Trigger C: why activate Oxxy?

export function asksWhyActivate(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\bwhy (should i |do i need to |would i |to )?(activate|buy|take|join)\b|\b(nobody|no one|noone|no-one) (is|in my family is|here is) (sick|ill|unwell)\b|\bwill i (even |really |actually )?use it\b|\bwhy (do|would) i need (it|this|oxxy)\b|\bkoi bimar nahi\b|\babhi (koi )?zarurat nahi\b|\bkyun activate\b|क्यों एक्टिवेट|कोई बीमार नहीं/u.test(
    t,
  );
}

export type WhyVariant = "elderly" | "recurring" | "major" | "no_need";

export function whyActivateVariant(
  n: { beneficiary?: string | null; healthcare_need?: string | null; need_pattern?: string | null } | null,
  age: number | null,
): WhyVariant {
  const who = (n?.beneficiary || "").toLowerCase();
  const need = (n?.healthcare_need || "").toLowerCase();
  if ((age != null && age >= 60) || /parent|mother|father|mom|dad|grand|elder|senior|\bmaa\b|papa|mummy/.test(who))
    return "elderly";
  if (/medicine|tablet|dialysis|diabet|sugar|\bbp\b|blood pressure|thyroid|regular|monthly|recurring|chronic|therapy|physio/.test(need))
    return "recurring";
  if (n?.need_pattern === "single_expense" || /surgery|operation|procedure|transplant|delivery/.test(need))
    return "major";
  return "no_need";
}

const WHY_BASE: L = {
  en:
    "Oxxy works best when it is active before the next planned healthcare expense. It can support repeated " +
    "consultations, tests, medicines and larger planned needs, so you do not have to start searching for help " +
    "after a bill has already arisen.",
  hi:
    "Oxxy सबसे अच्छा तब काम करता है जब वह अगले नियोजित स्वास्थ्य खर्च से पहले सक्रिय हो। यह बार-बार होने वाले परामर्श, जाँच, " +
    "दवाइयों और बड़ी नियोजित ज़रूरतों में मदद कर सकता है, ताकि बिल आने के बाद आपको मदद ढूँढनी न पड़े।",
  hinglish:
    "Oxxy sabse achha tab kaam karta hai jab woh agle planned healthcare kharche se pehle active ho. Yeh baar-baar ke " +
    "consultations, tests, medicines aur bade planned needs mein madad kar sakta hai, taaki bill aane ke baad aapko madad " +
    "dhoondhni na pade.",
};
const WHY_VARIANT: Record<WhyVariant, L> = {
  elderly: {
    en: "Activating in advance keeps healthcare-support access ready for routine and larger planned needs. Infinity has no age limit.",
    hi: "पहले से एक्टिवेट करने से नियमित और बड़ी नियोजित ज़रूरतों के लिए सहायता तैयार रहती है। Infinity में कोई आयु सीमा नहीं है।",
    hinglish: "Pehle se activate karne se routine aur bade planned needs ke liye support ready rehta hai. Infinity mein koi age limit nahi hai.",
  },
  recurring: {
    en: "Repeated healthcare expenses can make an active plan more useful across the year.",
    hi: "बार-बार होने वाले स्वास्थ्य खर्च पूरे साल एक सक्रिय प्लान को ज़्यादा उपयोगी बना सकते हैं।",
    hinglish: "Baar-baar ke healthcare kharche poore saal ek active plan ko zyada useful bana sakte hain.",
  },
  major: {
    en: "Activation and provider coordination need time, so begin before appointment, treatment or payment.",
    hi: "एक्टिवेशन और प्रदाता के साथ समन्वय में समय लगता है, इसलिए अपॉइंटमेंट, इलाज या भुगतान से पहले शुरू करें।",
    hinglish: "Activation aur provider coordination mein time lagta hai, isliye appointment, treatment ya payment se pehle shuru karein.",
  },
  no_need: {
    en: "This is a good time to understand and activate support before a planned service is booked or paid.",
    hi: "किसी नियोजित सेवा की बुकिंग या भुगतान से पहले सहायता को समझने और एक्टिवेट करने का यह अच्छा समय है।",
    hinglish: "Kisi planned service ki booking ya payment se pehle support samajhne aur activate karne ka yeh achha time hai.",
  },
};
const WHY_QUESTION: L = {
  en: "Which type of expense occurs most often in your family?",
  hi: "आपके परिवार में किस तरह का खर्च सबसे ज़्यादा होता है?",
  hinglish: "Aapke family mein kis type ka kharcha sabse zyada hota hai?",
};

/** Trigger layer 5 + 5.1: no fear, no urgency, one question */
export function whyActivateText(variant: WhyVariant, extra: LinkItem | null = null, l: string | null = "en"): string {
  return (
    `${say(WHY_BASE, l)} ${say(WHY_VARIANT[variant], l)}` +
    (extra ? `\n\n${extra.title}: ${extra.url}` : "") +
    `\n\n${say(WHY_QUESTION, l)}`
  );
}

// ---------------------------------------------------------------- Trigger E: four-plan comparison

/** Only an explicit ask to compare or see the plans (Trigger layer 7): never the catalogue by default */
export function asksComparePlans(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\b(compare|comparison|difference between)\b[^.?!]{0,40}\bplans?\b|\bplans?\b[^.?!]{0,40}\b(compare|comparison)\b|\b(all|your|the four|4) plans\b|\b(which|what) plans\b|\bplans? (and|with|&) (their )?(prices?|costs?)\b|\b(price|plan) list\b|\bkitne plans?\b|\bsaare plans?\b|\bsab plans?\b|कितने प्लान|सारे प्लान|सभी प्लान/u.test(
    t,
  );
}

// Trigger layer 7 "Recommended for"
export const PLAN_FOR_T: Record<string, L> = {
  everyday: {
    en: "Routine OPD and lower exposure",
    hi: "नियमित OPD और कम खर्च",
    hinglish: "Routine OPD aur kam kharcha",
  },
  vital: {
    en: "Broader OPD and IPD needs",
    hi: "ज़्यादा OPD और IPD ज़रूरतें",
    hinglish: "Broader OPD aur IPD needs",
  },
  thrive: {
    en: "Pre-existing conditions and larger expected expense",
    hi: "पहले से मौजूद बीमारियाँ और बड़ा अपेक्षित खर्च",
    hinglish: "Pre-existing conditions aur bada expected kharcha",
  },
  infinity: {
    en: "Broadest support, elderly, major or recurring needs; no upper eligible bill limit",
    hi: "सबसे व्यापक सहायता, बुज़ुर्ग, बड़ी या बार-बार की ज़रूरतें; योग्य बिल की कोई ऊपरी सीमा नहीं",
    hinglish: "Sabse broad support, elderly, major ya recurring needs; eligible bill ki koi upper limit nahi",
  },
};
export const PLAN_FOR: Record<string, string> = Object.fromEntries(
  Object.entries(PLAN_FOR_T).map(([k, v]) => [k, v.en]),
);

export interface ComparisonRow {
  plan: string;
  monthly: number | null;
  yearly: number | null;
  age_limit: number | null;
}

const CMP: Record<"head" | "monthly" | "yearly" | "upTo" | "noAge" | "mark" | "ask", L> = {
  head: {
    en: "Here are the four Oxxy plans (prices plus applicable GST):",
    hi: "ये रहे Oxxy के चार प्लान (कीमत + लागू GST):",
    hinglish: "Yeh rahe Oxxy ke chaar plans (prices plus applicable GST):",
  },
  monthly: { en: "monthly", hi: "मासिक", hinglish: "monthly" },
  yearly: { en: "yearly", hi: "वार्षिक", hinglish: "yearly" },
  upTo: { en: "up to age", hi: "उम्र", hinglish: "age" },
  noAge: { en: "no age limit", hi: "कोई आयु सीमा नहीं", hinglish: "koi age limit nahi" },
  mark: { en: "recommended for you", hi: "आपके लिए सुझाया गया", hinglish: "aapke liye recommended" },
  ask: {
    en: "Which plan would you like to know more about?",
    hi: "आप किस प्लान के बारे में और जानना चाहेंगे?",
    hinglish: "Aap kis plan ke baare mein aur jaanna chahenge?",
  },
};

/**
 * The compact four-plan comparison with ONE plan marked, or one discovery question when there is not
 * enough to recommend yet. No links: the link goes only after the disclosure and a YES.
 */
export function planComparisonText(
  rows: ComparisonRow[],
  recommended: { plan: string; reason: string } | null,
  askFirst: string | null,
  l: string | null = "en",
): string {
  const g = lang(l);
  const list = rows
    .map((r, i) => {
      const price = [
        r.monthly ? `${inr(r.monthly)} ${say(CMP.monthly, l)}` : null,
        r.yearly ? `${inr(r.yearly)} ${say(CMP.yearly, l)}` : null,
      ]
        .filter(Boolean)
        .join(" / ");
      const age = r.age_limit
        ? g === "en"
          ? `up to age ${r.age_limit}`
          : g === "hi"
            ? `${r.age_limit} वर्ष तक`
            : `${r.age_limit} saal tak`
        : say(CMP.noAge, l);
      const mark = recommended?.plan === r.plan ? ` (${say(CMP.mark, l)})` : "";
      const forWhom = PLAN_FOR_T[r.plan] ? say(PLAN_FOR_T[r.plan], l) : "";
      return `${i + 1}. ${title(r.plan)}${mark}: ${price}, ${age}. ${forWhom}`.trim();
    })
    .join("\n");
  const p = recommended ? title(recommended.plan) : "";
  const tail = recommended
    ? g === "hi"
      ? `मैं ${p} की सलाह देता हूँ क्योंकि ${recommended.reason}। क्या आप आधिकारिक जानकारी चाहेंगे या सुरक्षित एक्टिवेशन लिंक?`
      : g === "hinglish"
        ? `Main ${p} recommend karta hoon kyunki ${recommended.reason}. Kya aap official details chahenge ya secure activation link?`
        : `I recommend ${p} because ${recommended.reason}. Would you like the official details or the secure activation link?`
    : (askFirst ?? say(CMP.ask, l));
  return `${say(CMP.head, l)}\n${list}\n\n${tail}`;
}

// ---------------------------------------------------------------- Trigger F: savings illustration

/** Trigger layer 8 F / Playbook 9: an illustration only, with the variability statement */
export function illustrationText(ratePct: number, amount: number, saving: number, l: string | null = "en"): string {
  switch (lang(l)) {
    case "hi":
      return (
        `एक आसान उदाहरण के लिए, ${inr(amount)} का लगभग ${ratePct}% ${inr(saving)} होता है। असली बचत सेवा, प्रदाता और जगह ` +
        "पर निर्भर करती है और उसकी पुष्टि की जाएगी। क्या मैं आपके लिए सबसे उपयुक्त प्लान देखूँ या बुकिंग अनुरोध लूँ?"
      );
    case "hinglish":
      return (
        `Ek easy illustration ke liye, ${inr(amount)} ka lagbhag ${ratePct}% ${inr(saving)} hota hai. Actual bachat service, ` +
        "provider aur location par depend karti hai aur confirm ki jayegi. Kya main aapke liye sabse suitable plan check karun ya booking request lun?"
      );
    default:
      return (
        `For an easy illustration, approximately ${ratePct}% of ${inr(amount)} is ${inr(saving)}. ` +
        "Actual savings depend on the service, provider and location and will be confirmed. " +
        "Would you like me to check the most suitable plan or take a booking request?"
      );
  }
}

/** "I recommend the Vital plan because ..." without any savings claim (no yearly spend known) */
export function needRecommendationText(plan: string, reason: string, l: string | null = "en"): string {
  switch (lang(l)) {
    case "hi":
      return `आपकी बताई जानकारी के अनुसार मैं ${title(plan)} प्लान की सलाह देता हूँ क्योंकि ${reason}।`;
    case "hinglish":
      return `Aapki batayi jaankari ke hisaab se main ${title(plan)} plan recommend karta hoon kyunki ${reason}.`;
    default:
      return `Based on what you shared, I recommend the ${title(plan)} plan because ${reason}.`;
  }
}
