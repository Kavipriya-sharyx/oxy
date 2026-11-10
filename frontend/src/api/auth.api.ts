import client from "./client";
import type { LoginResponse } from "../types";

// POST /api/v1/Auth/Login  { email, password } -> { Type: "S", Message, result: { api_token } }
export async function login(email: string, password: string): Promise<string> {
  const res = await client.post<LoginResponse>("/Auth/Login", { email, password });
  const token = res.data.result?.api_token;
  if (!token) throw new Error("Login failed");
  return token;
}
