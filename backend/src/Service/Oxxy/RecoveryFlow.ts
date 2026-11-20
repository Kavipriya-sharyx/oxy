// Objections, agreed follow-ups and conversation rescue (Trigger layer 9 M / N, 10, 12; Playbook 14, 15).
// Pure rules and fixed texts; the chat pipeline stores the state and schedules the follow-ups.
import { parseCustomerDate, showDate } from "./BookingFlow";
import { isQuietHours, proactiveHours, hour12, hhmm } from "./WhatsappRules";
import { L, lang, say } from "@Helper/Lang";

export type Objection =
  | "price"
  | "think"
  | "family"
  | "busy"
  | "not_interested"
  | "no_provider"
  | "benefit";

/** One objection per message, the most specific first (Playbook 14, Trigger layer 9 M) */
export function detectObjection(text: string): Objection | null {
  const t = (text || "").toLowerCase().replace(/[’']/g, "'");
  if (
    /\bnot interested\b|\bno interest\b|\bdon't want (it|this|any)\b|\binterested nahi\b|\bnahi chahiye\b/.test(
      t,
    )
  )
    return "not_interested";
  if (
    // "discuss this with my family", "consult my husband first", "ghar pe baat karke", "family kitta
    // pesitu solren" (client, 17 Nov: "I said I will discuss with my family, it moved on")
    /\b(ask|discuss|check|talk|speak|consult|confirm|decide)\b[^.?!]{0,25}\b(family|husband|wife|son|daughter|parents|father|mother|spouse|brother|sister|kids|children|amma|appa|papa|mummy)\b|\b(family|husband|wife|ghar|gharwal[oe]n?|parents|amma|appa)\b[^.?!]{0,25}\b(pooch|baat|kitta|kita|kitte|kooda|kuda|pesi|pesa|pesanum|ketu|kettu|keka|kekkanum|se puch)/.test(
      t,
    )
  )
    return "family";
  if (
    /\b(need|have|want|let me|i will|i'll|will|need some) (to )?(think|time)\b|\bthink (about it|it over|and (tell|let you know|come back))\b|\bsoch(na|ke|kar|unga|ungi)\b|\byosi(chu|kkanum|chitu|kanum)\b|\b(later|baad mein) (decide|bataunga|batati|solren|solran|sollren)\b/.test(
      t,
    )
  )
    return "think";
  if (
    /\b(too |very |bit |so )?(expensive|costly|pricey)\b|\bcan't afford\b|\bcannot afford\b|\bmehe?nga\b|\bout of (my )?budget\b|\bprice is (too )?high\b/.test(
      t,
    )
  )
    return "price";
  if (
    /\bno (hospital|provider|centre|center|clinic)s? (near|in|around)\b|\bnothing (near|in) my (area|city)\b/.test(
      t,
    )
  )
    return "no_provider";
  if (
    /\b(i am|i'm|im) busy\b|\bbusy (right )?now\b|\b(call|message|text|talk|follow up|follow-up) (me |with me )?later\b|\bnot a good time\b|\babhi busy\b|\bbaad mein baat\b|^not now\.?$/.test(
      t,
    )
  )
    return "busy";
  // the benefit is doubted (client, 17 Nov: "identify objections such as price, trust or benefits")
  if (
    /\b(what is the (use|benefit|point)|what's the (use|benefit|point)|no use|not useful|of no use|useless|why (do|should|would) (i|we) need (it|this|oxxy)|why should i (buy|take|pay)|i don'?t (see|get) the (benefit|point|value)|we are (all )?healthy|no one is sick|won'?t use it|will not use it|rarely (go|visit|fall sick)|kya fayda|kya faida|enna payan|enna use)\b/.test(
      t,
    )
  )
    return "benefit";
  return null;
}

// ---------------------------------------------------------------- follow-up times (Trigger N)

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** YYYY-MM-DD + hour/minute in IST -> Date */
export function istDate(ymd: string, hour: number, minute = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS);
}

