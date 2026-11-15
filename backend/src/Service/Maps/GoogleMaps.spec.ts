// Google Maps Platform adapter: the pure readers, and "no key = nothing happens"
import { geo_cache } from "@Database/Table/Oxxy/geo_cache";
import {
  geoKey,
  GoogleMapsService,
  inIndia,
  mapsLink,
  readGeocode,
  readMatrix,
  readPlaces,
} from "./GoogleMaps.service";
import { asksNearby, centreListText } from "@Helper/CentreReplies";
import { buildPayload, validateMessage } from "@Service/Oxxy/WhatsappPayload";

const peelamedu = {
  status: "OK",
  results: [
    {
      formatted_address: "Peelamedu, Coimbatore, Tamil Nadu, India",
      types: ["sublocality_level_1", "sublocality", "political"],
      geometry: { location: { lat: 11.0261, lng: 77.0006 } },
      address_components: [
        { long_name: "Peelamedu", types: ["sublocality_level_1", "sublocality", "political"] },
        { long_name: "Coimbatore", types: ["locality", "political"] },
        { long_name: "Tamil Nadu", types: ["administrative_area_level_1", "political"] },
      ],
    },
  ],
};

describe("geocoding result", () => {
  it("an area: point, locality and city", () => {
    expect(readGeocode(peelamedu)).toEqual({
      latitude: 11.0261,
      longitude: 77.0006,
      formatted: "Peelamedu, Coimbatore, Tamil Nadu, India",
      locality: "Peelamedu",
      city: "Coimbatore",
      approximate: false,
    });
  });
  it("a whole state or a partial match is marked approximate (not used for a radius)", () => {
    const state = {
      status: "OK",
      results: [{ ...peelamedu.results[0], types: ["administrative_area_level_1", "political"] }],
    };
    expect(readGeocode(state)?.approximate).toBe(true);
    const partial = { status: "OK", results: [{ ...peelamedu.results[0], partial_match: true }] };
    expect(readGeocode(partial)?.approximate).toBe(true);
  });
  it("not found, an error status, or a point outside India -> null", () => {
    expect(readGeocode({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(readGeocode({ status: "REQUEST_DENIED" })).toBeNull();
    const london = {
      status: "OK",
      results: [{ ...peelamedu.results[0], geometry: { location: { lat: 51.5, lng: -0.12 } } }],
    };
    expect(readGeocode(london)).toBeNull();
    expect(inIndia({ latitude: 13.08, longitude: 80.27 })).toBe(true);
  });
  it("the cache key ignores case, commas and extra spaces", () => {
    expect(geoKey("  Peelamedu,  Coimbatore. ")).toBe(geoKey("peelamedu coimbatore"));
  });
});

describe("road distance matrix", () => {
  it("one entry per destination, in the order asked; a missing route stays null", () => {
    const rows = [
      {
        originIndex: 0,
        destinationIndex: 1,
        distanceMeters: 2340,
        duration: "540s",
        condition: "ROUTE_EXISTS",
      },
      {
        originIndex: 0,
        destinationIndex: 0,
        distanceMeters: 12890,
        duration: "1500s",
        condition: "ROUTE_EXISTS",
      },
      { originIndex: 0, destinationIndex: 2, condition: "ROUTE_NOT_FOUND" },
    ];
    expect(readMatrix(rows, 3)).toEqual([
      { distance_km: 12.9, minutes: 25 },
      { distance_km: 2.3, minutes: 9 },
      null,
    ]);
    expect(readMatrix(null, 2)).toEqual([null, null]);
  });
});

describe("places near a spot (for the team only)", () => {
  it("open places with a name; closed ones are left out", () => {
    const out = readPlaces({
      places: [
        {
          displayName: { text: "PSG Hospitals" },
          formattedAddress: "Peelamedu, Coimbatore",
          location: { latitude: 11.02, longitude: 77.0 },
          googleMapsUri: "https://maps.google.com/?cid=1",
          businessStatus: "OPERATIONAL",
        },
        { displayName: { text: "Old Clinic" }, businessStatus: "CLOSED_PERMANENTLY" },
        { formattedAddress: "no name" },
      ],
    });
    expect(out).toEqual([
      {
        name: "PSG Hospitals",
        address: "Peelamedu, Coimbatore",
        latitude: 11.02,
        longitude: 77.0,
        maps_url: "https://maps.google.com/?cid=1",
      },
    ]);
    expect(readPlaces({})).toEqual([]);
  });
});

describe("no key", () => {
  it("nothing is called and nothing throws: geocode null, travel nulls, candidates empty", async () => {
    jest.spyOn(geo_cache, "findOne").mockResolvedValue(null as never);
    const svc = new GoogleMapsService({ get: () => undefined } as never);
    expect(svc.enabled).toBe(false);
    expect(await svc.geocode("Peelamedu, Coimbatore")).toBeNull();
    expect(
      await svc.travel({ latitude: 11, longitude: 77 }, [{ latitude: 11.1, longitude: 77.1 }]),
    ).toEqual([null]);
    expect(await svc.nearbyCandidates({ latitude: 11, longitude: 77 })).toEqual([]);
    jest.restoreAllMocks();
  });
  it("a cached area is answered without Google", async () => {
    jest.spyOn(geo_cache, "findOne").mockResolvedValue({
      found: true,
      latitude: 11.0261,
      longitude: 77.0006,
      formatted: "Peelamedu",
      locality: "Peelamedu",
      city: "Coimbatore",
      approximate: false,
    } as never);
    const svc = new GoogleMapsService({ get: () => undefined } as never);
    expect(await svc.geocode("peelamedu coimbatore")).toMatchObject({
      latitude: 11.0261,
      city: "Coimbatore",
    });
    jest.restoreAllMocks();
  });
});

describe("chat side", () => {
  it.each([
    "any hospital near me?",
    "nearby clinic please",
    "paas mein koi hospital hai",
    "nearest lab",
    "hospital pakkathula iruka",
  ])("asks for something nearby: %s", (t) => expect(asksNearby(t)).toBe(true));
  it.each(["what is the price", "my mother is near 70", "book at Apollo hospital"])(
    "not a nearby request: %s",
    (t) => expect(asksNearby(t)).toBe(false),
  );
  it("'nearby' alone counts only inside the centre search", () => {
    expect(asksNearby("nearby")).toBe(false);
    expect(asksNearby("nearby", true)).toBe(true);
  });

  it("the list shows the distance (and drive time) when it is known", () => {
    const text = centreListText(
      [
        {
          name: "ABC Hospital",
          locality: "Peelamedu",
          city: "Coimbatore",
          centre_type: "multispeciality",
          distance_km: 2.34,
          minutes: 9,
        },
        {
          name: "XYZ Clinic",
          locality: "Gandhipuram",
          city: "Coimbatore",
          centre_type: "clinic",
          distance_km: 12.9,
        },
        {
          name: "No Point Lab",
          locality: "RS Puram",
          city: "Coimbatore",
          centre_type: "diagnostic",
        },
      ],
      null,
    );
    expect(text).toContain("1. ABC Hospital - Peelamedu | Multispeciality | about 2.3 km, 9 min");
    expect(text).toContain("2. XYZ Clinic - Gandhipuram | Specialist | about 13 km");
    expect(text).toContain("3. No Point Lab - RS Puram | Specialist\n");
  });

  it("WhatsApp payloads: the Send location button and a centre pin", () => {
    expect(buildPayload("9198", { kind: "location_request", body: "Share the location" })).toEqual({
      messaging_product: "whatsapp",
      to: "9198",
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text: "Share the location" },
        action: { name: "send_location" },
      },
    });
    expect(
      buildPayload("9198", {
        kind: "location",
        latitude: 11.02,
        longitude: 77.0,
        name: "ABC Hospital",
        address: "Peelamedu",
        body: "[Map pin] ABC Hospital",
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      to: "9198",
      type: "location",
      location: { latitude: 11.02, longitude: 77.0, name: "ABC Hospital", address: "Peelamedu" },
    });
    expect(() =>
      validateMessage({ kind: "location", latitude: 0, longitude: 0, name: "x", body: "x" }),
    ).toThrow();
    expect(mapsLink({ latitude: 11.02, longitude: 77 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=11.02%2C77",
    );
  });
});
