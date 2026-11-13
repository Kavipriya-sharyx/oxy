export const ROLE = {
  SuperAdmin: "Super Admin",
  Admin: "Admin",
  User: "User",
} as const;

export const ALL_ROLES: string[] = [ROLE.SuperAdmin, ROLE.Admin, ROLE.User];
export const ADMIN_UP: string[] = [ROLE.SuperAdmin, ROLE.Admin];
export const SUPER_ONLY: string[] = [ROLE.SuperAdmin];

export const LANDING: Record<string, string> = {
  [ROLE.SuperAdmin]: "/reports",
  [ROLE.Admin]: "/bookings",
  [ROLE.User]: "/live-chat",
};

/** Route -> allowed roles. Single source of truth for routes and the sidebar. */
export const ROUTE_ROLES: Record<string, string[]> = {
  "/live-chat": ALL_ROLES,
  "/bookings": ALL_ROLES,
  "/reports": ALL_ROLES,
  "/centres": ADMIN_UP,
  "/plan-catalog": ADMIN_UP,
  "/triggers": ADMIN_UP,
  "/crm-sync": ADMIN_UP,
  "/users": ADMIN_UP,
  "/privacy": SUPER_ONLY,
  "/audit-log": SUPER_ONLY,
  "/settings": SUPER_ONLY,
};

export function landingFor(role: string | null): string {
  return (role && LANDING[role]) || "/live-chat";
}
