import client from "./client";
import type { ApiEnvelope } from "../types";

export interface PermissionDef {
  key: string;
  group: string;
  label: string;
}

export interface RoleRow {
  id: string;
  name: string;
  code: string;
  active: boolean;
  builtIn: boolean;
  locked: boolean;
  users: number;
  permissions: string[];
}

export async function listPermissions(): Promise<PermissionDef[]> {
  return (await client.get<PermissionDef[]>("/UserRole/Permissions")).data;
}

export async function listRoles(): Promise<RoleRow[]> {
  return (await client.get<RoleRow[]>("/UserRole/Roles")).data;
}

export async function createRole(v: { name: string; copy_from?: string }): Promise<{ id: string }> {
  return (await client.post<{ id: string }>("/UserRole/Insert", v)).data;
}

export async function updateRole(
  id: string,
  v: { name?: string; permissions?: string[] },
): Promise<ApiEnvelope> {
  return (await client.put<ApiEnvelope>(`/UserRole/Update/${id}`, v)).data;
}

export async function deleteRole(id: string): Promise<ApiEnvelope> {
  return (await client.delete<ApiEnvelope>(`/UserRole/Delete/${id}`)).data;
}
