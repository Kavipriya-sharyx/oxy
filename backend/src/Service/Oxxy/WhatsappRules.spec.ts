import { checkAllowed, isQuietHours, isWithin24h, nextAllowedAt } from "./WhatsappRules";
import { QuietHoursError, WindowClosedError } from "@Helper/WhatsappErrors";
import { OutboundMessage } from "@Helper/WhatsappMessage";

const text: OutboundMessage = { kind: "text", body: "hi" };
const template: OutboundMessage = { kind: "template", name: "hello_world", languageCode: "en_US" };
const HOUR = 3600_000;
const now = new Date("2026-03-10T08:00:00Z"); // 13:30 IST

describe("24-hour window", () => {
  it("23h59m ago is open, 24h01m ago is closed", () => {
    expect(isWithin24h(new Date(now.getTime() - (23 * 60 + 59) * 60_000), now)).toBe(true);
    expect(isWithin24h(new Date(now.getTime() - (24 * 60 + 1) * 60_000), now)).toBe(false);
  });
  it("exactly 24h is closed, no last message is closed", () => {
    expect(isWithin24h(new Date(now.getTime() - 24 * HOUR), now)).toBe(false);
    expect(isWithin24h(null, now)).toBe(false);
    expect(isWithin24h(undefined, now)).toBe(false);
  });
  it("text, buttons and list need the window; a template does not", () => {
    const old = new Date(now.getTime() - 25 * HOUR);
    expect(() => checkAllowed(text, "reply", old, now)).toThrow(WindowClosedError);
    expect(() =>
      checkAllowed({ kind: "buttons", body: "b", buttons: [] }, "reply", old, now),
    ).toThrow(WindowClosedError);
    expect(() =>
      checkAllowed({ kind: "list", body: "b", buttonLabel: "x", rows: [] }, "reply", null, now),
    ).toThrow(WindowClosedError);
    expect(() => checkAllowed(template, "reply", old, now)).not.toThrow();
    expect(() => checkAllowed(template, "reply", null, now)).not.toThrow();
  });
});

describe("quiet hours (Asia/Kolkata, tested with UTC times)", () => {
  // IST = UTC + 5:30
  const at = (utc: string) => new Date(`2026-03-10T${utc}:00Z`);
  it("08:59 IST blocked, 09:00 allowed, 20:59 allowed, 21:00 blocked", () => {
    expect(isQuietHours(at("03:29"))).toBe(true); // 08:59 IST
    expect(isQuietHours(at("03:30"))).toBe(false); // 09:00 IST
    expect(isQuietHours(at("15:29"))).toBe(false); // 20:59 IST
    expect(isQuietHours(at("15:30"))).toBe(true); // 21:00 IST
  });
  it("proactive at 22:00 IST is blocked, a reply at 22:00 IST is allowed", () => {
    const t = at("16:30"); // 22:00 IST
    const recent = new Date(t.getTime() - HOUR);
    expect(() => checkAllowed(text, "proactive", recent, t)).toThrow(QuietHoursError);
    expect(() => checkAllowed(text, "reply", recent, t)).not.toThrow();
  });
  it("a proactive template is also blocked in quiet hours", () => {
    expect(() => checkAllowed(template, "proactive", null, at("16:30"))).toThrow(QuietHoursError);
  });
  it("nextAllowedAt is the next 09:00 IST", () => {
    expect(nextAllowedAt(at("16:30")).toISOString()).toBe("2026-03-11T03:30:00.000Z"); // 22:00 -> tomorrow 09:00
    expect(nextAllowedAt(at("01:00")).toISOString()).toBe("2026-03-10T03:30:00.000Z"); // 06:30 -> today 09:00
    try {
      checkAllowed(text, "proactive", new Date(at("16:30").getTime() - HOUR), at("16:30"));
    } catch (e) {
      expect((e as QuietHoursError).nextAllowedAt.toISOString()).toBe("2026-03-11T03:30:00.000Z");
    }
  });
  it("uses India time even across the UTC date line", () => {
    // 20:00 UTC on the 10th = 01:30 IST on the 11th -> quiet, next 09:00 IST is the 11th
    expect(isQuietHours(new Date("2026-03-10T20:00:00Z"))).toBe(true);
    expect(nextAllowedAt(new Date("2026-03-10T20:00:00Z")).toISOString()).toBe(
      "2026-03-11T03:30:00.000Z",
    );
  });
});
