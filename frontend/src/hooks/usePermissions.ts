import { useQuery } from "@tanstack/react-query";
import client, { getToken } from "../api/client";
import { ROLE, ROUTE_PERMS, SUPER_ADMIN_ONLY } from "../auth/roles";

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
  const role = q.data?.role ?? null;
  const can = (key: string | null | undefined) =>
    key == null || (key === SUPER_ADMIN_ONLY ? role === ROLE.SuperAdmin : perms.includes(key));
  const canOpen = (path: string) => can(ROUTE_PERMS[path] ?? null);
  return { loading: q.isLoading, perms, can, canOpen, role };
}
