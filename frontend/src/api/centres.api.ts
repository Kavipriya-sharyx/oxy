import client from "./client";
import type { ApiEnvelope, Centre } from "../types";

export interface CentreFilters {
  q?: string;
  city?: string;
  type?: string;
  spec?: string;
  state?: string;
  page?: number;
}
export interface CentreList {
  rows: Centre[];
  total: number;
  page_size: number;
  summary: { total: number; live: number; hidden: number; stale: number; no_point: number };
  cities: string[];
}
export async function listCentres(f: CentreFilters = {}): Promise<CentreList> {
  const res = await client.get<CentreList>("/Console/Centres", {
    params: {
      q: f.q || undefined,
      city: f.city || undefined,
      type: f.type || undefined,
      spec: f.spec || undefined,
      state: f.state || undefined,
      page: f.page || undefined,
    },
  });
  return res.data;
}
/** Every centre, not paged: for Export CSV */
export async function exportCentres(): Promise<Centre[]> {
  return (await client.get<Centre[]>("/Console/Centres/Export")).data;
}
export async function bulkCentres(ids: string[], action: "hide" | "show" | "verify" | "delete") {
  return (await client.post<{ updated: number }>("/Console/Centres/Bulk", { ids, action })).data;
}

export type CentreInput = Omit<Centre, "id">;

export async function createCentre(v: CentreInput): Promise<Centre> {
  return (await client.post<Centre>("/Console/Centres", v)).data;
}

export async function updateCentre(id: string, v: CentreInput): Promise<Centre> {
  return (await client.put<Centre>(`/Console/Centres/${id}`, v)).data;
}

export async function deleteCentre(id: string): Promise<ApiEnvelope> {
  return (await client.delete<ApiEnvelope>(`/Console/Centres/${id}`)).data;
}

export async function importCentres(
  rows: Record<string, unknown>[],
): Promise<{ created: number; updated?: number; skipped?: number }> {
  const res = await client.post<{ created: number }>("/Console/Centres/Import", { rows });
  return res.data;
}

// ---- Google Maps: the point for an address, and the directory on a map ----
export interface GeoResult {
  latitude: number;
  longitude: number;
  formatted: string;
  locality: string | null;
  city: string | null;
  approximate: boolean;
}
export async function geocodeCentre(address: string): Promise<GeoResult> {
  return (await client.post<GeoResult>("/Console/Centres/Geocode", { address })).data;
}
export interface CentresMapData {
  maps_enabled: boolean;
  /** Maps JavaScript API key saved in Configuration -> Maps (null = not set) */
  browser_key: string | null;
  centres: {
    id: string;
    name: string;
    branch: string | null;
    locality: string | null;
    city: string | null;
    centre_type: string | null;
    latitude: number | null;
    longitude: number | null;
    verified: boolean;
    active: boolean;
  }[];
  gaps: { place: string; requests: number; latitude: number | null; longitude: number | null }[];
}
export async function getCentresMap(): Promise<CentresMapData> {
  return (await client.get<CentresMapData>("/Console/Centres/Map")).data;
}

/** One real call per Google API with the saved server key: "ok" or what Google answered */
export async function testMapsKey(): Promise<Record<"geocoding" | "routes" | "places", string>> {
  return (
    await client.post<Record<"geocoding" | "routes" | "places", string>>("/Console/Maps/Test")
  ).data;
}