function istYmd(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Two concrete choices, both inside 09:00-21:00 IST: tomorrow 11 am and tomorrow 5 pm */
export function followUpOptions(now: Date = new Date()): [Date, Date] {
  const tomorrow = istYmd(new Date(now.getTime() + 24 * 3600 * 1000));
  return [istDate(tomorrow, 11), istDate(tomorrow, 17)];
}

/** "15 Nov at 11 am" */
export function showWhen(d: Date, l: string | null = "en"): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const h = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}${min ? ":" + String(min).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`;
  const day = showDate(istYmd(d)).replace(/ \d{4}$/, "");
  return lang(l) === "en" ? `${day} at ${time}` : `${day}, ${time}`;
}

/** The time of day in a reply: 5 pm, 17:30, 5 baje, morning / evening, shaam */
function parseTimeOfDay(t: string): { h: number; m: number } | null {
  let x = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (x) {
    let h = Number(x[1]) % 12;
    if (x[3] === "pm") h += 12;
    return { h, m: Number(x[2] || 0) };
  }
  x = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (x) return { h: Number(x[1]), m: Number(x[2]) };
  x = t.match(/\b(\d{1,2})\s*baje\b/);
  if (x) {
    const n = Number(x[1]);
    const evening = /\b(shaam|sham|raat)\b/.test(t);
    return { h: evening && n < 12 ? n + 12 : n, m: 0 };
  }
  if (/\b(morning|subah)\b/.test(t)) return { h: 10, m: 0 };
  if (/\b(afternoon|dopahar)\b/.test(t)) return { h: 14, m: 0 };
  if (/\b(evening|shaam|sham)\b/.test(t)) return { h: 18, m: 0 };
  return null;
}

/**
 * The follow-up time the customer chose: "1" / "2" / "first" / "second", or a day and/or time
 * ("tomorrow 5 pm", "20 Nov morning", "6 pm"). A time alone = today if still ahead, else tomorrow.
 * A day alone = 11 am. Returns null when there is no time in the reply.
 */
export function parseFollowUpTime(
  text: string,
  options: [Date, Date],
  now: Date = new Date(),
): Date | null {
  const t = (text || "").toLowerCase().trim();
  if (/^(1|option 1|first|the first one|1st)\.?$/.test(t)) return options[0];
  if (/^(2|option 2|second|the second one|2nd)\.?$/.test(t)) return options[1];
  const tod = parseTimeOfDay(t);
  const day = parseCustomerDate(t, now);
  if (!tod && !day) return null;
  const { h, m } = tod ?? { h: 11, m: 0 };
  if (day) return istDate(day, h, m);
  const today = istYmd(now);
  const at = istDate(today, h, m);
  return at.getTime() > now.getTime() + 60_000
    ? at
    : istDate(istYmd(new Date(now.getTime() + 86400000)), h, m);
}

/** Same rules as the create_follow_up API: future, within 90 days, 09:00-21:00 IST */
export function followUpProblem(when: Date, now: Date = new Date()): string | null {
  if (when.getTime() < now.getTime() + 60_000) return "past";
  if (when.getTime() > now.getTime() + 90 * 86400000) return "too_far";
  if (isQuietHours(when)) return "quiet_hours";
  return null;
}

const both = (o: [Date, Date], l: string | null) => [showWhen(o[0], l), showWhen(o[1], l)];

export function followUpQuestion(options: [Date, Date], l: string | null = "en"): string {
  const [a, b] = both(options, l);
  return say(
    {
      en: `Would ${a} or ${b} be better for a quick follow-up? You can also tell me another day and time.`,
      hi: `एक छोटे फ़ॉलो-अप के लिए ${a} या ${b} में से कौन-सा समय बेहतर रहेगा? आप कोई दूसरा दिन और समय भी बता सकते हैं।`,
      hinglish: `Ek quick follow-up ke liye ${a} ya ${b} mein se kaunsa time better rahega? Aap koi aur din aur time bhi bata sakte hain.`,
    },
    l,
  );
}

export function followUpProblemText(
  problem: string,
  options: [Date, Date],
  l: string | null = "en",
): string {
  const [a, b] = both(options, l);
  const ask = say(
    {
      en: `Would ${a} or ${b} be better?`,
      hi: `क्या ${a} या ${b} ठीक रहेगा?`,
      hinglish: `Kya ${a} ya ${b} theek rahega?`,
    },
    l,
  );
  const why: L =
    problem === "quiet_hours"
      ? {
          en: `I can message only between ${hour12(proactiveHours().from)} and ${hour12(proactiveHours().until)}.`,
          hi: `मैं केवल ${hhmm(proactiveHours().from)} से ${hhmm(proactiveHours().until)} बजे के बीच संदेश भेज सकता हूँ।`,
          hinglish: `Main sirf ${hhmm(proactiveHours().from)} se ${hhmm(proactiveHours().until)} baje ke beech message bhej sakta hoon.`,
        }
      : problem === "too_far"
        ? {
            en: "I can schedule a follow-up up to 90 days ahead.",
            hi: "मैं 90 दिन आगे तक का फ़ॉलो-अप तय कर सकता हूँ।",
            hinglish: "Main 90 din aage tak ka follow-up schedule kar sakta hoon.",
          }
        : {
            en: "That time has already passed.",
            hi: "वह समय निकल चुका है।",
            hinglish: "Woh time nikal chuka hai.",
          };
  return `${say(why, l)} ${ask}`;
}

export function followUpSavedText(when: Date, l: string | null = "en"): string {
  const w = showWhen(when, l);
  return say(
    {
      en: `Thank you. I will follow up on ${w}. If you need anything before that, just message here.`,
      hi: `धन्यवाद। मैं ${w} को फ़ॉलो-अप करूँगा। उससे पहले कुछ चाहिए तो यहीं संदेश भेजें।`,
      hinglish: `Dhanyavaad. Main ${w} ko follow up karunga. Usse pehle kuch chahiye to yahin message karein.`,
    },
    l,
  );
}

export const FOLLOW_UP_NOT_WANTED_T: L = {
  en: "No problem. You can message Oxxy whenever it is convenient for you.",
  hi: "कोई बात नहीं। जब भी आपको सुविधा हो, आप Oxxy को संदेश भेज सकते हैं।",
  hinglish: "Koi baat nahi. Jab bhi aapko convenient ho, aap Oxxy ko message kar sakte hain.",
};
export const FOLLOW_UP_NOT_WANTED = FOLLOW_UP_NOT_WANTED_T.en;

// ---------------------------------------------------------------- summary and replies (Playbook 14)

export interface SummaryFacts {
  need?: string | null; // only when health consent is granted
  product?: string | null; // "oxxy" | "cut_medi_bills"
  plan?: string | null;
  reason?: string | null;
  booking?: boolean;
  // the details (client, 17 Nov: "it does not give a summary of the details at the end"); each line only when known
  beneficiary?: string | null;
  area?: string | null; // "Peelamedu, Coimbatore"
  price?: string | null; // "₹999 monthly or ₹10,000 yearly"
  bookingDetail?: {
    centre: string;
    date?: string | null;
    time?: string | null;
    confirmed?: boolean;
  } | null;
  linkSent?: boolean;
  callback?: string | null; // "Today, 4-6 pm (CB-1A1B5949)"
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The 3-line personalised summary (Trigger layer 9 M "need to think", N "As agreed ...") */
export function summaryLines(f: SummaryFacts, l: string | null = "en"): string {
  const plan = f.plan ? title(f.plan) : "";
  const need: L = f.need
    ? {
        en: `Your need: ${f.need}.`,
        hi: `आपकी ज़रूरत: ${f.need}।`,
        hinglish: `Aapki zaroorat: ${f.need}.`,
      }
    : {
        en: "Your need: support with your healthcare expenses.",
        hi: "आपकी ज़रूरत: स्वास्थ्य खर्चों में मदद।",
        hinglish: "Aapki zaroorat: healthcare kharchon mein madad.",
      };
  const pick: L =
    f.product === "cut_medi_bills"
      ? {
          en: "Suggested: Cut Medi Bills, for one specific upcoming expense.",
          hi: "सुझाव: Cut Medi Bills, एक खास आने वाले खर्च के लिए।",
          hinglish: "Suggestion: Cut Medi Bills, ek specific upcoming kharche ke liye.",
        }
      : f.plan
        ? {
            en: `Suggested: the Oxxy ${plan} plan${f.reason ? `, because ${f.reason}` : ""}.`,
            hi: `सुझाव: Oxxy ${plan} प्लान${f.reason ? `, क्योंकि ${f.reason}` : ""}।`,
            hinglish: `Suggestion: Oxxy ${plan} plan${f.reason ? `, kyunki ${f.reason}` : ""}.`,
          }
        : {
            en: "Suggested: an Oxxy plan that fits your age and needs.",
            hi: "सुझाव: आपकी उम्र और ज़रूरत के अनुसार एक Oxxy प्लान।",
            hinglish: "Suggestion: aapki age aur zaroorat ke hisaab se ek Oxxy plan.",
          };
  const next: L =
    f.linkSent && !f.booking
      ? {
          en: "Next step: complete the payment on the official page when you are ready; message here if anything is unclear.",
          hi: "अगला कदम: जब आप तैयार हों, आधिकारिक पेज पर भुगतान पूरा करें; कुछ भी साफ़ न हो तो यहाँ मैसेज करें।",
          hinglish:
            "Next step: jab aap ready hon, official page par payment complete karein; kuch clear na ho to yahan message karein.",
        }
      : f.callback && !f.booking
        ? {
            en: "Next step: our team will call you at the time above.",
            hi: "अगला कदम: हमारी टीम ऊपर दिए समय पर आपको कॉल करेगी।",
            hinglish: "Next step: hamari team upar diye time par aapko call karegi.",
          }
        : f.booking
          ? {
              en: "Next step: your booking request is recorded; the Oxxy team will contact you about confirmation.",
              hi: "अगला कदम: आपका बुकिंग अनुरोध दर्ज है; पुष्टि के लिए Oxxy टीम आपसे संपर्क करेगी।",
              hinglish:
                "Next step: aapka booking request recorded hai; confirmation ke liye Oxxy team aapse contact karegi.",
            }
          : {
              en: "Next step: choose a centre, take a booking request, or review the plan details before any payment.",
              hi: "अगला कदम: कोई केंद्र चुनें, बुकिंग अनुरोध दें, या किसी भी भुगतान से पहले प्लान की जानकारी देखें।",
              hinglish:
                "Next step: koi centre chunein, booking request dein, ya kisi bhi payment se pehle plan details dekhein.",
            };
  const lines: string[] = [say(need, l)];
  if (f.beneficiary || f.area)
    lines.push(
      say(
        {
          en: [f.beneficiary ? `For: ${f.beneficiary}.` : "", f.area ? `Area: ${f.area}.` : ""]
            .filter(Boolean)
            .join(" "),
          hi: [
            f.beneficiary ? `किसके लिए: ${f.beneficiary}।` : "",
            f.area ? `इलाका: ${f.area}।` : "",
          ]
            .filter(Boolean)
            .join(" "),
          hinglish: [
            f.beneficiary ? `Kiske liye: ${f.beneficiary}.` : "",
            f.area ? `Area: ${f.area}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        },
        l,
      ),
    );
  lines.push(
    say(pick, l) +
      (f.price
        ? say(
            {
              en: ` Price: ${f.price}.`,
              hi: ` कीमत: ${f.price}।`,
              hinglish: ` Price: ${f.price}.`,
            },
            l,
          )
        : ""),
  );
  const b = f.bookingDetail;
  if (b) {
    const when = [b.date ? showDate(b.date) : "", b.time ?? ""].filter(Boolean).join(", ");
    const at = `${b.centre}${when ? `, ${when}` : ""}`;
    lines.push(
      say(
        b.confirmed
          ? {
              en: `Booking: ${at} (confirmed).`,
              hi: `बुकिंग: ${at} (पुष्टि हो गई)।`,
              hinglish: `Booking: ${at} (confirmed).`,
            }
          : {
              en: `Booking request: ${at} (waiting for confirmation).`,
              hi: `बुकिंग अनुरोध: ${at} (पुष्टि बाकी)।`,
              hinglish: `Booking request: ${at} (confirmation pending).`,
            },
        l,
      ),
    );
  }
  if (f.linkSent)
    lines.push(
      say(
        {
          en: "Activation: the official link was sent; the plan starts once the payment on that page is complete.",
          hi: "एक्टिवेशन: आधिकारिक लिंक भेजा गया है; उस पेज पर भुगतान पूरा होने पर प्लान शुरू होगा।",
          hinglish:
            "Activation: official link bhej diya gaya hai; us page par payment complete hone par plan start hoga.",
        },
        l,
      ),
    );
  if (f.callback)
    lines.push(
      say(
        {
          en: `Callback: ${f.callback}.`,
          hi: `कॉलबैक: ${f.callback}।`,
          hinglish: `Callback: ${f.callback}.`,
        },
        l,
      ),
    );
  lines.push(say(next, l));
  return lines.join("\n");
}

