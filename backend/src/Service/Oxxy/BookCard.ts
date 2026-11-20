// Client sequences 2 and 3 (19-20 Nov 2026, hand sketches + pictures). Sequence 1 is BillCard.ts.
//
// Sequence 3, the first card of a chat and "Main Menu": "Why Overpay Your Medical Bills?" + the client's picture,
//   [Reduce My Bill] -> sequence 1 (the bill card)   [Book Appointment] -> sequence 2 (the booking card)
// Sequence 2, "Book Appointment" + the client's picture, [Book Appointment] ->
//   where are you? (a "Send location" button, or a typed area) -> nearby hospitals: Oxxy partner centres first,
//   then real places from Google Maps marked "not an Oxxy partner yet" (never called partners, never promised a
//   discount, never saved to the directory), and "Other hospital" to type a name -> booking for (myself / family)
//   -> date -> time -> "your request is processed, please activate services" [Activate] [Later] -> thank you.
// The draft lives in conversation.pending_action as `appt:<json>`. Pure texts and readers; the pipeline
// (handleAppointment) sends them. No LLM. Hindi / Hinglish are drafts for a native-speaker review.
import { InteractiveHeader, ListRow, OutboundMessage } from "@Helper/WhatsappMessage";
import { say } from "@Helper/Lang";
import { showDate } from "./BookingFlow";
import { BILL_IDS } from "./BillCard";

type Lg = string | null | undefined;
const tr = (l: Lg, en: string, hi: string, hinglish: string) => say({ en, hi, hinglish }, l);

/** Button and row ids (a tap sends the id) */
export const BOOK_IDS = {
  reduce: "home_reduce", // sequence 3 ① -> the bill card
  book: "home_book", // sequence 3 ② -> the booking card
  start: "appt_start", // the booking card's button
  other: "appt_other", // "Other hospital": type the name
  self: "appt_self",
  family: "appt_family",
  activate: "appt_activate",
  later: "appt_later",
} as const;

// ---------------------------------------------------------------- pictures

/**
 * A card picture: its own env link, else `file` next to the welcome image (the console's public folder,
 * frontend/public). WhatsApp needs a public https JPG / PNG; no link = the card without a picture.
 */
