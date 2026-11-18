// Multiple-choice answers on the bot's questions (client, 16 Nov 2026). Every option id is something the
// existing answer readers understand, so a tap works exactly like typing it.
import { interactiveFor } from "./Choices";
import { toBubbles } from "./Bubbles";
import { parseRadius } from "./CentreReplies";
import { statedYearlySpend } from "./ReplyTidy";
import { validateMessage } from "@Service/Oxxy/WhatsappPayload";
import { parseCustomerDate } from "@Service/Oxxy/BookingFlow";

const opts = (m: any) => (m?.kind === "buttons" ? m.buttons : m?.rows ?? []);

describe("multiple-choice options on the bot's questions", () => {
  it("who it is for: 2 buttons", () => {
    const m: any = interactiveFor("Happy to help. Is this for you or a family member?");
    expect(m.kind).toBe("buttons");
    expect(opts(m).map((o: any) => o.title)).toEqual(["For myself", "Family member"]);
  });

  it("yearly spend: a list of ranges whose ids the spend reader turns into a yearly amount", () => {
    const m: any = interactiveFor("To suggest the right plan, roughly how much does your family spend on healthcare in a year?");
    expect(m.kind).toBe("list");
    expect(opts(m)).toHaveLength(7);
    for (const r of opts(m)) expect(statedYearlySpend(r.id)).toBeGreaterThan(0);
    expect(statedYearlySpend(opts(m)[1].id)).toBe(17500);
  });

  it("travel distance: 3 buttons the radius reader understands", () => {
    const m: any = interactiveFor("How far can the patient travel for this? For example 5 km, 10 km or 20 km.");
    expect(opts(m).map((b: any) => parseRadius(b.id))).toEqual([5, 10, 20]);
  });

  it("need, specialisation, time window and plan follow-up get their options", () => {
    expect((interactiveFor("Happy to help. What consultation, test, medicine, treatment or surgery is needed, and when?") as any).kind).toBe("list");
    expect(opts(interactiveFor("Which doctor specialisation, test or healthcare service should I include in the request?"))).toHaveLength(10);
    expect(opts(interactiveFor("What time or time window would suit you?")).map((b: any) => b.title)).toEqual(["Morning", "Afternoon", "Evening"]);
    expect(opts(interactiveFor("The current price of the Vital plan is ₹1,999 + GST ₹360 = ₹2,359 monthly or ₹20,000 + GST ₹3,600 = ₹23,600 yearly. Would you like the official plan details or help activating it?")).map((b: any) => b.title)).toEqual(["Plan details", "Activate", "Not now"]);
  });

  it("booking date: the next 7 dates from the earliest, each id a date the date reader takes", () => {
    const m: any = interactiveFor("What date would you prefer? It can be from 19 Nov 2026 up to 16 May 2027.");
    expect(m.kind).toBe("list");
    expect(opts(m)[0]).toMatchObject({ id: "19 Nov 2026", title: "Thu 19 Nov" });
    expect(parseCustomerDate(opts(m)[6].id)).toBe("2026-11-25");
  });

  it("callback windows and the centre list become taps on 1, 2, 3", () => {
    const cb: any = interactiveFor("Please choose a convenient time:\n1) Today, 10 am-12 pm\n2) Today, 12-2 pm\n3) Today, 2-4 pm\nReply 1, 2 or 3, or tell me another time.");
    expect(opts(cb).map((b: any) => b.id)).toEqual(["1", "2", "3"]);
    const centres: any = interactiveFor(
      "Based on the patient's area, here are suitable options:\n1. PSG HOSPITAL, PEELAMEDU - COIMBATORE | Multispeciality | about 1.2 km\n2. KMCH HOSPITAL, CHITRA - COIMBATORE | Multispeciality\nI found only 2 verified option(s) in that area.\n\nI have included specialist and multispeciality choices where relevant. Reply with 1 or 2, or send the name of another centre you prefer.",
    );
    expect(centres.kind).toBe("list");
    expect(opts(centres).map((r: any) => r.id)).toEqual(["1", "2"]);
    expect(opts(centres)[0].title.length).toBeLessThanOrEqual(24);
  });

  it("every option set is a message WhatsApp accepts; plain answers stay plain text", () => {
    const qs = [
      "Is this for you or a family member?",
      "Roughly how much does your family spend on healthcare in a year?",
      "Which doctor specialisation, test or healthcare service should I include in the request?",
      "Would you prefer the main benefit or the price first?",
    ];
    for (const q of qs) expect(() => validateMessage(interactiveFor(q) as any)).not.toThrow();
    expect(interactiveFor("Oxxy is a healthcare savings partner.")).toBeNull();
    expect(interactiveFor("Which city and area should I search in?")).toBeNull();
    expect(toBubbles("Thanks. Is this for you or a family member?")[0].kind).toBe("buttons");
    expect(toBubbles("Your booking request is noted.")[0].kind).toBe("text");
  });

  it("Hindi questions get Hindi option titles", () => {
    const m: any = interactiveFor("मरीज़ इसके लिए कितनी दूर तक जा सकते हैं? जैसे 5 km, 10 km या 20 km।");
    expect(opts(m)[0].title).toBe("5 km तक");
  });
});

describe("the LLM's standard discovery questions all get tap options", () => {
  it.each([
    ["Is this for you or a family member?", "buttons"],
    ["What consultation, test, medicine, treatment or surgery is needed?", "list"],
    ["Is this one specific upcoming expense or ongoing support?", "buttons"],
    ["Roughly how much does your family spend on healthcare in a year?", "list"],
    ["Do you have health insurance for this?", "buttons"],
  ])("%s", (q, kind) => {
    expect((interactiveFor(`Thanks. ${q}`) as any)?.kind).toBe(kind);
  });
});
