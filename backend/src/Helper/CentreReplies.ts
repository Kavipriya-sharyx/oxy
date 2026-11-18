// Centre suggestions (Playbook 10.1, Trigger layer 6 card and footer). English approved, Hindi / Hinglish drafts.
import { L, say } from "./Lang";

export interface CentreCard {
  name: string;
  branch?: string | null;
  locality?: string | null;
  city?: string | null;
  centre_type?: string | null;
  /** from the customer's spot: road distance when Google Maps answered, else straight line */
  distance_km?: number | null;
  minutes?: number | null;
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
  en: "Reply with {range}, or send the name of another centre you prefer.",
  hi: "{range} में से कोई नंबर लिखें, या अपनी पसंद के किसी दूसरे सेंटर का नाम भेजें।",
  hinglish: "{range} mein se number likhein, ya apni pasand ke kisi doosre centre ka naam bhejein.",
};
const KIND: Record<"multi" | "specialist" | "clinic" | "diagnostic", L> = {
  clinic: { en: "Clinic", hi: "क्लिनिक", hinglish: "Clinic" },
  diagnostic: { en: "Diagnostic centre", hi: "डायग्नोस्टिक सेंटर", hinglish: "Diagnostic centre" },
  multi: { en: "Multispeciality", hi: "मल्टीस्पेशलिटी", hinglish: "Multispeciality" },
  specialist: { en: "Specialist", hi: "स्पेशलिस्ट", hinglish: "Specialist" },
};
const RELEVANT: L = { en: "Relevant for {s}", hi: "{s} के लिए उपयुक्त", hinglish: "{s} ke liye relevant" };

const UNDER_KM: L = { en: "under 1 km", hi: "1 km से कम", hinglish: "1 km se kam" };
const ABOUT_KM: L = { en: "about {km} km", hi: "लगभग {km} km", hinglish: "lagbhag {km} km" };

// The customer asked for something nearby: one tap on "Send location", or the area typed. [CONFIRM] wording
// (the second sentence is Playbook 14 "No provider in my area").
export const LOCATION_ASK_T: L = {
  en: "Please share the patient's location with the button below, or type the locality and city. I can suggest up to five suitable private healthcare centres.",
  hi: "कृपया नीचे दिए बटन से मरीज़ की लोकेशन भेजें, या इलाका और शहर लिखें। मैं पाँच तक उपयुक्त निजी स्वास्थ्य केंद्र सुझा सकता हूँ।",
  hinglish: "Kripya neeche diye button se patient ki location bhejein, ya locality aur city likhein. Main paanch tak suitable private healthcare centres suggest kar sakta hoon.",
};

// The area is already known ("Peelamedu, Coimbatore"): the pin is asked once for the NEAREST centres, and
// NO keeps the typed area. Wording accepted by the client (16 Nov), no separate approval.
export const LOCATION_NEAREST_T: L = {
  en: "To show the centres nearest to the patient, please share the patient's location with the button below. Or reply NO and I will search in {place}.",
  hi: "मरीज़ के सबसे नज़दीकी केंद्र दिखाने के लिए, कृपया नीचे दिए बटन से मरीज़ की लोकेशन भेजें। या NO लिखें, तो मैं {place} में खोजूँगा।",
  hinglish: "Patient ke sabse nazdeeki centres dikhane ke liye, kripya neeche diye button se patient ki location bhejein. Ya NO likhein, to main {place} mein search karunga.",
};

/** The location question: with the known area ("... or reply NO and I will search in Peelamedu, Coimbatore") or without */
export function locationAskText(place: string | null | undefined, l?: string | null): string {
  const p = String(place ?? "").trim();
  return p ? say(LOCATION_NEAREST_T, l).replace("{place}", p) : say(LOCATION_ASK_T, l);
}

