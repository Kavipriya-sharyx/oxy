// Google Maps Platform, used for WHERE things are, never for WHICH centre to suggest (Playbook 10: only the
// verified directory is suggested to a customer).
//  - Geocoding API:      an area or address typed by the customer or the team -> latitude / longitude
//  - Routes API matrix:  road distance and travel time from the customer to the few centres shown
//  - Places API (New):   hospitals / clinics near a spot, ONLY as candidates for the team to verify
// Key: GOOGLE_MAPS_API_KEY (Settings -> Maps). Without it every method returns null / [] and the bot works
// as before (city match and straight-line distance). No call ever throws into the chat; results of the
// geocoder are kept in geo_cache so the same area is paid for once.
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { geo_cache } from "@Database/Table/Oxxy/geo_cache";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}
export interface GeoResult extends GeoPoint {
  formatted: string;
  locality: string | null;
  city: string | null;
  /** true when Google matched only part of the text or only a large region: not safe for a radius search */
  approximate: boolean;
}
export interface TravelInfo {
  distance_km: number;
  minutes: number | null;
}
export interface PlaceCandidate {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
}

const TIMEOUT = 6000;
const INDIA = { south: 6.0, north: 37.5, west: 68.0, east: 97.6 };

/** lower case, one space, no punctuation at the ends: the cache key for "Peelamedu,  Coimbatore." */
export function geoKey(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[\s,]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .slice(0, 200);
}

export const inIndia = (p: GeoPoint) =>
  p.latitude >= INDIA.south &&
  p.latitude <= INDIA.north &&
  p.longitude >= INDIA.west &&
  p.longitude <= INDIA.east;

const component = (r: any, ...types: string[]): string | null => {
  for (const t of types) {
    const c = (r?.address_components ?? []).find((x: any) => (x.types ?? []).includes(t));
    if (c?.long_name) return String(c.long_name);
  }
  return null;
};