/** Playbook 14 "Too expensive": value first, never a net loss as a saving */
export const PRICE_ASK_T: L = {
  en:
    "I understand. The plan should make practical sense, so let me check whether it is worth it for you. " +
    "About how much does your family spend on private healthcare in a year?",
  hi:
    "मैं समझता हूँ। प्लान व्यावहारिक रूप से सही होना चाहिए, इसलिए मैं देखता हूँ कि यह आपके लिए फ़ायदेमंद है या नहीं। " +
    "आपका परिवार साल में निजी स्वास्थ्य सेवा पर लगभग कितना खर्च करता है?",
  hinglish:
    "Main samajhta hoon. Plan practically sahi hona chahiye, isliye main check karta hoon ki yeh aapke liye worth it hai ya nahi. " +
    "Aapki family saal mein private healthcare par lagbhag kitna kharcha karti hai?",
};
export const PRICE_BUDGET_QUESTION_T: L = {
  en: "Would a monthly payment suit your budget better than a yearly one?",
  hi: "क्या वार्षिक की जगह मासिक भुगतान आपके बजट के लिए बेहतर रहेगा?",
  hinglish: "Kya yearly ki jagah monthly payment aapke budget ke liye better rahega?",
};
export const UNDERSTAND_T: L = {
  en: "I understand.",
  hi: "मैं समझता हूँ।",
  hinglish: "Main samajhta hoon.",
};

