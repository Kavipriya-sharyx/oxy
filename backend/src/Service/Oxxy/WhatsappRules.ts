import { OutboundMessage, SendPurpose } from "@Helper/WhatsappMessage";
import { QuietHoursError, WindowClosedError } from "@Helper/WhatsappErrors";

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "Asia/Kolkata";
/**
 * The hours (IST) in which the bot may send proactive messages: from `from`:00 up to but not including
 * `until`:00. Configuration page (PROACTIVE_FROM / PROACTIVE_UNTIL), read live; default 9 to 21. A broken
 * setting (from >= until, out of range) falls back to the default.
 */
export function proactiveHours(env: NodeJS.ProcessEnv = process.env): {
  from: number;
  until: number;
} {
  const int = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isInteger(n) ? n : d;
  };
  const from = int(env.PROACTIVE_FROM, 9);
  const until = int(env.PROACTIVE_UNTIL, 21);
  return from >= 0 && until <= 24 && from < until ? { from, until } : { from: 9, until: 21 };
}

/** "9 am", "12 pm", "9 pm" */
export const hour12 = (h: number) =>
  h === 0 || h === 24 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`;
/** "09:00" */
export const hhmm = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

// true only if the customer wrote to us less than 24 hours ago
export function isWithin24h(
  lastCustomerMessageAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastCustomerMessageAt) return false;
  return now.getTime() - new Date(lastCustomerMessageAt).getTime() < DAY_MS;
}

function istHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(parts);
}

// India time, not server time
export function isQuietHours(now: Date = new Date()): boolean {
  const h = istHour(now);
  const { from, until } = proactiveHours();
  return h < from || h >= until;
}

// the next 09:00 IST (09:00 IST = 03:30 UTC; IST has no daylight saving)
export function nextAllowedAt(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  const { from, until } = proactiveHours();
  const dayShift = istHour(now) >= until ? 1 : 0;
  // IST = UTC + 5:30, so `from`:00 IST is (from * 60 - 330) minutes after UTC midnight
  return new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + dayShift, 0, from * 60 - 330, 0));
}

// throws WindowClosedError / QuietHoursError, returns nothing when the send is allowed
export function checkAllowed(
  message: OutboundMessage,
  purpose: SendPurpose,
  lastCustomerMessageAt: Date | null | undefined,
  now: Date = new Date(),
): void {
  if (message.kind !== "template" && !isWithin24h(lastCustomerMessageAt, now))
    throw new WindowClosedError();
  if (purpose === "proactive" && isQuietHours(now)) throw new QuietHoursError(nextAllowedAt(now));
}
