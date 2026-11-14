// Existing-customer help (Playbook 3: SERVICE_OR_ESCALATION, "run lookup_customer; answer the servicing
// question or create an escalation") and the one-product block for a customer who already has an active
// product (Playbook 3.1, 6.2; acceptance test "Active Oxxy customer asks for Cut Medi Bills").
// English is the wording we propose [CONFIRM]; Hindi / Hinglish are drafts.
import { L, lang, say } from "./Lang";

export interface ServiceSnapshot {
  product: string | null; // active product
  plan: string | null;
  bookings: { centre: string; date: string }[]; // open booking requests
  linkPending: boolean; // an activation link sent and not paid yet
  openCase: boolean; // a task still open for this customer
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function productLabel(product: string | null, plan: string | null): string {
  if (product === "cut_medi_bills") return "Cut Medi Bills";
  return plan ? `Oxxy ${title(plan)} plan` : "Oxxy plan";
}

const T = {
  intro: { en: "Here is what I can see on this number:", hi: "इस नंबर पर मुझे यह दिख रहा है:", hinglish: "Is number par mujhe yeh dikh raha hai:" } as L,
  active: {
    en: "Your {p} is active.",
    hi: "आपका {p} एक्टिव है।",
    hinglish: "Aapka {p} active hai.",
  } as L,
  booking: {
    en: "Booking request at {c} for {d}: pending confirmation.",
    hi: "{c} पर {d} की बुकिंग रिक्वेस्ट: कन्फ़र्मेशन बाकी है।",
    hinglish: "{c} par {d} ki booking request: confirmation pending hai.",
  } as L,
  link: {
    en: "An activation link was sent and the payment is not recorded yet.",
    hi: "एक्टिवेशन लिंक भेजा गया था और भुगतान अभी दर्ज नहीं हुआ है।",
    hinglish: "Activation link bheja gaya tha aur payment abhi record nahi hua hai.",
  } as L,
  openCase: {
    en: "Our team is already working on an earlier request from you.",
    hi: "हमारी टीम आपकी एक पिछली रिक्वेस्ट पर पहले से काम कर रही है।",
    hinglish: "Hamari team aapki ek pichhli request par pehle se kaam kar rahi hai.",
  } as L,
  none: {
    en: "I could not find an active plan or an open request on this number.",
    hi: "मुझे इस नंबर पर कोई एक्टिव प्लान या खुली रिक्वेस्ट नहीं मिली।",
    hinglish: "Mujhe is number par koi active plan ya open request nahi mili.",
  } as L,
  ask: {
    en: "What do you need help with?",
    hi: "आपको किस चीज़ में मदद चाहिए?",
    hinglish: "Aapko kis cheez mein madad chahiye?",
  } as L,
};

/** The lookup result in plain words, then one question */
export function serviceSummaryText(x: ServiceSnapshot, l?: string | null): string {
  const lines: string[] = [];
  if (x.product) lines.push(say(T.active, l).replace("{p}", productLabel(x.product, x.plan)));
  for (const b of x.bookings.slice(0, 3)) lines.push(say(T.booking, l).replace("{c}", b.centre).replace("{d}", b.date));
  if (x.linkPending) lines.push(say(T.link, l));
  if (x.openCase) lines.push(say(T.openCase, l));
  const body = lines.length ? `${say(T.intro, l)}\n${lines.map((x) => `- ${x}`).join("\n")}` : say(T.none, l);
  return `${body}\n\n${say(T.ask, l)}`;
}

// Playbook 16.4: escalate instead of guessing (the callback options are added by the pipeline)
export const SERVICE_ESCALATE: L = {
  en: "I want to give you a precise answer rather than guess. I will arrange an authorised callback.",
  hi: "मैं अंदाज़ा लगाने के बजाय आपको सटीक जवाब देना चाहता हूँ। मैं एक अधिकृत कॉलबैक की व्यवस्था करूँगा।",
  hinglish: "Main guess karne ke bajaye aapko sahi jawab dena chahta hoon. Main ek authorised callback arrange karunga.",
};

/** Playbook 3.1 / 6.2: an active product blocks the other one; the team gets a servicing task */
export function activeProductBlock(product: string | null, plan: string | null, l?: string | null): string {
  const p = productLabel(product, plan);
  const t: L = {
    en: `You already have an active ${p}. One customer can activate only one product, so I cannot start another activation. I have asked our team to help you with this.`,
    hi: `आपका ${p} पहले से एक्टिव है। एक ग्राहक केवल एक प्रोडक्ट एक्टिवेट कर सकता है, इसलिए मैं दूसरा एक्टिवेशन शुरू नहीं कर सकता। मैंने हमारी टीम से इसमें आपकी मदद करने को कहा है।`,
    hinglish: `Aapka ${p} pehle se active hai. Ek customer sirf ek product activate kar sakta hai, isliye main doosra activation shuru nahi kar sakta. Maine hamari team se is mein aapki madad karne ko kaha hai.`,
  };
  return t[lang(l)];
}