/** Playbook 14 "No provider in my area" */
export const NO_PROVIDER_ANSWER_T: L = {
  en:
    "Please share the patient's locality and travel radius. I can suggest up to five suitable private healthcare " +
    "centres and also take a request for a centre you choose.",
  hi:
    "कृपया मरीज़ का इलाका और कितनी दूर तक जा सकते हैं, यह बताइए। मैं पाँच तक उपयुक्त निजी स्वास्थ्य केंद्र सुझा सकता हूँ " +
    "और आपके चुने हुए केंद्र के लिए अनुरोध भी ले सकता हूँ।",
  hinglish:
    "Kripya patient ka area aur travel radius bataiye. Main paanch tak suitable private healthcare centres suggest kar " +
    "sakta hoon aur aapke chune hue centre ke liye request bhi le sakta hoon.",
};

/** Playbook 14 "Not interested" */
export const NOT_INTERESTED_ASK_T: L = {
  en: "No problem. Would you prefer a concise summary or should I close the enquiry?",
  hi: "कोई बात नहीं। क्या आप एक छोटा सारांश चाहेंगे, या मैं यह पूछताछ बंद कर दूँ?",
  hinglish: "Koi baat nahi. Kya aap ek short summary chahenge, ya main yeh enquiry close kar doon?",
};

