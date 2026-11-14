export const ROLE = {
  SuperAdmin: "Super Admin",
  Admin: "Admin",
  User: "User",
} as const;

/** Route -> the permission it needs (null = any signed-in user). Same keys as the backend. */
export const ROUTE_PERMS: Record<string, string | null> = {
  "/dashboard": "dashboard.view",
  "/flows": null,
  "/live-chat": "conversations.read",
  "/escalations": "tasks.work",
  "/activations": "activations.read",
  "/bookings": "bookings.read",
  "/reports": "dashboard.view",
  "/centres": "centres.read",
  "/plan-catalog": "plans.read",
  "/triggers": "triggers.read",
  "/crm-sync": "crm.manage",
  "/users": "users.manage",
  "/roles": "roles.manage",
  "/privacy": "privacy.handle",
  "/audit-log": "audit.read",
  "/settings": "settings.manage",
  "/developer": "developer.manage",
  "/content": "settings.manage",
  "/follow-ups": "conversations.read",
  "/templates": "triggers.read",
  "/go-live": "settings.manage",
};

const LANDING_ORDER = ["/dashboard", "/live-chat", "/bookings", "/centres", "/flows"];

/** The first page this user may open */
export function landingFor(perms: string[] | null | undefined): string {
  const has = (p: string) => {
    const need = ROUTE_PERMS[p];
    return need === null || !!perms?.includes(need);
  };
  return LANDING_ORDER.find(has) ?? "/flows";
}
