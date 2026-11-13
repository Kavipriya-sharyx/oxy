import { useQuery } from "@tanstack/react-query";
import client, { getToken } from "../api/client";
import { ROUTE_PERMS } from "../auth/roles";

interface Mine {
  role: string | null;
  permissions: string[];
}

/** What the signed-in user may do, from the server (the role's permissions can change at any time). */
export function usePermissions() {
  const token = getToken();
  const q = useQuery({
    queryKey: ["myPermissions", token],
    queryFn: async () => (await client.get<Mine>("/UserRole/MyPermissions")).data,
    enabled: !!token,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const perms = q.data?.permissions ?? [];
  const can = (key: string | null | undefined) => key == null || perms.includes(key);
  const canOpen = (path: string) => can(ROUTE_PERMS[path] ?? null);
  return { loading: q.isLoading, perms, can, canOpen, role: q.data?.role ?? null };
}
