import client from "./client";
import type { ApiEnvelope } from "../types";

export interface TriggerKpi {
  trigger_id: string;
  fired: number;
  responded: number;
  response_rate: number | null;
  clicked: number;
  declined: number;
  ignored: number;
  opted_out: number;
  opt_out_rate: number | null;
  escalated: number;
  complaint_rate: number | null;
  suppressed: number;
}

type Rated<T> = T & { rate: number | null };

export interface Kpis {
  range: { from: string; to: string };
  trigger_to_response: TriggerKpi[];
  trust_pack_to_continued: Rated<{ sent: number; continued: number }>;
  centre_list_to_booking: Rated<{ lists: number; booked: number }>;
  plan_to_acceptance: Rated<{ recommended: number; accepted: number }>;
  link_to_payment: Rated<{ links: number; paid: number; failed: number }>;
  booking_to_later_activation: Rated<{ bookings_without_activation: number; later_activated: number }>;
  opt_out_and_complaint_by_sequence: {
    journeys: number;
    sequences: { path: string; outcome: "opted_out" | "complaint"; n: number }[];
  };
  callback_resolution: {
    callbacks: number;
    resolved: number;
    activated: number;
    resolution_rate: number | null;
    activation_rate: number | null;
  };
  violations: {
    duplicate_triggers_blocked: number;
    frequency_cap_blocked: number;
    duplicate_replies: number;
    duplicate_triggers_sent: number;
    rescue_over_cap: number;
    total: number;
    target: number;
  };
}

export async function getKpis(from?: string, to?: string): Promise<Kpis> {
  return (await client.get<Kpis>("/Insights/Kpis", { params: { from, to } })).data;
}

export type CustomerRecord = Record<string, unknown>;

export async function getCustomerRecord(customerId: string): Promise<CustomerRecord> {
  return (await client.get<CustomerRecord>(`/Insights/Customers/${customerId}/Record`)).data;
}

export interface AssetRow {
  id: string;
  code: string;
  kind: string;
  title: string;
  url: string;
  language: string;
  trigger_id: string | null;
  template_name: string | null;
  approved: boolean;
  valid_to: string | null;
}

export type AssetInput = Partial<Omit<AssetRow, "id">>;

export async function listAssets(): Promise<AssetRow[]> {
  return (await client.get<AssetRow[]>("/Insights/Assets")).data;
}

export async function createAsset(v: AssetInput): Promise<{ id: string }> {
  return (await client.post<{ id: string }>("/Insights/Assets", v)).data;
}

export async function updateAsset(id: string, v: AssetInput): Promise<ApiEnvelope> {
  return (await client.put<ApiEnvelope>(`/Insights/Assets/${id}`, v)).data;
}
