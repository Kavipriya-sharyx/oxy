import { Injectable } from "@nestjs/common";

const TZ = "Asia/Kolkata";

// Today's calendar date in Asia/Kolkata as YYYY-MM-DD
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

function addMonths(d: string, n: number): string {
  const x = parse(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return fmt(x);
}

export function bookingWindow(now: Date = new Date()) {
  const today = todayIST(now);
  return { min: addDays(today, 3), max: addMonths(today, 6) };
}

export function validateBookingDate(date: string, now: Date = new Date()) {
  const { min, max } = bookingWindow(now);
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date || "") && fmt(parse(date)) === date;
  if (!real) return { valid: false, reason: "invalid_date", min, max };
  if (date < min) return { valid: false, reason: "too_soon", min, max };
  if (date > max) return { valid: false, reason: "too_far", min, max };
  return { valid: true, min, max };
}

@Injectable()
export class DateWindowService {
  validate(date: string, now: Date = new Date()) {
    return validateBookingDate(date, now);
  }
  window(now: Date = new Date()) {
    return bookingWindow(now);
  }
}
