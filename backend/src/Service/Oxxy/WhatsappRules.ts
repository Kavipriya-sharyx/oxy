import { OutboundMessage, SendPurpose } from "@Helper/WhatsappMessage";
import { QuietHoursError, WindowClosedError } from "@Helper/WhatsappErrors";

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "Asia/Kolkata";
const OPEN_HOUR = 9; // proactive sends allowed from 09:00 ...
const CLOSE_HOUR = 21; // ... up to but not including 21:00 IST

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
  return h < OPEN_HOUR || h >= CLOSE_HOUR;
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
  const dayShift = istHour(now) >= CLOSE_HOUR ? 1 : 0;
  return new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + dayShift, 3, 30, 0));
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