/** One Geocoding API result -> our shape (pure, tested without a network) */
export function readGeocode(data: any): GeoResult | null {
  if (data?.status !== "OK") return null;
  const r = data.results?.[0];
  const loc = r?.geometry?.location;
  if (!r || typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
  const point = { latitude: loc.lat, longitude: loc.lng };
  if (!inIndia(point)) return null;
  const types: string[] = r.types ?? [];
  // a whole state or country is not a place to measure a 10 km radius from
  const tooWide = types.some((t) => ["country", "administrative_area_level_1"].includes(t));
  return {
    ...point,
    formatted: String(r.formatted_address ?? ""),
    locality: component(r, "sublocality_level_1", "sublocality", "neighborhood"),
    city: component(r, "locality", "administrative_area_level_3", "administrative_area_level_2"),
    approximate: !!r.partial_match || tooWide,
  };
}

/** Routes API matrix rows -> one entry per destination, in the order asked (pure) */
export function readMatrix(rows: any, count: number): (TravelInfo | null)[] {
  const out: (TravelInfo | null)[] = Array.from({ length: count }, () => null);
  for (const row of Array.isArray(rows) ? rows : []) {
    const i = Number(row?.destinationIndex);
    if (
      !(i >= 0 && i < count) ||
      row?.condition === "ROUTE_NOT_FOUND" ||
      typeof row?.distanceMeters !== "number"
    )
      continue;
    const sec = Number(String(row.duration ?? "").replace(/s$/, ""));
    out[i] = {
      distance_km: Math.round(row.distanceMeters / 100) / 10,
      minutes: Number.isFinite(sec) && sec > 0 ? Math.max(1, Math.round(sec / 60)) : null,
    };
  }
  return out;
}

/** Places API (New) searchNearby -> candidates for the team (pure) */
export function readPlaces(data: any, max = 8): PlaceCandidate[] {
  return (Array.isArray(data?.places) ? data.places : [])
    .filter(
      (p: any) => p?.displayName?.text && (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL",
    )
    .slice(0, max)
    .map((p: any) => ({
      name: String(p.displayName.text).slice(0, 120),
      address: String(p.formattedAddress ?? "").slice(0, 200),
      latitude: typeof p.location?.latitude === "number" ? p.location.latitude : null,
      longitude: typeof p.location?.longitude === "number" ? p.location.longitude : null,
      maps_url: p.googleMapsUri ? String(p.googleMapsUri) : null,
    }));
}

/** A link that opens the spot in Google Maps (no key needed) */
export function mapsLink(p: GeoPoint, label?: string | null): string {
  const q = label ? `${label} @${p.latitude},${p.longitude}` : `${p.latitude},${p.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  constructor(private readonly _Config: ConfigService) {}

  /** why the last geocoding call was refused or failed (a bad key, an API not enabled, no network); null = it worked */
  lastProblem: string | null = null;

  private key(): string {
    return String(this._Config.get<string>("Maps.ApiKey") ?? "").trim();
  }
  private url(host: "maps" | "routes" | "places", path: string): string {
    const base = String(this._Config.get<string>("Maps.ApiBase") ?? "").trim().replace(/\/+$/, "");
    return `${base || `https://${host}.googleapis.com`}${path}`;
  }

  /**
   * One real call to each API with the saved key, for the Go-live check and the "Test the key" button:
   * says exactly which API is not enabled or refused. Nothing is cached and no customer data is sent
   * (a fixed public address).
   */
  async selfTest(): Promise<Record<"geocoding" | "routes" | "places", string>> {
    const out = { geocoding: "no key", routes: "no key", places: "no key" };
    if (!this.key()) return out;
    const why = (e: any) => String(e?.response?.data?.error?.message ?? e?.response?.data?.error_message ?? e?.message ?? "failed").slice(0, 200);
    const a = { latitude: 28.6315, longitude: 77.2167 }; // Connaught Place, New Delhi
    const b = { latitude: 28.6129, longitude: 77.2295 }; // India Gate
    const point = (p: GeoPoint) => ({ waypoint: { location: { latLng: p } } });
    try {
      const res = await axios.get(this.url("maps", "/maps/api/geocode/json"), {
        params: { address: "Connaught Place, New Delhi", region: "in", components: "country:IN", key: this.key() },
        timeout: TIMEOUT,
      });
      out.geocoding = res.data?.status === "OK" ? "ok" : `${res.data?.status}: ${String(res.data?.error_message ?? "").slice(0, 160)}`.trim();
    } catch (e) {
      out.geocoding = why(e);
    }
    try {
      const res = await axios.post(
        this.url("routes", "/distanceMatrix/v2:computeRouteMatrix"),
        { origins: [point(a)], destinations: [point(b)], travelMode: "DRIVE" },
        { headers: { "X-Goog-Api-Key": this.key(), "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,condition" }, timeout: TIMEOUT },
      );
      out.routes = readMatrix(res.data, 1)[0] ? "ok" : "no route returned";
    } catch (e) {
      out.routes = why(e);
    }
    try {
      const res = await axios.post(
        this.url("places", "/v1/places:searchNearby"),
        { includedTypes: ["hospital"], maxResultCount: 1, locationRestriction: { circle: { center: a, radius: 3000 } } },
        { headers: { "X-Goog-Api-Key": this.key(), "X-Goog-FieldMask": "places.displayName" }, timeout: TIMEOUT },
      );
      out.places = Array.isArray(res.data?.places) || res.status === 200 ? "ok" : "no answer";
    } catch (e) {
      out.places = why(e);
    }
    return out;
  }

  get browserKey(): string {
    return String(this._Config.get<string>("Maps.BrowserKey") ?? "").trim();
  }

  get enabled(): boolean {
    return !!this.key() && process.env.NODE_ENV !== "test";
  }

  /** "Peelamedu, Coimbatore" -> the point. Cached for good (an area does not move). null = not found / no key. */
  async geocode(text: string): Promise<GeoResult | null> {
    const key = geoKey(text);
    if (key.length < 3) return null;
    try {
      const hit = await geo_cache.findOne({ where: { query: key } });
      if (hit)
        return hit.found
          ? {
              latitude: Number(hit.latitude),
              longitude: Number(hit.longitude),
              formatted: hit.formatted ?? "",
              locality: hit.locality,
              city: hit.city,
              approximate: hit.approximate,
            }
          : null;
    } catch {
      /* no table yet / no database: ask Google */
    }
    if (!this.enabled) return null;
    let found: GeoResult | null = null;
    try {
      const res = await axios.get(this.url("maps", "/maps/api/geocode/json"), {
        params: {
          address: text.slice(0, 200),
          region: "in",
          components: "country:IN",
          language: "en",
          key: this.key(),
        },
        timeout: TIMEOUT,
      });
      const status = res.data?.status;
      if (status !== "OK" && status !== "ZERO_RESULTS") {
        // a key / quota / billing problem is not "this place does not exist": never cached
        this.logger.warn(
          `geocoding refused: ${status} ${String(res.data?.error_message ?? "").slice(0, 120)}`,
        );
        this.lastProblem = `${status}${res.data?.error_message ? `: ${String(res.data.error_message).slice(0, 160)}` : ""}`;
        return null;
      }
      found = readGeocode(res.data);
      this.lastProblem = null;
    } catch (e) {
      this.logger.warn(`geocoding failed: ${(e as Error).message}`);
      this.lastProblem = (e as Error).message;
      return null;
    }
    try {
      await geo_cache.save(
        geo_cache.create({
          query: key,
          found: !!found,
          latitude: found?.latitude ?? null,
          longitude: found?.longitude ?? null,
          formatted: found?.formatted ?? null,
          locality: found?.locality ?? null,
          city: found?.city ?? null,
          approximate: found?.approximate ?? false,
        } as any),
      );
    } catch {
      /* a second request saved it first: fine */
    }
    return found;
  }

  /** Road distance and drive time from one point to up to 10 places. null entries = unknown. */
  async travel(origin: GeoPoint, destinations: GeoPoint[]): Promise<(TravelInfo | null)[]> {
    const none = destinations.map(() => null);
    if (!this.enabled || !destinations.length || destinations.length > 10) return none;
    const point = (p: GeoPoint) => ({
      waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } },
    });
    try {
      const res = await axios.post(
        this.url("routes", "/distanceMatrix/v2:computeRouteMatrix"),
        { origins: [point(origin)], destinations: destinations.map(point), travelMode: "DRIVE" },
        {
          headers: {
            "X-Goog-Api-Key": this.key(),
            "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,condition",
          },
          timeout: TIMEOUT,
        },
      );
      return readMatrix(res.data, destinations.length);
    } catch (e) {
      this.logger.warn(`route matrix failed: ${(e as Error).message}`);
      return none;
    }
  }

  /** Hospitals and clinics near a point: candidates for the TEAM to verify, never sent to a customer */
  async nearbyCandidates(at: GeoPoint, radiusKm = 5): Promise<PlaceCandidate[]> {
    if (!this.enabled) return [];
    try {
      const res = await axios.post(
        this.url("places", "/v1/places:searchNearby"),
        {
          includedTypes: ["hospital", "medical_lab", "dental_clinic", "doctor"],
          maxResultCount: 10,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: { latitude: at.latitude, longitude: at.longitude },
              radius: Math.min(50, Math.max(1, radiusKm)) * 1000,
            },
          },
        },
        {
          headers: {
            "X-Goog-Api-Key": this.key(),
            "X-Goog-FieldMask":
              "places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus",
          },
          timeout: TIMEOUT,
        },
      );
      return readPlaces(res.data);
    } catch (e) {
      this.logger.warn(`nearby search failed: ${(e as Error).message}`);
      return [];
    }
  }
}
