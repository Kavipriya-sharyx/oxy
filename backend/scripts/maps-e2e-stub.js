// Stand-in for Meta's WhatsApp Cloud API and Google Maps Platform (Geocoding, Routes matrix, Places New),
// used by scripts/maps-e2e.js. Run: node scripts/maps-e2e-stub.js (port 8799).
// Records every request; GET /_sent and GET /_google show what the backend really sent.
const http = require("http");
const sent = []; // WhatsApp messages the backend sent
const google = []; // Google calls the backend made
let n = 0;

const PLACES = [
  [/abc hospital|avinashi/i, 11.03, 77.01, "Peelamedu", "Coimbatore"],
  [/peelamedu/i, 11.0261, 77.0006, "Peelamedu", "Coimbatore"],
  [/xyz clinic|gandhipuram/i, 11.0183, 76.9725, "Gandhipuram", "Coimbatore"],
  [/connaught/i, 28.6315, 77.2167, "Connaught Place", "New Delhi"],
  [/velachery/i, 12.9815, 80.218, "Velachery", "Chennai"],
];
const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { /* not json */ }
      if (url.pathname === "/_sent") return json(res, 200, sent);
      if (url.pathname === "/_google") return json(res, 200, google);

      // ---- Google Geocoding
      if (url.pathname === "/maps/api/geocode/json" && url.searchParams.get("latlng")) {
        // reverse geocoding (a shared pin -> its area and city): the nearest known place within 5 km
        const [lat, lng] = url.searchParams.get("latlng").split(",").map(Number);
        google.push({ api: "reverse-geocoding", latlng: url.searchParams.get("latlng"), key: url.searchParams.get("key") });
        if (url.searchParams.get("key") !== "test-key") return json(res, 200, { status: "REQUEST_DENIED", error_message: "The provided API key is invalid." });
        const near = PLACES.map((p) => ({ p, d: km({ latitude: lat, longitude: lng }, { latitude: p[1], longitude: p[2] }) })).sort((a, b) => a.d - b.d)[0];
        if (!near || near.d > 5) return json(res, 200, { status: "ZERO_RESULTS", results: [] });
        const hit = near.p;
        return json(res, 200, {
          status: "OK",
          results: [{
            formatted_address: `${hit[3]}, ${hit[4]}, India`,
            types: ["sublocality_level_1", "sublocality", "political"],
            geometry: { location: { lat, lng } },
            address_components: [
              { long_name: hit[3], short_name: hit[3], types: ["sublocality_level_1", "sublocality", "political"] },
              { long_name: hit[4], short_name: hit[4], types: ["locality", "political"] },
            ],
          }],
        });
      }
      if (url.pathname === "/maps/api/geocode/json") {
        const address = url.searchParams.get("address") || "";
        google.push({ api: "geocoding", address, key: url.searchParams.get("key"), region: url.searchParams.get("region"), components: url.searchParams.get("components") });
        if (url.searchParams.get("key") !== "test-key") return json(res, 200, { status: "REQUEST_DENIED", error_message: "The provided API key is invalid." });
        const hit = PLACES.find((p) => p[0].test(address));
        if (!hit) return json(res, 200, { status: "ZERO_RESULTS", results: [] });
        return json(res, 200, {
          status: "OK",
          results: [{
            formatted_address: `${hit[3]}, ${hit[4]}, India`,
            types: ["sublocality_level_1", "sublocality", "political"],
            geometry: { location: { lat: hit[1], lng: hit[2] } },
            address_components: [
              { long_name: hit[3], types: ["sublocality_level_1", "sublocality", "political"] },
              { long_name: hit[4], types: ["locality", "political"] },
            ],
          }],
        });
      }
      // ---- Google Routes matrix
      if (url.pathname === "/distanceMatrix/v2:computeRouteMatrix") {
        google.push({ api: "routes", key: req.headers["x-goog-api-key"], mask: req.headers["x-goog-fieldmask"], origins: body?.origins?.length, destinations: body?.destinations?.length, travelMode: body?.travelMode });
        if (req.headers["x-goog-api-key"] !== "test-key") return json(res, 403, { error: { message: "API key not valid." } });
        const o = body.origins[0].waypoint.location.latLng;
        return json(res, 200, body.destinations.map((d, i) => {
          const dist = km(o, d.waypoint.location.latLng) * 1.3;
          return { originIndex: 0, destinationIndex: i, distanceMeters: Math.round(dist * 1000), duration: `${Math.round(dist * 180)}s`, condition: "ROUTE_EXISTS" };
        }));
      }
      // ---- Google Places (New)
      if (url.pathname === "/v1/places:searchNearby") {
        google.push({ api: "places", key: req.headers["x-goog-api-key"], mask: req.headers["x-goog-fieldmask"], types: body?.includedTypes, radius: body?.locationRestriction?.circle?.radius });
        if (req.headers["x-goog-api-key"] !== "test-key") return json(res, 403, { error: { message: "API key not valid." } });
        return json(res, 200, {
          places: [
            { displayName: { text: "Stub General Hospital" }, formattedAddress: "1 Main Road, Velachery, Chennai", location: { latitude: 12.98, longitude: 80.22 }, googleMapsUri: "https://maps.google.com/?cid=1", businessStatus: "OPERATIONAL" },
            { displayName: { text: "Stub Dental Care" }, formattedAddress: "5 Lake Street, Velachery, Chennai", location: { latitude: 12.983, longitude: 80.215 }, googleMapsUri: "https://maps.google.com/?cid=2", businessStatus: "OPERATIONAL" },
          ],
        });
      }
      // ---- WhatsApp Cloud API
      if (req.method === "POST" && /\/messages$/.test(url.pathname)) {
        sent.push(body);
        return json(res, 200, { messaging_product: "whatsapp", messages: [{ id: `wamid.STUB${Date.now()}x${++n}` }] });
      }
      if (req.method === "GET") return json(res, 200, { display_phone_number: "+91 00000 00000", verified_name: "Stub Business", quality_rating: "GREEN", data: [] });
      json(res, 404, { error: { message: `stub: no route ${req.method} ${url.pathname}` } });
    });
  })
  .listen(8799, () => console.log("stub on 8799"));
