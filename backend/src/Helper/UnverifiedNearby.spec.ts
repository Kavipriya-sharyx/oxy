import { unverifiedNearbyText } from "./CentreReplies";
import { interactiveFor } from "./Choices";
import { isGreeting } from "@Service/Oxxy/HealthConsent";

describe("nearby places from Google Maps (review fix, 20 Nov)", () => {
  const places = [
    { name: "City Care Hospital", address: "12 Avinashi Road, Peelamedu, Coimbatore" },
    { name: "Sri Lab", address: null },
  ];

  it("are marked not verified, are never numbered and claim no discount", () => {
    const t = unverifiedNearbyText(places, "en");
    expect(t).toMatch(/not yet verified by Oxxy/);
    expect(t).toMatch(/^- City Care Hospital \(12 Avinashi Road/m);
    expect(t).toMatch(/^- Sri Lab$/m);
    expect(t).not.toMatch(/^\d+\./m); // a "2" can only pick a verified centre
    expect(t).not.toMatch(/\d+\s*%|discount/i);
  });

  it("alone (no verified centre): asks for a name for the team to check, and is plain text, not a pick list", () => {
    const t = unverifiedNearbyText(places, "en", true);
    expect(t).toMatch(/our team will check it before any booking/);
    expect(interactiveFor(t)).toBeNull();
  });

  it("nothing to show = empty", () => {
    expect(unverifiedNearbyText([], "en")).toBe("");
  });
});

describe("greetings in Indian scripts open the welcome card", () => {
  it.each(["नमस्ते", "नमस्कार!", "வணக்கம்", "hi", "Namaste ji"])("%s", (t) =>
    expect(isGreeting(t)).toBe(true),
  );
  it("a statement is not a greeting", () =>
    expect(isGreeting("I need help with my bills")).toBe(false));
});
