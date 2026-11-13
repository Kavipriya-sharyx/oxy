import { activationAfter, paymentReplyKind } from "./ChatPipeline.service";
import { freshTimestamp } from "@Controller/Crm/CrmWebhook.controller";

describe("payment replies after the activation link (plan 12.5)", () => {
  it.each([
    ["DONE", "done"],
    ["done.", "done"],
    ["Paid", "done"],
    ["payment ho gaya", "done"],
    ["हो गया", "done"],
    ["payment failed", "failed"],
    ["Transaction declined", "failed"],
    ["payment nahi hua", "failed"],
    ["not now", "not_now"],
    ["baad mein", "not_now"],
  ])("%s -> %s", (text, kind) => {
    expect(paymentReplyKind(text)).toBe(kind);
  });

  it("leaves questions and long messages to the normal turn", () => {
    expect(paymentReplyKind("is the payment page safe?")).toBeNull();
    expect(paymentReplyKind("done with the call, now tell me how the plan works for my mother")).toBeNull();
    expect(paymentReplyKind("")).toBeNull();
  });
});

describe("timing caution after a booking (plan 12.4)", () => {
  const now = new Date("2026-11-13T06:00:00Z");
  it("warns when the requested date is before activation can finish", () => {
    expect(activationAfter("2026-11-17", "5 to 10 working days", now)).toBe(true);
  });
  it("stays quiet when there is enough time", () => {
    expect(activationAfter("2027-01-10", "5 to 10 working days", now)).toBe(false);
  });
  it("ignores an activation time without a number", () => {
    expect(activationAfter("2026-11-17", "immediate", now)).toBe(false);
  });
});

describe("CRM webhook timestamp (plan 3.3)", () => {
  const now = Date.parse("2026-11-13T06:00:00Z");
  it("accepts a fresh timestamp in seconds, ms or ISO", () => {
    expect(freshTimestamp(String(now / 1000 - 60), now)).toBe(true);
    expect(freshTimestamp(String(now - 1000), now)).toBe(true);
    expect(freshTimestamp("2026-11-13T05:58:00Z", now)).toBe(true);
  });
  it("refuses missing, junk or older than 5 minutes", () => {
    expect(freshTimestamp(undefined, now)).toBe(false);
    expect(freshTimestamp("abc", now)).toBe(false);
    expect(freshTimestamp(String(now / 1000 - 301), now)).toBe(false);
  });
});
