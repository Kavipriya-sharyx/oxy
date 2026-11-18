// Trigger O, senior callback (Trigger layer 9 O, Playbook escalation): "Please choose a convenient time:
// {{Callback_Options}}", then "I have requested a callback for {{Callback_Window}}. Reference: {{Case_ID}}".
// Windows are offered only inside the human team's hours. Pure rules and texts; the chat pipeline stores
// the choice on the task and tells the CRM.
import { normaliseHindiDate, showDate } from "./BookingFlow";
import { istDate, parseFollowUpTime } from "./RecoveryFlow";
import { L, say } from "@Helper/Lang";

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const HOUR = 3600 * 1000;
const WINDOW_HOURS = 2;
const LEAD_MS = HOUR; // a window starts at least one hour from now, so the team has time to pick it up

export interface TeamHours {
  start: number; // hour, IST
  end: number; // hour, IST (the last window ends here)
  days: number[]; // 0 = Sunday ... 6 = Saturday
}
export interface CallbackWindow {
  from: Date;
  to: Date;
}

/**
 * TEAM_HOURS="10-19" and TEAM_DAYS="1-6" (Mon-Sat) [CONFIRM both with the sales team]. A broken value
 * falls back to the default instead of offering no window at all.
 */
export function teamHours(env: NodeJS.ProcessEnv = process.env): TeamHours {
  const h = String(env.TEAM_HOURS ?? "").match(/^\s*(\d{1,2})(?::00)?\s*-\s*(\d{1,2})(?::00)?\s*$/);
  let start = h ? Number(h[1]) : 10;
  let end = h ? Number(h[2]) : 19;
  if (!(start >= 0 && end <= 24 && end - start >= 1)) [start, end] = [10, 19];
  const d = String(env.TEAM_DAYS ?? "").match(/^\s*([0-6])\s*-\s*([0-6])\s*$/);
  let days = [1, 2, 3, 4, 5, 6];
  if (d && Number(d[1]) <= Number(d[2])) {
    days = [];
    for (let i = Number(d[1]); i <= Number(d[2]); i++) days.push(i);
  }
  return { start, end, days };
}

const istYmd = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istDay = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
const istHour = (d: Date) => {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return x.getUTCHours() + x.getUTCMinutes() / 60;
};

/** The next three windows inside team hours: 2-hour blocks from the team's start hour, the last one cut at the end hour */
export function callbackOptions(
  now: Date = new Date(),
  hours: TeamHours = teamHours(),
): CallbackWindow[] {
  const out: CallbackWindow[] = [];
  for (let day = 0; day < 14 && out.length < 3; day++) {
    const ymd = istYmd(new Date(now.getTime() + day * 24 * HOUR));
    if (!hours.days.includes(istDay(istDate(ymd, 12)))) continue;
    for (let h = hours.start; h < hours.end && out.length < 3; h += WINDOW_HOURS) {
      const from = istDate(ymd, h);
      if (from.getTime() < now.getTime() + LEAD_MS) continue;
      out.push({ from, to: istDate(ymd, Math.min(h + WINDOW_HOURS, hours.end)) });
    }
  }
  return out;
}

function clock(d: Date): string {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  const h = x.getUTCHours();
  const m = x.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`;
}

/** "Today, 2-4 pm" / "Mon 17 Nov, 10 am-12 pm" */
export function showWindow(
  w: CallbackWindow,
  l: string | null = "en",
  now: Date = new Date(),
): string {
  const ymd = istYmd(w.from);
  const rel =
    ymd === istYmd(now)
      ? say({ en: "Today", hi: "आज", hinglish: "Aaj" }, l)
      : ymd === istYmd(new Date(now.getTime() + 24 * HOUR))
        ? say({ en: "Tomorrow", hi: "कल", hinglish: "Kal" }, l)
        : showDate(ymd).replace(/ \d{4}$/, "");
  const [a, b] = [clock(w.from), clock(w.to)];
  const span = a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}-${b}` : `${a}-${b}`;
  return `${rel}, ${span}`;
}

