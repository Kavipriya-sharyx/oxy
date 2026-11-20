import {
  apptDoneCard,
  apptForAsk,
  apptListCard,
  apptThanks,
  apptWhereAsk,
  bookCard,
  cardImage,
  overpayCard,
  readApptTime,
  readBookingFor,
  readAppt,
  writeAppt,
} from "./BookCard";
import { validateMessage } from "./WhatsappPayload";

describe("sequence 2 and 3 cards (client, 20 Nov)", () => {
  afterEach(() => {
    delete process.env.OXXY_OVERPAY_IMAGE_URL;
    delete process.env.OXXY_WELCOME_IMAGE_URL;
  });

  it("every card is a message WhatsApp accepts, in every language", () => {
    process.env.OXXY_WELCOME_IMAGE_URL = "https://oxxy.example.in/logo.png";
    const options = Array.from({ length: 9 }, (_, i) => ({
      n: `A very long hospital name number ${i} that goes on`,
      a: "Some long locality name, A Big City With A Long Name",
      c: i < 3 ? `c${i}` : null,
    }));
    for (const l of ["en", "hi", "hinglish"]) {
      for (const m of [
        overpayCard(l),
        bookCard(l),
        apptWhereAsk(l),
        apptListCard(options, "Lajpat Nagar, New Delhi", l),
        apptListCard(options.slice(3), null, l),
        apptForAsk("Moolchand Hospital", l),
        apptDoneCard(
          { hospital: "Moolchand", date: "2026-12-01", time: "11:00 AM", partner: false },
          l,
        ),
        apptThanks(l),
      ])
        expect(() => validateMessage(m)).not.toThrow();
    }
  });

  it("the list holds at most 9 hospitals + Other hospital (WhatsApp: 10 rows)", () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ n: `H${i}` }));
    const list = apptListCard(options, null, "en") as { rows: { id: string }[] };
    expect(list.rows).toHaveLength(10);
    expect(list.rows.at(-1)!.id).toBe("appt_other");
  });

  it("pictures: own link, else next to the welcome image, else none", () => {
    expect(cardImage("OXXY_OVERPAY_IMAGE_URL", "oxxy-overpay-card.jpg")).toBeUndefined();
    process.env.OXXY_WELCOME_IMAGE_URL = "https://oxxy.sharyx.ai/logo.png";
    expect(cardImage("OXXY_OVERPAY_IMAGE_URL", "oxxy-overpay-card.jpg")).toEqual({
      type: "image",
      link: "https://oxxy.sharyx.ai/oxxy-overpay-card.jpg",
    });
    process.env.OXXY_OVERPAY_IMAGE_URL = "https://cdn.example.in/x.jpg";
    expect(cardImage("OXXY_OVERPAY_IMAGE_URL", "oxxy-overpay-card.jpg")).toEqual({
      type: "image",
      link: "https://cdn.example.in/x.jpg",
    });
  });

  it("reads the time", () => {
    expect(readApptTime("11 am")).toBe("11:00 AM");
    expect(readApptTime("5:30 pm")).toBe("5:30 PM");
    expect(readApptTime("17:00")).toBe("17:00");
    expect(readApptTime("10")).toBe("10:00 AM");
    expect(readApptTime("4")).toBe("4:00 PM");
    expect(readApptTime("evening please")).toBe("Evening");
    expect(readApptTime("hmm")).toBeNull();
  });

  it("reads who the booking is for", () => {
    expect(readBookingFor("appt_self")).toBe("self");
    expect(readBookingFor("Myself")).toBe("self");
    expect(readBookingFor("my father")).toBe("family");
    expect(readBookingFor("appt_family")).toBe("family");
    expect(readBookingFor("ok")).toBeNull();
  });

  it("the draft round-trips; anything else is not a draft", () => {
    expect(readAppt(writeAppt({ step: "date", cn: "X", f: "self" }))).toEqual({
      step: "date",
      cn: "X",
      f: "self",
    });
    expect(readAppt("flow:start")).toBeNull();
    expect(readAppt("appt:{bad")).toBeNull();
  });
});