/** Playbook 18 "Closed politely" */
export const CLOSED_POLITELY_T: L = {
  en:
    "No problem. I will close the enquiry here so you do not feel pressured. You may message Oxxy whenever " +
    "healthcare support is needed.",
  hi:
    "कोई बात नहीं। मैं यह पूछताछ यहीं बंद कर रहा हूँ ताकि आप पर कोई दबाव न हो। जब भी स्वास्थ्य सहायता चाहिए, " +
    "आप Oxxy को संदेश भेज सकते हैं।",
  hinglish:
    "Koi baat nahi. Main yeh enquiry yahin close kar raha hoon taaki aap par koi pressure na ho. Jab bhi healthcare " +
    "support chahiye, aap Oxxy ko message kar sakte hain.",
};
export const SUMMARY_CLOSE_T: L = {
  en: "You may message Oxxy whenever healthcare support is needed.",
  hi: "जब भी स्वास्थ्य सहायता चाहिए, आप Oxxy को संदेश भेज सकते हैं।",
  hinglish: "Jab bhi healthcare support chahiye, aap Oxxy ko message kar sakte hain.",
};
export const PRICE_ASK = PRICE_ASK_T.en;
export const PRICE_BUDGET_QUESTION = PRICE_BUDGET_QUESTION_T.en;
export const NO_PROVIDER_ANSWER = NO_PROVIDER_ANSWER_T.en;
export const NOT_INTERESTED_ASK = NOT_INTERESTED_ASK_T.en;
export const CLOSED_POLITELY = CLOSED_POLITELY_T.en;

