import { assetLine, chooseAsset } from "./AssetPicker";

const a = (o: Record<string, unknown>) => ({
  id: "x",
  trigger_id: "A",
  language: "en",
  approved: true,
  status: true,
  valid_to: null,
  code: "a",
  ...o,
});
const now = new Date("2026-11-13T10:00:00Z");

describe("approved asset for a content trigger (12.6, 18.1)", () => {
  it("prefers the customer's language, then English", () => {
    const list = [a({ id: "en" }), a({ id: "hi", language: "hi" })];
    expect(chooseAsset(list, "A", "hi", [], now)?.id).toBe("hi");
    expect(chooseAsset(list, "A", "hinglish", [], now)?.id).toBe("en");
  });

  it("never sends an unapproved, expired, removed or already-sent asset, or another trigger's", () => {
    expect(chooseAsset([a({ approved: false })], "A", "en", [], now)).toBeNull();
    expect(chooseAsset([a({ valid_to: "2026-11-01" })], "A", "en", [], now)).toBeNull();
    expect(chooseAsset([a({ status: false })], "A", "en", [], now)).toBeNull();
    expect(chooseAsset([a({ id: "s" })], "A", "en", ["s"], now)).toBeNull();
    expect(chooseAsset([a({ trigger_id: "B" })], "A", "en", [], now)).toBeNull();
    expect(chooseAsset([a({ valid_to: "2027-01-01" })], "A", "en", [], now)?.id).toBe("x");
  });

  it("is one line with the title and the official link", () => {
    expect(assetLine({ title: "About Oxxy", url: "https://oxxy.in/about" })).toBe("About Oxxy: https://oxxy.in/about");
  });
});
