import client from "./client";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  created_by_name: string | null;
  issued_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  state: "active" | "expired" | "revoked";
}

export interface DeveloperOverview {
  env_key_set: boolean;
  active_keys: number;
  webhook_secret_set: boolean;
  crm_enabled: boolean;
  crm_base_url: string | null;
  expiry_days: number[];
}

export const getOverview = async () =>
  (await client.get<DeveloperOverview>("/Developer/Overview")).data;
export const listApiKeys = async () => (await client.get<ApiKeyRow[]>("/Developer/ApiKeys")).data;
export const createApiKey = async (name: string, expires_in_days: number | null) =>
  (
    await client.post<{
      id: string;
      name: string;
      prefix: string;
      expires_at: string | null;
      key: string;
    }>("/Developer/ApiKeys", { name, expires_in_days })
  ).data;
export const revokeApiKey = async (id: string) =>
  (await client.delete(`/Developer/ApiKeys/${id}`)).data;
export const rotateWebhookSecret = async () =>
  (await client.post<{ secret: string }>("/Developer/WebhookSecret/Rotate")).data;
export const getPostman = async (base_url: string) =>
  (await client.post<unknown>("/Developer/Postman", { base_url })).data;

/** Where the bot's API is reachable, as the client's developers should call it */
export function apiOrigin(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
  try {
    return new URL(env || "/", window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}