/** Windows <-> "from-to,from-to" (epoch ms), kept in conversation.pending_action */
export function packWindows(ws: CallbackWindow[]): string {
  return ws.map((w) => `${w.from.getTime()}-${w.to.getTime()}`).join(",");
}
export function unpackWindows(s: string): CallbackWindow[] {
  return String(s || "")
    .split(",")
    .map((x) => x.split("-").map(Number))
    .filter(([a, b]) => a > 0 && b > a)
    .map(([a, b]) => ({ from: new Date(a), to: new Date(b) }));
}

/**
 * Short case reference the customer gets, e.g. "CB-1A2B3C4D": the first 8 characters of the callback task's
 * id. It is not stored separately: the task IS the record, and the console finds the task by this reference.
 */
export function caseRef(taskId: string): string {
  return `CB-${String(taskId).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** "CB-498A3BD2", "cb498a3bd2", "498A3BD2" -> "498a3bd2" (the start of the task id); null = not a reference */
export function refPrefix(text: string): string | null {
  const m = String(text ?? "").trim().match(/^(?:cb[-\s]?)?([0-9a-f]{8})$/i);
  return m ? m[1].toLowerCase() : null;
}

export function callbackQuestion(
  options: CallbackWindow[],
  l: string | null = "en",
  now: Date = new Date(),
  existing?: { window: CallbackWindow; ref?: string } | null,
): string {
  const list = options.map((w, i) => `${i + 1}) ${showWindow(w, l, now)}`).join("\n");
  if (existing) {
    const when = showWindow(existing.window, l, now);
    const refStr = existing.ref ? ` (${existing.ref})` : "";
    return say(
      {
        en: `You already have a callback booked for ${when}${refStr}. Would you like to move to another timing?\n\nPlease choose a new timing:\n${list}\nReply 1, 2 or 3, or tell me another time.`,
        hi: `आपकी कॉलबैक पहले से ${when}${refStr} के लिए बुक है। क्या आप दूसरा समय चुनना चाहेंगे?\n\nकृपया नया समय चुनें:\n${list}\n1, 2 या 3 लिखें, या कोई दूसरा समय बताएँ।`,
        hinglish: `Aapki callback pehle se ${when}${refStr} ke liye book hai. Kya aap doosra time lena chahenge?\n\nKripya naya time chunein:\n${list}\n1, 2 ya 3 likhein, ya koi aur time bataiye.`,
      },
      l,
    );
  }
  return say(
    {
      // Trigger layer 9 O: "Please choose a convenient time: {{Callback_Options}}"; the last line tells how to answer
      en: `Please choose a convenient time:\n${list}\nReply 1, 2 or 3, or tell me another time.`,
      hi: `कृपया कोई सुविधाजनक समय चुनें:\n${list}\n1, 2 या 3 लिखें, या कोई दूसरा समय बताएँ।`,
      hinglish: `Kripya koi convenient time chunein:\n${list}\n1, 2 ya 3 likhein, ya koi aur time bataiye.`,
    },
    l,
  );
}

export function callbackSavedText(
  w: CallbackWindow,
  ref: string,
  l: string | null = "en",
  now: Date = new Date(),
): string {
  const when = showWindow(w, l, now);
  return say(
    {
      // Playbook 18 "Senior callback": "I have requested a callback for {{Callback_Window}}. Reference: {{Case_ID}}."
      en: `I have requested a callback for ${when}. Reference: ${ref}.`,
      hi: `मैंने ${when} के लिए कॉलबैक का अनुरोध कर दिया है। संदर्भ: ${ref}।`,
      hinglish: `Maine ${when} ke liye callback request kar diya hai. Reference: ${ref}.`,
    },
    l,
  );
}

export const CALLBACK_OUTSIDE_HOURS_T = (h: TeamHours): L => {
  const range = `${clock(istDate("2026-01-01", h.start))}-${clock(istDate("2026-01-01", h.end))}`;
  return {
    en: `Our team calls between ${range}. Please choose one of these times:`,
    hi: `हमारी टीम ${range} के बीच कॉल करती है। कृपया इनमें से कोई समय चुनें:`,
    hinglish: `Hamari team ${range} ke beech call karti hai. Kripya inmein se koi time chunein:`,
  };
};

/** Hour (0-23) from "4", "4 pm", "10:30 am"; a bare 1-7 is afternoon (team hours start in the morning) */
function hour24(h: number, ampm: string | undefined, fallbackAmPm?: string): number {
  const a = ampm || fallbackAmPm;
  if (a === "pm" && h < 12) return h + 12;
  if (a === "am" && h === 12) return 0;
  if (!a && h >= 1 && h <= 7) return h + 12;
  return h;
}

/**
 * The shown window the customer means, in words: a range ("4 to 6 pm", "4-6pm", "10 am - 12 pm") or a
 * start time ("4 pm") equal to a window's start, with "today" / "tomorrow" when given. null = none of them.
 */
export function shownOption(
  text: string,
  options: CallbackWindow[],
  now: Date = new Date(),
): CallbackWindow | null {
  const t = (text || "").toLowerCase();
  const range = t.match(
    /\b(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*(?:-|–|to|till|until|and)\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?\b/,
  );
  const single = range ? null : t.match(/\b(\d{1,2})(?::\d{2})?\s*(am|pm)\b/);
  if (!range && !single) return null;
  let from: number;
  let to: number | null = null;
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[3])];
    to = hour24(b, range[4]);
    // "11 to 1 pm": the start is in the morning; "4 to 6 pm": both in the afternoon
    const startAmPm = range[2] || (range[4] === "pm" && a > b ? "am" : range[4]);
    from = hour24(a, startAmPm);
  } else from = hour24(Number(single![1]), single![2]);
  const day = /\btoday\b|\btonight\b|\baaj\b|\binniku\b/.test(t)
    ? istYmd(now)
    : /\btomorrow\b|\btmrw\b|\bkal\b|\bnaalaikku\b/.test(t)
      ? istYmd(new Date(now.getTime() + 24 * HOUR))
      : null;
  const hit = options.filter(
    (w) =>
      Math.floor(istHour(w.from)) === from &&
      (to == null || Math.round(istHour(w.to)) === to) &&
      (!day || istYmd(w.from) === day),
  );
  return hit[0] ?? null;
}

/**
 * The window the customer chose: "1" / "2" / "3" / "first" (Devanagari digits too), or a day and/or time
 * ("tomorrow 5 pm"). A free time becomes a one-hour window. Returns { window } when it is inside team
 * hours, { outside: true } when it is not, or null when the message holds no time at all.
 */
export function parseCallbackChoice(
  text: string,
  options: CallbackWindow[],
  now: Date = new Date(),
  hours: TeamHours = teamHours(),
): { window: CallbackWindow } | { outside: true } | null {
  const t = normaliseHindiDate(text)
    .toLowerCase()
    .trim()
    .replace(/[.)!]+$/, "");
  const pick: Record<string, number> = {
    "1": 0,
    "option 1": 0,
    first: 0,
    "1st": 0,
    "the first one": 0,
    any: 0,
    anytime: 0,
    "any time": 0,
    "2": 1,
    "option 2": 1,
    second: 1,
    "2nd": 1,
    "the second one": 1,
    "3": 2,
    "option 3": 2,
    third: 2,
    "3rd": 2,
    "the third one": 2,
  };
  if (t in pick) return options[pick[t]] ? { window: options[pick[t]] } : null;
  // one of the windows shown, in words: "today 4 to 6 pm", "4-6 pm", "tomorrow 10 am" (client, 17 Nov:
  // "today 4 to 6 pm" became "Today, 6-7 pm", the last time in the sentence)
  const shown = shownOption(t, options, now);
  if (shown) return { window: shown };
  // a question or a long sentence is not a callback time ("can you suggest a centre within 5 km?")
  if (/\?\s*$/.test(t) || t.split(/\s+/).length > 8) return null;
  const at = parseFollowUpTime(t, [options[0]?.from ?? now, options[1]?.from ?? now], now);
  if (!at) return null;
  const end = new Date(at.getTime() + HOUR);
  const h = istHour(at);
  const inside =
    at.getTime() >= now.getTime() + LEAD_MS / 2 &&
    at.getTime() <= now.getTime() + 30 * 24 * HOUR &&
    hours.days.includes(istDay(at)) &&
    h >= hours.start &&
    h + 1 <= hours.end;
  return inside ? { window: { from: at, to: end } } : { outside: true };
}
