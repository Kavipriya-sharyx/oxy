import { useCallback, useState } from "react";
import { clearToken, getToken, setToken } from "../api/client";

interface TokenPayload {
  email?: string;
  user_role_name?: string;
}

function readPayload(token: string | null): TokenPayload | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  const payload = readPayload(token);

  return {
    token,
    isLoggedIn: token !== null,
    email: payload?.email ?? null,
    role: payload?.user_role_name ?? null,
    login,
    logout,
  };
}
