import client from "./client";
import type { ApiEnvelope, Centre } from "../types";

export async function listCentres(): Promise<Centre[]> {
  const res = await client.get<Centre[]>("/Console/Centres");
  return res.data;
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

export async function importCentres(rows: Record<string, unknown>[]): Promise<{ created: number; updated?: number; skipped?: number }> {
  const res = await client.post<{ created: number }>("/Console/Centres/Import", { rows });
  return res.data;
}
