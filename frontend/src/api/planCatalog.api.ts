import client from "./client";
import type { PlanCatalog } from "../types";

export async function listPlanCatalog(): Promise<PlanCatalog[]> {
  const res = await client.get<PlanCatalog[]>("/Console/PlanCatalog");
  return res.data;
}
