import client from "./client";
import type { Centre } from "../types";

export async function listCentres(): Promise<Centre[]> {
  const res = await client.get<Centre[]>("/Console/Centres");
  return res.data;
}

export async function importCentres(rows: Record<string, unknown>[]): Promise<{ created: number }> {
  const res = await client.post<{ created: number }>("/Console/Centres/Import", { rows });
  return res.data;
}
