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
  callback_from?: string | null; // the window the customer chose (Trigger O)
  callback_to?: string | null;
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

/** Urgent cases still open (emergency, self-harm, urgent complaint / payment), newest first */
export interface UrgentAlert {
  task_id: string;
  type: string;
  label: string;
  status: string;
  handled_by: string | null;
  conversation_id: string | null;
  customer: { first_name: string | null; wa_number: string } | null;
  created_at: string;
}

export async function getUrgentAlerts(): Promise<UrgentAlert[]> {
  return (await client.get<UrgentAlert[]>("/Console/UrgentAlerts")).data;
}