export function cardImage(envName: string, file: string): InteractiveHeader | undefined {
  const own = process.env[envName] || "";
  if (/^https:\/\//i.test(own)) return { type: "image", link: own };
  const welcome = process.env.OXXY_WELCOME_IMAGE_URL || "";
  const origin = welcome.match(/^https:\/\/[^/]+/i)?.[0];
  return origin ? { type: "image", link: `${origin}/${file}` } : undefined;
}

// ---------------------------------------------------------------- sequence 3: the first card

export const OVERPAY_CARD_TEXT = (l?: Lg): string =>
  [
    tr(
      l,
      "*Why Overpay Your Medical Bills?*",
      "*मेडिकल बिल पर ज़्यादा पैसे क्यों दें?*",
      "*Medical bills par zyada paise kyun dein?*",
    ),
    "",
    tr(
      l,
      "With Oxxy you get an instant discount on hospital, diagnostic centre and path lab bills across India. Choose how we can help you:",
      "Oxxy के साथ पूरे भारत में अस्पताल, डायग्नोस्टिक सेंटर और पैथ लैब के बिल पर तुरंत छूट पाएँ। बताइए हम कैसे मदद करें:",
      "Oxxy ke saath poore India mein hospital, diagnostic centre aur path lab bills par instant discount paayein. Bataiye hum kaise madad karein:",
    ),
  ].join("\n");

/** Sequence 3: the first card of a chat and "Main Menu" */
export function overpayCard(l?: Lg): OutboundMessage {
  return {
    kind: "buttons",
    header: cardImage("OXXY_OVERPAY_IMAGE_URL", "oxxy-overpay-card.jpg"),
    body: OVERPAY_CARD_TEXT(l),
    buttons: [
      {
        id: BOOK_IDS.reduce,
        title: tr(l, "Reduce My Bill", "मेरा बिल कम करें", "Bill kam karein"),
      },
      {
        id: BOOK_IDS.book,
        title: tr(l, "Book Appointment", "अपॉइंटमेंट बुक करें", "Appointment book"),
      },
    ],
  };
}

/** ① on the first card (the id, the template's button text, or the words) */
export const asksReduceBill = (text: string) =>
  /^(home_reduce|reduce my bill|reduce (my )?(medical )?bill|reduce your medical bill( now)?)\s*[.!]?$/i.test(
    (text || "").trim(),
  );
/** ② on the first card; the booking card's own button is appt_start */
export const asksBookCard = (text: string) => (text || "").trim().toLowerCase() === BOOK_IDS.book;
export const asksStartBooking = (text: string) =>
  /^(appt_start|book appointment|book an appointment|book a appointment)\s*[.!]?$/i.test(
    (text || "").trim(),
  );

// ---------------------------------------------------------------- sequence 2: the booking card

export const BOOK_CARD_TEXT = (l?: Lg): string =>
  [
    tr(l, "*Book Appointment*", "*अपॉइंटमेंट बुक करें*", "*Appointment Book Karein*"),
    "",
    tr(
      l,
      "Book your visit to a hospital or diagnostic centre near you, and get a medical discount on your bill with Oxxy.",
      "अपने पास के अस्पताल या डायग्नोस्टिक सेंटर में विज़िट बुक करें और Oxxy के साथ अपने बिल पर मेडिकल छूट पाएँ।",
      "Apne paas ke hospital ya diagnostic centre mein visit book karein aur Oxxy ke saath apne bill par medical discount paayein.",
    ),
  ].join("\n");

export function bookCard(l?: Lg): OutboundMessage {
  return {
    kind: "buttons",
    header: cardImage("OXXY_BOOK_IMAGE_URL", "oxxy-book-card.jpg"),
    body: BOOK_CARD_TEXT(l),
    buttons: [
      {
        id: BOOK_IDS.start,
        title: tr(l, "Book Appointment", "अपॉइंटमेंट बुक करें", "Appointment book"),
      },
    ],
  };
}

// ---------------------------------------------------------------- the draft

export type ApptStep = "where" | "pick" | "name" | "for" | "date" | "time";

/** One hospital shown in the list: a partner centre (c = its id) or a place from Google Maps (no c) */
export interface ApptOption {
  n: string; // name
  a?: string | null; // address / branch
  c?: string | null; // verified centre id
}

export interface ApptDraft {
  step: ApptStep;
  o?: ApptOption[]; // the list shown (row appt_opt_<i>)
  p?: string | null; // the place the customer gave (typed area, or the pin's area)
  c?: string | null; // chosen verified centre id
  cn?: string | null; // chosen hospital name
  u?: boolean; // not an Oxxy partner (Google place or typed name): the team checks it
  l?: string | null; // its address / area
  f?: "self" | "family" | null; // booking for
  d?: string | null; // date YYYY-MM-DD
  t?: string | null; // time
}

const PREFIX = "appt:";
/** pending_action once the request is saved: Activate / Later are read */
export const APPT_AFTER = "appt_after";
export const isApptPending = (pending: string | null | undefined) => !!pending?.startsWith(PREFIX);
export function readAppt(pending: string | null | undefined): ApptDraft | null {
  if (!isApptPending(pending)) return null;
  try {
    const d = JSON.parse(pending!.slice(PREFIX.length));
    return d && typeof d.step === "string" ? (d as ApptDraft) : null;
  } catch {
    return null;
  }
}
export const writeAppt = (d: ApptDraft) => PREFIX + JSON.stringify(d);

// ---------------------------------------------------------------- the questions

/** Step 1: where (a "Send location" button; a typed area works too) */
export const apptWhereAsk = (l?: Lg): OutboundMessage => ({
  kind: "location_request",
  body: tr(
    l,
    "Please share your current location 📍, or type your area and city (for example: Malviya Nagar, New Delhi). I will show hospitals near you.",
    "कृपया अपनी मौजूदा लोकेशन 📍 भेजें, या अपना इलाका और शहर लिखें (जैसे: मालवीय नगर, नई दिल्ली)। मैं आपके पास के अस्पताल दिखाऊँगा।",
    "Please apni current location 📍 bhejein, ya apna area aur city likhein (jaise: Malviya Nagar, New Delhi). Main aapke paas ke hospitals dikhaunga.",
  ),
});

export const apptWhereAgain = (l?: Lg): string =>
  tr(
    l,
    "I could not find that place. Please share your location 📍 or type your area and city, for example: Saket, New Delhi.",
    "मुझे यह जगह नहीं मिली। कृपया अपनी लोकेशन 📍 भेजें या इलाका और शहर लिखें, जैसे: साकेत, नई दिल्ली।",
    "Mujhe yeh jagah nahi mili. Please apni location 📍 bhejein ya area aur city likhein, jaise: Saket, New Delhi.",
  );

const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

/** Step 2: the hospitals near the customer (partners first), and "Other hospital" */
export function apptListCard(options: ApptOption[], place: string | null, l?: Lg): OutboundMessage {
  const partners = options.filter((o) => o.c).length;
  const rows: ListRow[] = options.slice(0, 9).map((o, i) => ({
    id: `appt_opt_${i}`,
    title: cut(o.n, 24),
    description: cut(
      o.c
        ? tr(l, "✅ Oxxy partner", "✅ Oxxy पार्टनर", "✅ Oxxy partner") + (o.a ? ` · ${o.a}` : "")
        : tr(l, "Not an Oxxy partner yet", "अभी Oxxy पार्टनर नहीं", "Abhi Oxxy partner nahi") +
            (o.a ? ` · ${o.a}` : ""),
      72,
    ),
  }));
  rows.push({
    id: BOOK_IDS.other,
    title: tr(l, "Other hospital", "दूसरा अस्पताल", "Doosra hospital"),
    description: tr(
      l,
      "Type the hospital or centre name",
      "अस्पताल या सेंटर का नाम लिखें",
      "Hospital ya centre ka naam likhein",
    ),
  });
  const near = place ? ` (${cut(place, 60)})` : "";
  const body = [
    tr(
      l,
      `Hospitals near you${near}:`,
      `आपके पास के अस्पताल${near}:`,
      `Aapke paas ke hospitals${near}:`,
    ),
    "",
    partners
      ? tr(
          l,
          "✅ Oxxy partners give the Oxxy discount. For the others, our team will check whether the discount applies.",
          "✅ Oxxy पार्टनर पर Oxxy छूट मिलती है। बाकी के लिए हमारी टीम छूट की जाँच करेगी।",
          "✅ Oxxy partners par Oxxy discount milta hai. Baaki ke liye hamari team discount check karegi.",
        )
      : tr(
          l,
          "These are not Oxxy partners yet. Our team will check whether the Oxxy discount applies at the hospital you choose.",
          "ये अभी Oxxy पार्टनर नहीं हैं। आप जो अस्पताल चुनेंगे, वहाँ Oxxy छूट मिलती है या नहीं, हमारी टीम जाँच करेगी।",
          "Yeh abhi Oxxy partners nahi hain. Aap jo hospital chunenge, wahan Oxxy discount milta hai ya nahi, hamari team check karegi.",
        ),
    tr(
      l,
      "Tap below to choose.",
      "चुनने के लिए नीचे टैप करें।",
      "Chunne ke liye neeche tap karein.",
    ),
  ].join("\n");
  return {
    kind: "list",
    body,
    buttonLabel: tr(l, "Choose hospital", "अस्पताल चुनें", "Hospital chunein"),
    rows,
    log: [body, ...rows.map((r) => `• ${r.title}`)].join("\n"),
  };
}

/** No place found near them: type the name instead */
export const apptNoneNearby = (l?: Lg): string =>
  tr(
    l,
    "I could not find hospitals near that place. Please type the hospital or diagnostic centre name, city and state (for example: Moolchand Hospital, New Delhi, Delhi).",
    "उस जगह के पास मुझे अस्पताल नहीं मिले। कृपया अस्पताल या डायग्नोस्टिक सेंटर का नाम, शहर और राज्य लिखें (जैसे: मूलचंद हॉस्पिटल, नई दिल्ली, दिल्ली)।",
    "Us jagah ke paas mujhe hospitals nahi mile. Please hospital ya diagnostic centre ka naam, city aur state likhein (jaise: Moolchand Hospital, New Delhi, Delhi).",
  );

/** "Other hospital": the name, city and state (the sketch's "Please fill") */
export const apptNameAsk = (l?: Lg): string =>
  tr(
    l,
    "Please type the hospital or diagnostic centre name, city and state.\nFor example: Moolchand Hospital, New Delhi, Delhi",
    "कृपया अस्पताल या डायग्नोस्टिक सेंटर का नाम, शहर और राज्य लिखें।\nजैसे: मूलचंद हॉस्पिटल, नई दिल्ली, दिल्ली",
    "Please hospital ya diagnostic centre ka naam, city aur state likhein.\nJaise: Moolchand Hospital, New Delhi, Delhi",
  );

/** Step 3: booking for */
export function apptForAsk(hospital: string, l?: Lg): OutboundMessage {
  return {
    kind: "buttons",
    body: tr(
      l,
      `Hospital: ${hospital}\n\nWho is this booking for?`,
      `अस्पताल: ${hospital}\n\nयह बुकिंग किसके लिए है?`,
      `Hospital: ${hospital}\n\nYeh booking kiske liye hai?`,
    ),
    buttons: [
      { id: BOOK_IDS.self, title: tr(l, "Myself", "मेरे लिए", "Mere liye") },
      { id: BOOK_IDS.family, title: tr(l, "Family member", "परिवार का सदस्य", "Family member") },
    ],
  };
}

export function readBookingFor(text: string): "self" | "family" | null {
  const t = (text || "").trim().toLowerCase();
  if (t === BOOK_IDS.self || /^(my ?self|me|self|for me|mere liye|मेरे लिए|main|मैं)\b/.test(t))
    return "self";
  if (
    t === BOOK_IDS.family ||
    /\b(family|father|mother|dad|mom|papa|mummy|wife|husband|son|daughter|brother|sister|parents?|grand\w*|parivaar|परिवार)\b/.test(
      t,
    )
  )
    return "family";
  return null;
}

/** Step 4: the date (the sketch's "When do you want to go?") */
export const apptDateAsk = (l?: Lg): string =>
  tr(
    l,
    "When do you want to go? Please type the date, for example: 25 Nov",
    "आप कब जाना चाहते हैं? कृपया तारीख लिखें, जैसे: 25 Nov",
    "Aap kab jaana chahte hain? Please date likhein, jaise: 25 Nov",
  );

/** Step 5: the time */
export const apptTimeAsk = (date: string, l?: Lg): string =>
  tr(
    l,
    `Date: ${showDate(date)}\nWhat time suits you? For example: 11 am, or morning / evening`,
    `तारीख: ${showDate(date)}\nकौन सा समय ठीक रहेगा? जैसे: सुबह 11 बजे, या सुबह / शाम`,
    `Date: ${showDate(date)}\nKaunsa time theek rahega? Jaise: 11 am, ya morning / evening`,
  );

/** "11 am", "5:30 pm", "17:00", "morning", "evening": a time or a window; null = not a time */
export function readApptTime(text: string): string | null {
  const t = (text || "").trim().toLowerCase();
  if (!t || t.split(/\s+/).length > 6) return null;
  const hm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/);
  if (hm) {
    const h = Number(hm[1]);
    if (h < 1 || h > 12) return null;
    return `${h}:${hm[2] ?? "00"} ${hm[3].startsWith("a") ? "AM" : "PM"}`;
  }
  const h24 = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (h24 && Number(h24[1]) < 24 && Number(h24[2]) < 60)
    return `${h24[1].padStart(2, "0")}:${h24[2]}`;
  const bare = t.match(/^(\d{1,2})$/);
  if (bare && Number(bare[1]) >= 1 && Number(bare[1]) <= 12) {
    const h = Number(bare[1]);
    return `${h}:00 ${h >= 8 && h <= 11 ? "AM" : "PM"}`; // clinic hours: 8-11 morning, 12-7 afternoon / evening
  }
  if (/\b(morning|subah|सुबह|kaalai|காலை)\b/.test(t)) return "Morning";
  if (/\b(afternoon|dopahar|दोपहर|madhiyam)\b/.test(t)) return "Afternoon";
  if (/\b(evening|shaam|शाम|maalai|மாலை)\b/.test(t)) return "Evening";
  if (/\b(any ?time|anytime|kabhi bhi|koi bhi)\b/.test(t)) return "Any time";
  return null;
}

