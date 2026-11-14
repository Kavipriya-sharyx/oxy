import client from "./client";

// ---- Follow-ups ----
export interface FollowUpRow {
  id: string;
  kind: "agreed_follow_up" | "rescue" | "trigger_q" | "booking_update" | string;
  scheduled_for: string;
  follow_up_status: string;
  skip_reason: string | null;
  template_name: string | null;
  reason: string | null;
  selected_product: string | null;
  source: string | null;
  conversation_id: string | null;
  created_on?: string;
  customer?: { id: string; first_name: string | null; wa_number: string };
}
export async function listFollowUps(status: string): Promise<FollowUpRow[]> {
  return (await client.get<FollowUpRow[]>("/Console/FollowUps", { params: { status } })).data;
}
export async function cancelFollowUp(id: string) {
  return (await client.post(`/Console/FollowUps/${id}/Cancel`)).data;
}

// ---- WhatsApp templates ----
export interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string | null;
  purpose: string | null;
  meta_status: string;
  meta_id: string | null;
  last_synced_at: string | null;
  note: string | null;
}
export const TEMPLATE_STATUSES = ["draft", "submitted", "approved", "rejected", "paused", "disabled"];
export async function listTemplates(): Promise<TemplateRow[]> {
  return (await client.get<TemplateRow[]>("/Console/Templates")).data;
}
export async function updateTemplate(id: string, body: { meta_status?: string; note?: string }) {
  return (await client.put(`/Console/Templates/${id}`, body)).data;
}
export async function syncTemplates(): Promise<{ seen: number; added: number }> {
  return (await client.post<{ seen: number; added: number }>("/Console/Templates/Sync")).data;
}

// ---- Plan changes (two-person rule) ----
export interface PlanChangeRow {
  id: string;
  catalog_id: string;
  changes: Record<string, unknown>;
  before: Record<string, unknown> | null;
  reason: string;
  change_status: "pending" | "approved" | "rejected" | "withdrawn" | string;
  requested_by_id: string;
  decided_by_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_version: number | null;
  created_on?: string;
}
export async function listPlanChanges(): Promise<PlanChangeRow[]> {
  return (await client.get<PlanChangeRow[]>("/Console/PlanChanges")).data;
}
export async function proposePlanChange(body: { catalog_id: string; changes: Record<string, unknown>; reason: string }) {
  return (await client.post("/Console/PlanChanges", body)).data;
}
export async function decidePlanChange(id: string, action: "Approve" | "Reject" | "Withdraw", note?: string) {
  return (await client.post(`/Console/PlanChanges/${id}/${action}`, { note })).data;
}

// ---- Nightly jobs ----
type Counts = { bookings?: number; tasks?: number; activations?: number };
export interface JobSummary {
  reason?: string;
  error?: string;
  // CRM reconciliation
  bot_open?: Counts;
  crm_open?: Counts;
  outbox?: { dead?: number; stuck?: number };
  mismatch_count?: number;
  mismatches?: {
    kind: string;
    issue: string;
    bot_id: string | null;
    crm_id: string | null;
    bot_status: string | null;
    crm_status: string | null;
  }[];
  // data retention
  days?: number;
  checked?: number;
  due?: number;
  erased?: number;
  kept?: Record<string, number>;
}
export interface JobRun {
  id: string;
  kind: string;
  job_status: "running" | "ok" | "failed" | "skipped" | string;
  started_at: string;
  finished_at: string | null;
  summary: JobSummary | null;
  triggered_by_id: string | null;
}
export async function listReconciliation(): Promise<JobRun[]> {
  return (await client.get<JobRun[]>("/Console/Jobs/Reconciliation")).data;
}
export async function runReconciliation(): Promise<JobRun> {
  return (await client.post<JobRun>("/Console/Jobs/Reconciliation/Run")).data;
}
export async function getRetention(): Promise<{ days: number | null; runs: JobRun[] }> {
  return (await client.get<{ days: number | null; runs: JobRun[] }>("/Console/Jobs/Retention")).data;
}
export async function runRetention(): Promise<JobRun> {
  return (await client.post<JobRun>("/Console/Jobs/Retention/Run")).data;
}
export async function eraseCustomer(customerId: string) {
  return (await client.post(`/Console/PrivacyRequests/${customerId}/Erase`)).data;
}

// ---- Go-live check (real state of the system, no sample data) ----
export interface GoLiveCheck {
  area: string;
  item: string;
  status: "ok" | "warn" | "blocker";
  detail: string;
  fix?: string;
}
export interface GoLiveReport {
  ready: boolean;
  blockers: number;
  warnings: number;
  checked_at: string;
  checks: GoLiveCheck[];
}
export async function getGoLive(): Promise<GoLiveReport> {
  return (await client.get<GoLiveReport>("/Console/GoLive")).data;
}
