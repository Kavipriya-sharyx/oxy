import client from "./client";
import type { ApiEnvelope } from "../types";

export interface RoleRow {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  mobile: string | null;
  status: boolean;
  user_role_id: string;
  user_role?: RoleRow;
}

export interface UserInput {
  user_role_id: string;
  first_name: string;
  last_name?: string;
  email: string;
  password?: string;
  mobile?: string;
}

export async function listUsers(): Promise<UserRow[]> {
  return (await client.get<UserRow[]>("/User/List")).data;
}

export async function assignableRoles(): Promise<RoleRow[]> {
  return (await client.get<RoleRow[]>("/UserRole/Assignable")).data;
}

export async function insertUser(v: UserInput): Promise<ApiEnvelope> {
  return (await client.post<ApiEnvelope>("/User/Insert", v)).data;
}

export async function updateUser(id: string, v: UserInput): Promise<ApiEnvelope> {
  return (await client.put<ApiEnvelope>(`/User/Update/${id}`, v)).data;
}

export async function toggleUser(id: string): Promise<ApiEnvelope> {
  return (await client.patch<ApiEnvelope>(`/User/SuspendOrActivate/${id}`)).data;
}

export async function deleteUser(id: string): Promise<ApiEnvelope> {
  return (await client.delete<ApiEnvelope>(`/User/Delete/${id}`)).data;
}
