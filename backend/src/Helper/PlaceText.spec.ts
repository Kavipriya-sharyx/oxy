// Client chats, 17 Nov: areas typed in a sentence, the "no centre" loop, the callback time read wrong
import { namedPlace, typedArea } from "./CentreReplies";
import { isNoCentreText, isRepeatNoCentreText, noCentreText } from "./PlanReplies";
import { parseCallbackChoice, shownOption } from "@Service/Oxxy/CallbackFlow";

describe("namedPlace: the area named in a sentence", () => {
  it.each([
    ["i would like to know the options near Neelambur, Coimbatore, preferably within a 5 km radius.", { locality: "Neelambur", city: "Coimbatore" }],
    ['options near peelamedu, Coimbatore, preferably within a 5 km radius."', { locality: "Peelamedu", city: "Coimbatore" }],
    ["Please check for available healthcare centres in the SITRA area of Coimbatore.", { locality: "SITRA", city: "Coimbatore" }],
    ["any clinic around gandhipuram", { locality: "Gandhipuram", city: null }],
    ["hospitals in Delhi please", { locality: "Delhi", city: null }],
  ])("%s", (text, want) => expect(namedPlace(text)).toEqual(want));

  it.each([
    "any hospital near me",
    "I am in pain since yesterday",
    "call me in the morning",
    "I am interested in plans",
    "near my home",
    "within 5 km",
    "Delhi, North India. Please help me with the booking there.",
  ])("not a place: %s", (text) => expect(namedPlace(text)).toBeNull());
});

describe("typedArea: a message that is only an area", () => {
  const cities = ["Coimbatore"];
  it("drops the state, finds the known city, keeps the locality", () => {
    expect(typedArea("Tamilnadu, coimbatore", cities)).toEqual({ city: "Coimbatore", locality: null });
    expect(typedArea("coimbatore ,neelambur", cities)).toEqual({ city: "Coimbatore", locality: "Neelambur" });
    expect(typedArea("Peelamedu Coimbatore", cities)).toEqual({ city: "Coimbatore", locality: "Peelamedu" });
    expect(typedArea("Peelamedu, Tiruppur", cities)).toEqual({ city: "Tiruppur", locality: "Peelamedu" });
  });
  it("a question, digits or a long sentence is not an area", () => {
    expect(typedArea("which area do you support?", cities)).toBeNull();
    expect(typedArea("5 km", cities)).toBeNull();
    expect(typedArea("I don't have any specific centre in mind please", cities)).toBeNull();
  });
});

describe("no verified centre: three different lines, never the same one in a loop", () => {
  it("first, 'still', then a short different line", () => {
    const a = noCentreText("Neelambur, Coimbatore", false);
    const b = noCentreText("Neelambur, Coimbatore", true);
    const c = noCentreText("Neelambur, Coimbatore", true, "en", true);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(c).toContain("Our team is already checking centres in Neelambur, Coimbatore");
    expect([a, b, c].every(isNoCentreText)).toBe(true);
    expect(isRepeatNoCentreText(a)).toBe(false);
    expect(isRepeatNoCentreText(b)).toBe(true);
    expect(isRepeatNoCentreText(c)).toBe(true);
  });
});

describe("callback time in words = the window shown", () => {
  const ist = (iso: string) => new Date(`${iso}+05:30`);
  const now = ist("2026-11-17T13:55:00"); // Tuesday
  const options = [
    { from: ist("2026-11-17T16:00:00"), to: ist("2026-11-17T18:00:00") },
    { from: ist("2026-11-17T18:00:00"), to: ist("2026-11-17T19:00:00") },
    { from: ist("2026-11-18T10:00:00"), to: ist("2026-11-18T12:00:00") },
  ];
  const H = { start: 10, end: 19, days: [1, 2, 3, 4, 5, 6] };
  it.each([
    ["today 4 to 6 pm", 0],
    ["4-6pm", 0],
    ["Today, 4-6 pm", 0],
    ["today 6 to 7 pm", 1],
    ["tomorrow 10 am to 12 pm", 2],
    ["tomorrow 10 am", 2],
  ])("%s", (text, i) => {
    expect(shownOption(text, options, now)).toBe(options[i]);
    expect(parseCallbackChoice(text, options, now, H)).toEqual({ window: options[i] });
  });
  it("a question is not a callback time", () => {
    expect(
      parseCallbackChoice("Could you suggest verified centres within 5 km and arrange a booking tomorrow?", options, now, H),
    ).toBeNull();
  });
});