/** "no", "skip", "I can't share it", "search in the same area": no pin, go on with the area already given */
export function declinesLocation(text: string): boolean {
  const t = (text || "").toLowerCase().replace(/[’`]/g, "'").trim();
  return (
    /^(no|nope|nah|na|nahi|nahin|skip|not now|later|n|vendam|venda)\b/.test(t) ||
    /\b(can'?t|cannot|can not|don'?t|do not|not able|unable|won'?t|nahi)\b[^.?!]*\b(share|send|location|bhej)\w*/.test(t) ||
    /\b(search|look|use|show|find)\b[^.?!]*\b(same|that|this|there|above)\b|\bsame (area|place|location|city)\b/.test(t) ||
    /^नहीं|मत /.test(t)
  );
}

/** "yes", "ok", "sure" and nothing else: they mean to share it, the button is shown again */
export const agreesToShare = (text: string) =>
  /^(yes|ya|yeah|yep|ok|okay|sure|fine|haan|han|ha|ji|k|theek hai|sari|seri|हाँ|ठीक है)[\s.!]*$/i.test((text || "").trim());

/** "10 km", "5", "20kms" and nothing else */
export const onlyRadius = (text: string) => /^\s*(up ?to\s+)?\d{1,3}\s*(km|kms|k\.?m\.?|kilomet\w*)?\s*\.?\s*$/i.test(text || "");

const NEAR_RE =
  /\b(near ?by|near (me|my|us|our)|nearest|closest|close to (me|my|us)|around (me|here)|my (current |live )?location|current location|live location|paas (mein|me|ke|wala|wale)|nazdeek\w*|aas ?paas|pakkath\w*|pakkam)\b|पास|नज़दीक|आसपास/i;
const PLACE_RE =
  /\b(hospitals?|clinics?|centres?|centers?|labs?|diagnostics?|doctors?|scan|pharmacy|medical|health ?care)\b|अस्पताल|क्लिनिक|डॉक्टर|सेंटर/i;

/** "any hospital near me", "nearby clinic", "paas mein koi hospital": wants centres close to where they are */
export function asksNearby(text: string, inCentreSearch = false): boolean {
  const t = text || "";
  return NEAR_RE.test(t) && (inCentreSearch || PLACE_RE.test(t));
}

// Words that are never an area name ("near me", "in the morning", "in my area")
const NOT_A_PLACE = new Set(
  ("me my us our here there this that the a an any home house location area areas city town place places " +
    "hospital hospitals clinic clinics centre centres center centers doctor doctors india km kms radius " +
    "morning evening afternoon night today tomorrow week month year time pain need plan plans case future " +
    "general detail details mind which what where your you it them future vicinity locality side it's").split(" "),
);
const PLACE_WORD = /^[a-z][a-z.'-]{1,24}$/;
const tidyPlace = (s: string) =>
  s
    .replace(/\b(area|locality|side|region|surroundings)\b\s*$/i, "")
    .replace(/^\s*(the)\s+/i, "")
    .trim()
    .replace(/\s+/g, " ");
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
function placeWords(s: string): string | null {
  const t = tidyPlace(s);
  const w = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (!w.length || w.length > 3) return null;
  if (w.some((x) => !PLACE_WORD.test(x) || NOT_A_PLACE.has(x))) return null;
  // all-caps names ("SITRA") read better as typed; lower-case ones get a capital letter
  return t === t.toLowerCase() ? titleCase(t) : t;
}

/**
 * The area named in the message ("near Peelamedu, Coimbatore", "centres in the SITRA area of Coimbatore",
 * "around Gandhipuram"): { locality, city }. "near" / "around" always count; "in" / "at" only next to a
 * centre word, or with "area" / a city after it ("in pain", "in the morning" are not places). Client, 17 Nov:
 * a new area typed in a sentence was left to the LLM, which kept the old one, and the bot answered for
 * Neelambur every time.
 */
export function namedPlace(text: string): { locality: string; city: string | null } | null {
  const t = String(text || "").replace(/["“”`]/g, " ");
  const re = /\b(near ?by|near|around|in|at)\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const word = m[1].toLowerCase().replace(/\s/g, "");
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    // the rest of the clause: up to a full stop or the next part of the sentence
    const rest = t
      .slice(m.index + m[0].length)
      .split(/[.?!;:\n]|\b(?:preferably|within|for|and|please|with|to|which|that|so|who|where|having|under|upto|up to|radius|from)\b|\d/i)[0];
    const parts = rest.split(/\s*,\s*|\s+(?:of|in)\s+/i).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) continue;
    const locality = placeWords(parts[0]);
    if (!locality) continue;
    const city = parts[1] ? placeWords(parts[1]) : null;
    if (word === "in" || word === "at") {
      const nearCentreWord = PLACE_RE.test(before) || /\b(dermatolog\w*|specialist|dentist|cardiolog\w*)\b/i.test(before);
      const saysArea = /\b(area|locality|side)\b/i.test(parts[0]);
      if (!nearCentreWord && !saysArea && !city) continue;
    }
    if (city && city.toLowerCase() === locality.toLowerCase()) return { locality, city: null };
    return { locality, city };
  }
  return null;
}

