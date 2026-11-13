import client from "./client";
import type { ApiEnvelope, AuditLogRow, CrmOutboxRow, CrmWebhookEvent } from "../types";

export async function listOutbox(): Promise<CrmOutboxRow[]> {
  const res = await client.get<CrmOutboxRow[]>("/CrmAdmin/Outbox");
  return res.data;
}

export async function listWebhooks(): Promise<CrmWebhookEvent[]> {
  const res = await client.get<CrmWebhookEvent[]>("/CrmAdmin/Webhooks");
  return res.data;
}

export async function retryOutbox(id: string): Promise<ApiEnvelope> {
  const res = await client.put<ApiEnvelope>(`/CrmAdmin/Retry/${id}`);
  return res.data;
}

export async function listAuditLogs(action?: string, table?: string): Promise<AuditLogRow[]> {
  const params: Record<string, string> = {};
  if (action) params.action = action;
  if (table) params.table = table;
  const res = await client.get<AuditLogRow[]>("/Console/AuditLogs", { params });
  return res.data;
}

export async function getReports(): Promise<Record<string, number>> {
  const res = await client.get<Record<string, number>>("/Console/Reports");
  return res.data;
}

export interface TriggerEvent {
  id: string;
  trigger_id: string;
  customer_id: string;
  reason: string | null;
  suppression_reason: string | null;
  customer?: { wa_number: string; first_name: string | null };
}

export interface PrivacyRow {
  id?: string;
  customer_id: string;
  privacy_request_at: string | null;
  health_data_consent: boolean;
  marketing_consent: boolean;
  erased_at?: string | null;
  customer?: { wa_number: string; first_name: string | null };
}

export async function getTriggers(): Promise<{
  catalog: { id: string; name: string; when: string }[];
  events: TriggerEvent[];
}> {
  const res = await client.get("/Console/Triggers");
  return res.data;
}

export async function listPrivacyRequests(): Promise<PrivacyRow[]> {
  const res = await client.get<PrivacyRow[]>("/Console/PrivacyRequests");
  return res.data;
}
