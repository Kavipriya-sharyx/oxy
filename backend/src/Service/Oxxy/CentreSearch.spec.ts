import { normaliseSpecialisation, rankCentres, FoundCentre } from "./CentreSearch.service";
import { centreListText, parseRadius } from "@Helper/CentreReplies";

const c = (o: Partial<FoundCentre>): FoundCentre =>
  ({ id: o.name, centre_type: "clinic", specialisations: [], city: "Chennai", ...o }) as FoundCentre;

describe("Playbook 10 search", () => {
  it("customers' words map to the directory's specialisations", () => {
    expect(normaliseSpecialisation("eye check-up")).toBe("ophthalmology");
    expect(normaliseSpecialisation("Ophthalmology")).toBe("ophthalmology");
    expect(normaliseSpecialisation("dentist")).toBe("dental");
    expect(normaliseSpecialisation("skin problem")).toBe("dermatology");
    expect(normaliseSpecialisation("knee pain")).toBe("orthopaedics");
    expect(normaliseSpecialisation("")).toBeNull();
  });

  it("the customer's locality first, then distance from it, within the radius", () => {
    const list = [
      c({ name: "Far", locality: "Tambaram", latitude: 12.92, longitude: 80.12 }),
      c({ name: "Near", locality: "Kilpauk", latitude: 13.08, longitude: 80.24 }),
      c({ name: "Home", locality: "Anna Nagar", latitude: 13.085, longitude: 80.21 }),
    ];
    const r = rankCentres(list, { locality: "Anna Nagar", radiusKm: 10 });
    expect(r.map((x) => x.name)).toEqual(["Home", "Near"]); // Tambaram is ~20 km away
  });

  it("at most five, and both specialist and multispeciality choices when relevant", () => {
    const list = [
      ...[1, 2, 3, 4, 5, 6].map((i) => c({ name: `Eye ${i}`, centre_type: "specialist" })),
      c({ name: "Zeta Multispeciality", centre_type: "multispeciality" }),
    ];
    const r = rankCentres(list, { specialisation: "ophthalmology" });
    expect(r).toHaveLength(5);
    expect(r.some((x) => x.centre_type === "multispeciality")).toBe(true);
  });
});

describe("Playbook 10.1 presentation and radius", () => {
  it("cards show name, locality, type and relevance; fewer than five is said plainly", () => {
    const t = centreListText(
      [{ name: "Sample Eye Hospital", branch: "Adyar", locality: "Adyar", centre_type: "specialist" }],
      "ophthalmology",
      "en",
    );
    expect(t).toMatch(/1\. Sample Eye Hospital, Adyar - Adyar \| Specialist \| Relevant for ophthalmology/);
    expect(t).toMatch(/only 1 verified option/);
    expect(t).toMatch(/Reply with 1-5/);
    expect(t).not.toMatch(/tie-?up|discount|network/i);
  });
  it.each([
    ["10 km", 10],
    ["5", 5],
    ["nearby please", 5],
    ["anywhere in the city", 25],
    ["koi bhi", 25],
    ["what do you mean?", null],
  ])("%s -> %s", (t, km) => expect(parseRadius(t)).toBe(km));
});