const STATES =
  /^(tamil ?nadu|tn|kerala|karnataka|andhra( pradesh)?|telangana|maharashtra|gujarat|rajasthan|punjab|haryana|delhi ncr|ncr|uttar pradesh|up|madhya pradesh|mp|bihar|west bengal|odisha|orissa|assam|goa|india|north india|south india)$/i;

/**
 * A message that is only an area: "Tamilnadu, coimbatore", "coimbatore, neelambur", "Peelamedu Coimbatore".
 * `cities` = cities known to have centres (a part that matches one is the city). State names are dropped.
 * null = it does not look like an area (a question, digits, more than six words).
 */
export function typedArea(text: string, cities: string[] = []): { locality: string | null; city: string | null } | null {
  const t = String(text || "").trim().replace(/[.!]+$/, "");
  if (!t || /[?\d]/.test(t) || t.split(/\s+/).length > 6) return null;
  const parts = t
    .split(/\s*,\s*|\s+-\s+/)
    .map((x) => x.trim())
    .filter((x) => x && !STATES.test(x));
  if (!parts.length || parts.length > 3) return null;
  const known = (w: string) => cities.find((c) => c.toLowerCase() === w.toLowerCase()) ?? null;
  // "Peelamedu Coimbatore" with no comma: the known city at the end is split off
  if (parts.length === 1) {
    const w = parts[0].split(/\s+/);
    if (w.length > 1 && known(w[w.length - 1])) parts.splice(0, 1, w.slice(0, -1).join(" "), w[w.length - 1]);
  }
  const words = parts.map(placeWords);
  if (words.some((w) => !w)) return null;
  const ws = words as string[];
  const cityIdx = ws.findIndex((w) => !!known(w));
  if (cityIdx >= 0) {
    const others = ws.filter((_, i) => i !== cityIdx);
    return { city: known(ws[cityIdx]), locality: others[0] ?? null };
  }
  // "Peelamedu, Coimbatore": the area first, the city last
  return ws.length === 1 ? { locality: null, city: ws[0] } : { locality: ws[0], city: ws[ws.length - 1] };
}

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
// Nothing inside the travel distance, but verified centres a little further: say so and show the nearest
// (client, 17 Nov: "I do not have a verified centre in Neelambur" again and again, with KMCH about 8 km away)
const NEAREST_HEAD: L = {
  en: "There is no verified centre within {km} km of {place}. These are the nearest verified options:",
  hi: "{place} से {km} km के अंदर कोई सत्यापित केंद्र नहीं है। ये सबसे नज़दीकी सत्यापित विकल्प हैं:",
  hinglish: "{place} se {km} km ke andar koi verified centre nahi hai. Yeh sabse nazdeeki verified options hain:",
};
export function nearestListText(
  list: CentreCard[],
  specialisation: string | null,
  place: string | null,
  km: number,
  l?: string | null,
): string {
  const head = say(NEAREST_HEAD, l)
    .replace("{km}", String(km))
    .replace("{place}", place || say({ en: "the patient's area", hi: "मरीज़ के इलाके", hinglish: "patient ke area" }, l));
  return centreListText(list, specialisation, l, head);
}

