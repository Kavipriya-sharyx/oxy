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

export interface AuditFilters {
  action?: string;
  table?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
}
export interface AuditList {
  rows: (AuditLogRow & { user_name?: string | null; details?: unknown })[];
  total: number;
  page_size: number;
  tables: string[];
}
export async function listAuditLogs(f: AuditFilters = {}): Promise<AuditList> {
  const res = await client.get<AuditList>("/Console/AuditLogs", {
    params: {
      action: f.action || undefined,
      table: f.table || undefined,
      q: f.q || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      page: f.page || undefined,
    },
  });
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

export interface TrendDay {
  date: string;
  conversations: number;
  bookings: number;
  activations: number;
}
/** Last 7 India-time days of new chats, booking requests and activations, oldest first */
export async function getTrend(): Promise<TrendDay[]> {
  return (await client.get<TrendDay[]>("/Console/Trend")).data;
}

export interface ReportDetail {
  range: { from: string; to: string };
  daily: { date: string; conversations: number; bookings: number; activations: number }[];
  centres: {
    name: string;
    branch: string | null;
    city: string;
    bookings: number;
    confirmed: number;
    avg_confirm_hours: number | null;
  }[];
  /** null for users who are not Admin or Super Admin */
  people: { name: string; claimed: number; closed: number; avg_hours: number | null }[] | null;
}
export async function getReportDetail(from?: string, to?: string): Promise<ReportDetail> {
  return (
    await client.get<ReportDetail>("/Console/ReportDetail", {
      params: { from: from || undefined, to: to || undefined },
    })
  ).data;
}
