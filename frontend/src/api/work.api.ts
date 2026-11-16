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
  case_ref?: string; // the reference the customer was given, e.g. CB-498A3BD2
  callback_from?: string | null; // the window the customer chose (Trigger O)
  callback_to?: string | null;
  created_on?: string;
  outcome?: string | null;
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
  price?: number | string | null; // saved when the link was sent
  gst_rate?: number | string | null;
  catalog?: { price: number; gst_rate?: number | string } | null;
}

export interface ActivationSummary {
  active: number;
  unpaid: number;
  failed: number;
  total: number;
  collected_net: number;
  collected_gross: number;
}

export interface TaskSummary {
  open: number;
  urgent: number;
  unassigned: number;
  in_progress: number;
  mine: number;
}
export interface TaskFilters {
  q?: string;
  type?: string;
  priority?: string;
  mine?: boolean;
}

export async function listTasks(
  view: string,
  f: TaskFilters = {},
): Promise<{ crmEnabled: boolean; rows: TaskRow[]; summary?: TaskSummary }> {
  return (
    await client.get("/Console/Tasks", {
      params: {
        view,
        q: f.q || undefined,
        type: f.type || undefined,
        priority: f.priority || undefined,
        mine: f.mine ? "1" : undefined,
      },
    })
  ).data;
}

export async function updateTask(
  id: string,
  action: "claim" | "done",
  outcome?: string,
): Promise<ApiEnvelope> {
  return (await client.put<ApiEnvelope>(`/Console/Tasks/${id}`, { action, outcome })).data;
}

export async function listActivations(
  status?: string,
  q?: string,
): Promise<{ crmEnabled: boolean; rows: ActivationRow[]; summary?: ActivationSummary }> {
  return (
    await client.get("/Console/Activations", {
      params: { status: status || undefined, q: q || undefined },
    })
  ).data;
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