export function objectionReply(
  kind: "think" | "family" | "busy",
  summary: string,
  options: [Date, Date],
  l: string | null = "en",
): string {
  const ask = followUpQuestion(options, l);
  const lead: L =
    kind === "family"
      ? {
          en: "Certainly. Here is a concise summary for your discussion:",
          hi: "ज़रूर। आपकी चर्चा के लिए एक छोटा सारांश:",
          hinglish: "Zaroor. Aapki discussion ke liye ek short summary:",
        }
      : kind === "busy"
        ? {
            en: "Of course. Here is a 3-line summary for when you have a moment:",
            hi: "ज़रूर। जब आपके पास समय हो, उसके लिए 3 लाइन का सारांश:",
            hinglish: "Zaroor. Jab aapke paas time ho, uske liye 3-line summary:",
          }
        : {
            en: "Of course. Here is a short summary:",
            hi: "ज़रूर। यह रहा एक छोटा सारांश:",
            hinglish: "Zaroor. Yeh rahi ek short summary:",
          };
  const easier: L = {
    en: "What would make the decision easier: benefits, price, activation process or nearby centres?",
    hi: "फ़ैसला आसान करने के लिए क्या मदद करेगा: फ़ायदे, कीमत, एक्टिवेशन की प्रक्रिया या पास के केंद्र?",
    hinglish:
      "Decision easy karne ke liye kya madad karega: benefits, price, activation process ya nearby centres?",
  };
  return kind === "think"
    ? `${say(lead, l)}\n${summary}\n\n${say(easier, l)} ${ask}`
    : `${say(lead, l)}\n${summary}\n\n${ask}`;
}

// ---------------------------------------------------------------- Trigger K: medicines