export const apptTimeAgain = (l?: Lg): string =>
  tr(
    l,
    "Please type a time, for example: 11 am, 5:30 pm, or morning / evening.",
    "कृपया समय लिखें, जैसे: सुबह 11 बजे, शाम 5:30, या सुबह / शाम।",
    "Please time likhein, jaise: 11 am, 5:30 pm, ya morning / evening.",
  );

/** The end (the sketch's "OK, your request is processed. Please activate services") */
export function apptDoneCard(
  o: { hospital: string; date: string; time: string; partner: boolean },
  l?: Lg,
): OutboundMessage {
  const lines = [
    tr(
      l,
      "✅ OK, your request is processed.",
      "✅ ठीक है, आपका अनुरोध दर्ज हो गया है।",
      "✅ OK, aapki request process ho gayi hai.",
    ),
    "",
    tr(l, `Hospital: ${o.hospital}`, `अस्पताल: ${o.hospital}`, `Hospital: ${o.hospital}`),
    tr(
      l,
      `Date: ${showDate(o.date)}, ${o.time}`,
      `तारीख: ${showDate(o.date)}, ${o.time}`,
      `Date: ${showDate(o.date)}, ${o.time}`,
    ),
    "",
    o.partner
      ? tr(
          l,
          "Our team will confirm the appointment with you. This is a request until the team confirms it.",
          "हमारी टीम आपके साथ अपॉइंटमेंट कन्फ़र्म करेगी। टीम के कन्फ़र्म करने तक यह एक अनुरोध है।",
          "Hamari team aapke saath appointment confirm karegi. Team ke confirm karne tak yeh ek request hai.",
        )
      : tr(
          l,
          "This hospital is not an Oxxy partner yet: our team will check it, confirm the appointment with you and tell you whether the Oxxy discount applies.",
          "यह अस्पताल अभी Oxxy पार्टनर नहीं है: हमारी टीम इसकी जाँच करेगी, आपके साथ अपॉइंटमेंट कन्फ़र्म करेगी और बताएगी कि Oxxy छूट मिलेगी या नहीं।",
          "Yeh hospital abhi Oxxy partner nahi hai: hamari team ise check karegi, aapke saath appointment confirm karegi aur batayegi ki Oxxy discount milega ya nahi.",
        ),
    "",
    tr(
      l,
      "Please activate Oxxy services to get the discount on your bill.",
      "बिल पर छूट पाने के लिए कृपया Oxxy सेवाएँ एक्टिवेट करें।",
      "Bill par discount paane ke liye please Oxxy services activate karein.",
    ),
  ];
  return {
    kind: "buttons",
    body: lines.join("\n"),
    buttons: [
      { id: BOOK_IDS.activate, title: tr(l, "Activate", "एक्टिवेट करें", "Activate") },
      { id: BOOK_IDS.later, title: tr(l, "Later", "बाद में", "Baad mein") },
    ],
  };
}

