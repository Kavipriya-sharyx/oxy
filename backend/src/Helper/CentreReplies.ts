// Centre suggestions (Playbook 10.1, Trigger layer 6 card and footer). English approved, Hindi / Hinglish drafts.
import { L, say } from "./Lang";

export interface CentreCard {
  name: string;
  branch?: string | null;
  locality?: string | null;
  city?: string | null;
  centre_type?: string | null;
}

const HEAD: L = {
  en: "Based on the patient's area and the specialisation you need, here are suitable options:",
  hi: "मरीज़ के इलाके और ज़रूरी स्पेशलाइज़ेशन के आधार पर, ये उपयुक्त विकल्प हैं:",
  hinglish: "Patient ke area aur zaroori specialisation ke hisaab se, yeh suitable options hain:",
};
const HEAD_AREA: L = {
  en: "Based on the patient's area, here are suitable options:",
  hi: "मरीज़ के इलाके के आधार पर, ये उपयुक्त विकल्प हैं:",
  hinglish: "Patient ke area ke hisaab se, yeh suitable options hain:",
};
const FEWER: L = {
  en: "I found only {n} verified option(s) in that area.",
  hi: "मुझे उस इलाके में केवल {n} सत्यापित विकल्प मिले।",
  hinglish: "Mujhe us area mein sirf {n} verified option mile.",
};
const FOOT: L = {
  en: "I have included specialist and multispeciality choices where relevant. Reply with 1-5, or send the name of another centre you prefer.",
  hi: "जहाँ ज़रूरी था, मैंने स्पेशलिस्ट और मल्टीस्पेशलिटी दोनों विकल्प दिए हैं। 1-5 में से कोई नंबर लिखें, या अपनी पसंद के किसी दूसरे सेंटर का नाम भेजें।",
  hinglish:
    "Jahan zaroori tha, maine specialist aur multispeciality dono options diye hain. 1-5 mein se number likhein, ya apni pasand ke kisi doosre centre ka naam bhejein.",
};
const KIND: Record<"multi" | "specialist", L> = {
  multi: { en: "Multispeciality", hi: "मल्टीस्पेशलिटी", hinglish: "Multispeciality" },
  specialist: { en: "Specialist", hi: "स्पेशलिस्ट", hinglish: "Specialist" },
};
const RELEVANT: L = { en: "Relevant for {s}", hi: "{s} के लिए उपयुक्त", hinglish: "{s} ke liye relevant" };

export const RADIUS_Q: L = {
  en: "How far can the patient travel for this? For example 5 km, 10 km or 20 km.",
  hi: "मरीज़ इसके लिए कितनी दूर तक जा सकते हैं? जैसे 5 km, 10 km या 20 km।",
  hinglish: "Patient iske liye kitni door tak ja sakte hain? Jaise 5 km, 10 km ya 20 km.",
};

/** "10 km", "5", "nearby" (5), "anywhere in the city" (25). null = not an answer. */
export function parseRadius(text: string): number | null {
  const t = (text || "").toLowerCase().trim();
  const n = t.match(/(\d{1,3})\s*(km|kms|kilomet\w*|k\.m\.?)?\b/);
  if (n) {
    const v = Number(n[1]);
    return v >= 1 && v <= 200 ? v : null;
  }
  if (/\b(near|nearby|close|paas|nazdeek)\b|पास|नज़दीक/u.test(t)) return 5;
  if (/\b(any|anywhere|doesn'?t matter|does not matter|no limit|whole city|koi bhi|kahin bhi)\b|कहीं भी|कोई भी/u.test(t))
    return 25;
  return null;
}

/** Playbook 10.1 presentation: name, locality, type and relevance; never a tie-up or discount claim */
export function centreListText(list: CentreCard[], specialisation: string | null, l?: string | null): string {
  const cards = list.map((c, i) => {
    const kind = say(c.centre_type === "multispeciality" ? KIND.multi : KIND.specialist, l);
    const parts = [`${i + 1}. ${c.name}${c.branch ? `, ${c.branch}` : ""} - ${c.locality || c.city || ""}`, kind];
    if (specialisation) parts.push(say(RELEVANT, l).replace("{s}", specialisation));
    return parts.join(" | ");
  });
  const head = say(specialisation ? HEAD : HEAD_AREA, l);
  const fewer = list.length < 5 ? `\n${say(FEWER, l).replace("{n}", String(list.length))}` : "";
  return `${head}\n${cards.join("\n")}${fewer}\n\n${say(FOOT, l)}`;
}

// After the customer says no to another centre (CRM booking.cancelled). English approved style; hi /
// Hinglish drafts [CONFIRM].
export const REBOOK_DECLINED_T = {
  en: "No problem. If you need another booking request later, just message me here.",
  hi: "कोई बात नहीं। अगर बाद में आपको नया बुकिंग अनुरोध चाहिए, तो बस यहाँ मैसेज करें।",
  hinglish: "Koi baat nahi. Agar baad mein aapko naya booking request chahiye, to bas yahan message karein.",
};