export function asksMedicine(text: string): boolean {
  const t = (text || "").toLowerCase();
  // "Which medicine should I take for my BP?" asks for medical advice, not delivery (client Q&A Q173)
  if (
    /\b(which|what) (medicine|medicines|tablet|tablets|drug|drugs)\b[^?.!]{0,30}\b(should|take|for my|for his|for her|best)\b|\bshould i take\b|\bprescribe\b/.test(
      t,
    )
  )
    return false;
  const med = /\b(medicines?|tablets?|pharmacy|dawai|dawa|chemist)\b|दवा|दवाई/u.test(t);
  const ask =
    /\?\s*$/.test(t) ||
    /\b(deliver|delivery|home|discount|saving|savings|save|cheaper|order|buy|chahiye)\b/.test(t);
  return med && ask;
}

/** Trigger layer 8 K: name only the selected product (default Oxxy) */
/** "Why do I need it?", "We are healthy": the value in two lines, then a clear next step (Trigger M) */
export const BENEFIT_T: L = {
  en: "Fair question. Oxxy helps lower eligible bills for consultations, tests, medicines and larger treatments, and it can be used again and again while the plan is active, so even a few visits a year add up and it is there when a bigger bill comes. Would you like the plan details, or should I follow up later?",
  hi: "सही सवाल है। Oxxy परामर्श, जाँच, दवाइयों और बड़े इलाज के योग्य बिल कम करने में मदद करता है, और प्लान चालू रहने तक बार-बार इस्तेमाल हो सकता है, इसलिए साल की कुछ विज़िट भी जुड़ जाती हैं और बड़े बिल पर साथ रहता है। क्या आप प्लान की जानकारी चाहेंगे, या मैं बाद में फ़ॉलो-अप करूँ?",
  hinglish:
    "Sahi sawaal hai. Oxxy consultation, tests, dawaiyan aur bade ilaaj ke eligible bills kam karne mein madad karta hai, aur plan active rehne tak baar-baar use ho sakta hai, isliye saal ki kuch visits bhi jud jaati hain aur bade bill par saath rehta hai. Kya aap plan details chahenge, ya main baad mein follow-up karun?",
};

/** Price objection after a plan was shown: the same plan, its monthly option and value, a clear next step */
export function priceKeepPlanText(
  planTitle: string,
  monthlyInline: string | null,
  l: string | null = "en",
): string {
  return say(
    {
      en: `I understand. ${monthlyInline ? `The ${planTitle} plan is also available monthly at ${monthlyInline}, so there is no big one-time payment. ` : ""}It can be used again and again for consultations, tests, medicines and larger treatments. Would you like the monthly option, or should I follow up later?`,
      hi: `मैं समझता हूँ। ${monthlyInline ? `${planTitle} प्लान मासिक भी है: ${monthlyInline}, इसलिए एक साथ बड़ा भुगतान नहीं। ` : ""}यह परामर्श, जाँच, दवाइयों और बड़े इलाज में बार-बार काम आता है। क्या आप मासिक विकल्प चाहेंगे, या मैं बाद में फ़ॉलो-अप करूँ?`,
      hinglish: `Main samajhta hoon. ${monthlyInline ? `${planTitle} plan monthly bhi hai: ${monthlyInline}, isliye ek saath bada payment nahi. ` : ""}Yeh consultation, tests, dawaiyon aur bade ilaaj mein baar-baar kaam aata hai. Kya aap monthly option chahenge, ya main baad mein follow-up karun?`,
    },
    l,
  );
}

/** Trigger K: the saving and home delivery, then the medicine names (with health consent) */
export function medicineAskText(
  product: "Oxxy" | "Cut Medi Bills",
  l: string | null = "en",
): string {
  return say(
    {
      en: `${product} may provide savings on almost all medicines, with home delivery at no additional charge, subject to service availability. Which medicines do you need? Please type the names (and the strength, if you know it).`,
      hi: `${product} लगभग सभी दवाइयों पर बचत दे सकता है, बिना अतिरिक्त शुल्क के होम डिलीवरी के साथ, सेवा उपलब्धता के अनुसार। आपको कौन सी दवाइयाँ चाहिए? कृपया उनके नाम लिखें (और पता हो तो स्ट्रेंथ भी)।`,
      hinglish: `${product} lagbhag sabhi medicines par bachat de sakta hai, bina extra charge ke home delivery ke saath, service availability ke hisaab se. Aapko kaunsi dawaiyan chahiye? Kripya unke naam likhein (aur pata ho to strength bhi).`,
    },
    l,
  );
}

