import client from "./client";

export interface SettingItem {
  key: string;
  label: string;
  group: "whatsapp" | "ai" | "crm";
  type: "string" | "boolean" | "select";
  secret: boolean;
  isSet: boolean;
  value: string | boolean;
  options?: { value: string; label: string }[]; // type "select" only
  placeholder?: string;
}

export async function getSettings(): Promise<SettingItem[]> {
  const res = await client.get<SettingItem[]>("/Console/Settings");
  return res.data;
}

export async function updateSettings(
  values: Record<string, string | boolean>,
): Promise<{ updated: number; items: SettingItem[] }> {
  const res = await client.put<{ updated: number; items: SettingItem[] }>("/Console/Settings", {
    values,
  });
  return res.data;
}

