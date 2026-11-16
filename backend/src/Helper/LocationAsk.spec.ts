// The "Send location" question when the area is already known, and how its answer is read.
import { agreesToShare, declinesLocation, locationAskText, onlyRadius, LOCATION_ASK_T } from "./CentreReplies";
import { rankCentres, FoundCentre } from "@Service/Oxxy/CentreSearch.service";

describe("the location question", () => {
  it("with the area: NO keeps it; without: the area can be typed", () => {
    expect(locationAskText("Peelamedu, Coimbatore")).toContain("Or reply NO and I will search in Peelamedu, Coimbatore.");
    expect(locationAskText(null)).toBe(LOCATION_ASK_T.en);
    expect(locationAskText("Peelamedu, Coimbatore", "hi")).toContain("Peelamedu, Coimbatore");
  });

  it.each(["no", "No", "nope", "skip", "not now", "I can't share my location", "dont want to send location", "search in the same area", "use that area only", "nahi", "नहीं"])(
    "'%s' declines",
    (t) => expect(declinesLocation(t)).toBe(true),
  );
  it.each(["Noida sector 62", "Nagpur", "Peelamedu Coimbatore", "Namakkal", "ok", "10 km", "RS Puram"])("'%s' is not a decline", (t) =>
    expect(declinesLocation(t)).toBe(false),
  );
  it("yes / ok alone = will share; a radius alone = the distance", () => {
    expect(agreesToShare("ok")).toBe(true);
    expect(agreesToShare("Yes.")).toBe(true);
    expect(agreesToShare("ok Peelamedu")).toBe(false);
    expect(onlyRadius("10 km")).toBe(true);
    expect(onlyRadius("5")).toBe(true);
    expect(onlyRadius("10 km from Gandhipuram")).toBe(false);
  });
});

describe("a pin never brings a centre without a map point from another city", () => {
  const c = (o: Record<string, unknown>) => ({ centre_type: "multispeciality", locality: null, latitude: null, longitude: null, ...o }) as unknown as FoundCentre;
  const list = () => [
    c({ id: "1", name: "Near", city: "Coimbatore", latitude: 11.03, longitude: 77.01 }),
    c({ id: "2", name: "Far", city: "Chennai", latitude: 13.08, longitude: 80.27 }),
    c({ id: "3", name: "No point, other city", city: "Delhi" }),
    c({ id: "4", name: "No point, same city", city: "Coimbatore" }),
  ];
  it("pin + the city known: measured centres inside the radius, and unmeasured ones of that city only", () => {
    const got = rankCentres(list(), { latitude: 11.0261, longitude: 77.0006, radiusKm: 10, city: "Coimbatore" }).map((x) => x.name);
    expect(got).toEqual(["Near", "No point, same city"]);
  });
  it("pin + no city known: measured centres only", () => {
    const got = rankCentres(list(), { latitude: 11.0261, longitude: 77.0006, radiusKm: 10 }).map((x) => x.name);
    expect(got).toEqual(["Near"]);
  });
});