/** Trigger K, the end: delivery is checked by the team before anything is confirmed */
export function medicineNotedText(
  names: string | null,
  place: string,
  l: string | null = "en",
): string {
  return say(
    {
      en: `Noted: ${names ? `${names}, ` : ""}delivery to ${place}. Our team will check home-delivery availability and the saving in your area and confirm with you here before anything is ordered. Nothing is confirmed yet.`,
      hi: `नोट किया: ${names ? `${names}, ` : ""}${place} में डिलीवरी। हमारी टीम आपके इलाके में होम डिलीवरी की उपलब्धता और बचत जाँचकर, कुछ भी ऑर्डर करने से पहले यहीं आपसे पुष्टि करेगी। अभी कुछ भी कन्फ़र्म नहीं है।`,
      hinglish: `Noted: ${names ? `${names}, ` : ""}${place} mein delivery. Hamari team aapke area mein home delivery ki availability aur bachat check karke, kuch bhi order karne se pehle yahin aapse confirm karegi. Abhi kuch bhi confirm nahi hai.`,
    },
    l,
  );
}

export function medicineText(
  product: "Oxxy" | "Cut Medi Bills",
  askRequirement: boolean,
  l: string | null = "en",
): string {
  return say(
    {
      en:
        `${product} may provide savings on almost all medicines, with home delivery at no additional charge, ` +
        "subject to service availability. " +
        (askRequirement
          ? "Please share your city and medicine requirement."
          : "Please share your city."),
      hi:
        `${product} लगभग सभी दवाइयों पर बचत दे सकता है, बिना अतिरिक्त शुल्क के होम डिलीवरी के साथ, सेवा उपलब्धता के अनुसार। ` +
        (askRequirement ? "कृपया अपना शहर और दवाइयों की ज़रूरत बताइए।" : "कृपया अपना शहर बताइए।"),
      hinglish:
        `${product} lagbhag sabhi medicines par bachat de sakta hai, bina extra charge ke home delivery ke saath, ` +
        "service availability ke hisaab se. " +
        (askRequirement
          ? "Kripya apni city aur medicine requirement bataiye."
          : "Kripya apni city bataiye."),
    },
    l,
  );
}

// ---------------------------------------------------------------- rescue (Playbook 15)

/** No reply after the bot's message: first rescue after this long, second this long after the first */
/**
 * Gap before rescue 1 / rescue 2 (Configuration page RESCUE_1_HOURS / RESCUE_2_HOURS, read live; decimals allowed,
 * 0.5 = 30 minutes). Client general rule (20 Nov): "send the messages again in 30 mins, repeat this in 6 hours
 * (blackout 9 pm to 9 am)": 0.5 h, then 6 h after the first. The blackout is the scheduler's quiet hours.
 */
export function rescueDelayMs(attempt: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = attempt === 0 ? env.RESCUE_1_HOURS : env.RESCUE_2_HOURS;
  const h = Number(raw);
  const hours = raw && Number.isFinite(h) && h >= 0.25 && h <= 168 ? h : attempt === 0 ? 0.5 : 6;
  return Math.round(hours * 3600 * 1000);
}
/** Approved Marketing / Utility templates, by attempt (Playbook 15.1) [CONFIRM] names and approval */
export const RESCUE_TEMPLATES = ["conversation_rescue_1", "conversation_rescue_2"];
export const MAX_RESCUES = 2;
