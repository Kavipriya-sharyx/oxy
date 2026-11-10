import axios, { AxiosError } from "axios";
import type { ApiEnvelope } from "../types";

export const TOKEN_KEY = "oxxy_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function isEnvelope(data: unknown): data is ApiEnvelope {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (d.Type === "S" || d.Type === "E") && typeof d.Message === "string";
}

function logout(): void {
  clearToken();
  if (window.location.pathname !== "/login") window.location.assign("/login");
}

// VITE_API_URL has no trailing slash; the backend is versioned under /api/v1
const client = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/v1`,
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => {
    const data: unknown = response.data;
    // The backend returns HTTP 200 even for errors: { Type: "E", Message }
    if (isEnvelope(data) && data.Type === "E") {
      if (data.Message === "Unauthorized") logout();
      return Promise.reject(new Error(data.Message));
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) logout();
    return Promise.reject(error);
  },
);

export default client;