export const asksApptActivate = (text: string) =>
  /^(appt_activate|activate|activate now|activate services)\s*[.!]?$/i.test((text || "").trim());
export const asksApptLater = (text: string) =>
  /^(appt_later|later|not now|baad mein|बाद में)\s*[.!]?$/i.test((text || "").trim());

/** "Later": the thank-you message */
export const apptThanks = (l?: Lg): OutboundMessage => ({
  kind: "buttons",
  body: tr(
    l,
    "Thank you! 🙏 Our team will be in touch about your appointment. Whenever you are ready, you can activate Oxxy here, or ask me anything.",
    "धन्यवाद! 🙏 हमारी टीम आपकी अपॉइंटमेंट के बारे में संपर्क करेगी। जब भी आप तैयार हों, यहाँ Oxxy एक्टिवेट कर सकते हैं या मुझसे कुछ भी पूछ सकते हैं।",
    "Dhanyavaad! 🙏 Hamari team aapki appointment ke baare mein contact karegi. Jab bhi aap ready hon, yahan Oxxy activate kar sakte hain ya mujhse kuch bhi pooch sakte hain.",
  ),
  buttons: [
    { id: BILL_IDS.activate, title: tr(l, "Activate Oxxy", "Oxxy एक्टिवेट करें", "Oxxy activate") },
    { id: BILL_IDS.menu, title: tr(l, "Main Menu", "मुख्य मेनू", "Main Menu") },
  ],
});

/** A row pick from the list: its index, or null */
export function readApptPick(text: string): number | null {
  const m = (text || "").trim().match(/^appt_opt_(\d)$/);
  return m ? Number(m[1]) : null;
}