export function centreListText(
  list: CentreCard[],
  specialisation: string | null,
  l?: string | null,
  headText?: string,
): string {
  const cards = list.map((c, i) => {
    // the type label only when the directory says so ("multi_speciality", "Multi-specialty" and the like count)
    const type = String(c.centre_type ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const kind = /^multi/.test(type)
      ? say(KIND.multi, l)
      : /^(speciali[sz]|specialty|speciality)/.test(type)
        ? say(KIND.specialist, l)
        : /^clinic/.test(type)
          ? say(KIND.clinic, l)
          : /^diagnos/.test(type)
            ? say(KIND.diagnostic, l)
        : null;
    const parts = [`${i + 1}. ${c.name}${c.branch ? `, ${c.branch}` : ""} - ${c.locality || c.city || ""}`, ...(kind ? [kind] : [])];
    if (c.distance_km != null && Number.isFinite(c.distance_km) && c.distance_km < 500) {
      const km = c.distance_km < 10 ? Math.round(c.distance_km * 10) / 10 : Math.round(c.distance_km);
      // right next to the customer: "under 1 km", never "about 0 km"
      parts.push((km < 1 ? say(UNDER_KM, l) : say(ABOUT_KM, l).replace("{km}", String(km))) + (c.minutes ? `, ${c.minutes} min` : ""));
    }
    if (specialisation) parts.push(say(RELEVANT, l).replace("{s}", specialisation));
    return parts.join(" | ");
  });
  const head = headText ?? say(specialisation ? HEAD : HEAD_AREA, l);
  const fewer = !headText && list.length < 5 ? `\n${say(FEWER, l).replace("{n}", String(list.length))}` : "";
  const range = list.length <= 1 ? "1" : list.length === 2 ? "1 or 2" : `1-${list.length}`;
  return `${head}\n${cards.join("\n")}${fewer}\n\n${say(FOOT, l).replace("{range}", range)}`;
}

// After the customer says no to another centre (CRM booking.cancelled). English approved style; hi /
// Hinglish drafts [CONFIRM].
export const REBOOK_DECLINED_T = {
  en: "No problem. If you need another booking request later, just message me here.",
  hi: "कोई बात नहीं। अगर बाद में आपको नया बुकिंग अनुरोध चाहिए, तो बस यहाँ मैसेज करें।",
  hinglish: "Koi baat nahi. Agar baad mein aapko naya booking request chahiye, to bas yahan message karein.",
};

// Words that every centre name shares: they never pick one centre on their own
const GENERIC = new Set(
  ("hospital hospitals clinic clinics centre center centres centers medical multi speciality specialty " +
    "multispeciality multispecialty super health healthcare care diagnostic diagnostics lab labs the and " +
    "pvt ltd private limited institute research foundation trust road main branch near").split(" "),
);
const words = (s: string | null | undefined) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
const flat = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const ORDINAL: Record<string, number> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5,
};

/**
 * The centre the customer picked from the list just shown, by number ("2", "option 2", "second one") or by
 * name and branch typed as text ("KMCH Peelamedu", "the apollo one in anna nagar"). Returns the index in
 * `list` (0-based); "tie" when two centres match equally (the number is asked); null when nothing in the
 * list matches. Client, 17 Nov: the typed branch and area showed the list again.
 */
export function pickFromList(
  text: string,
  list: Pick<CentreCard, "name" | "branch" | "locality">[],
): number | "tie" | null {
  const t = (text || "").trim().toLowerCase();
  if (!t || !list.length || /\?\s*$/.test(t) || t.split(/\s+/).length > 10) return null;
  const num = t.match(/^(?:option|no\.?|number|centre|center)?\s*([1-9])\s*\.?$/);
  if (num) return Number(num[1]) <= list.length ? Number(num[1]) - 1 : null;
  const ord = t.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\b/);
  if (ord && t.split(/\s+/).length <= 4) {
    const i = ORDINAL[ord[1]] - 1;
    return i < list.length ? i : null;
  }
  const said = new Set(words(t));
  if (!said.size) return null;
  const scores = list.map((c) => {
    const name = words(c.name);
    const hit = name.filter((w) => said.has(w)).length;
    if (!hit) return 0; // the place alone never picks a centre: it may be a new area
    const place = [...words(c.branch), ...words(c.locality)].filter((w) => said.has(w)).length;
    // the whole branch or area as typed ("T Nagar": its one-letter word is not in the word list)
    const phrase = [c.branch, c.locality].filter((x) => !!x && flat(x).length >= 3 && ` ${flat(t)} `.includes(` ${flat(x)} `)).length;
    return hit * 10 + place + phrase * 5;
  });
  const best = Math.max(...scores);
  if (best <= 0) return null;
  const top = scores.filter((x) => x === best).length;
  return top === 1 ? scores.indexOf(best) : "tie";
}
