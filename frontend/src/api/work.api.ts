import client from "./client";
import type { ApiEnvelope, Customer } from "../types";

export interface TaskRow {
  id: string;
  type: string;
  task_status: string;
  priority: string;
  summary: string | null;
  customer_id: string | null;
  conversation_id: string | null;
  crm_task_id: string | null;
  created_on?: string;
  customer?: Customer | null;
  assigned_to?: { first_name: string | null; email: string } | null;
}

export interface ActivationRow {
  id: string;
  customer_id: string;
  product: string;
  plan: string;
  billing: string;
  link_sent_at: string | null;
  payment_status: string;
  activation_status: string;
  crm_activation_id: string | null;
  created_on?: string;
  customer?: Customer | null;
  catalog?: { price: number } | null;
}

export async function listTasks(view: string): Promise<{ crmEnabled: boolean; rows: TaskRow[] }> {
  return (await client.get("/Console/Tasks", { params: { view } })).data;
}

export async function updateTask(id: string, action: "claim" | "done"): Promise<ApiEnvelope> {
  return (await client.put<ApiEnvelope>(`/Console/Tasks/${id}`, { action })).data;
}

export async function listActivations(): Promise<{ crmEnabled: boolean; rows: ActivationRow[] }> {
  return (await client.get("/Console/Activations")).data;
}

export async function setActivationResult(
  id: string,
  result: "paid" | "failed",
): Promise<ApiEnvelope> {
  return (await client.put<ApiEnvelope>(`/Console/Activations/${id}`, { result })).data;
}
