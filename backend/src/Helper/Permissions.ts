import { SetMetadata } from "@nestjs/common";
import { RoleEnum } from "@Helper/Enum/RoleEnum";

// Every permission the console knows. A role holds a list of these keys (user_role.permission).
// Super Admin always holds all of them; its permissions cannot be changed.
export const PERMISSIONS = [
  { key: "dashboard.view", group: "Work", label: "See the dashboard and reports" },
  { key: "conversations.read", group: "Work", label: "Read conversations" },
  { key: "conversations.reply", group: "Work", label: "Reply to customers and take over from the bot" },
  { key: "bookings.read", group: "Work", label: "See booking requests" },
  { key: "bookings.confirm", group: "Work", label: "Confirm bookings (only when the CRM is off)" },
  { key: "tasks.work", group: "Work", label: "Work escalations (claim, done)" },
  { key: "activations.read", group: "Work", label: "See activations" },
  { key: "activations.record", group: "Work", label: "Record a payment result (only when the CRM is off)" },
  { key: "centres.read", group: "Directory", label: "See centres" },
  { key: "centres.edit", group: "Directory", label: "Add, edit and remove centres" },
  { key: "plans.read", group: "Control", label: "See plans and prices" },
  { key: "triggers.read", group: "Control", label: "See triggers A–R" },
  { key: "crm.manage", group: "Admin", label: "See CRM sync and retry calls" },
  { key: "privacy.handle", group: "Admin", label: "Handle data requests (DPDP)" },
  { key: "audit.read", group: "Admin", label: "Read the audit log" },
  { key: "settings.manage", group: "Admin", label: "Change configuration and API keys" },
  { key: "users.manage", group: "Admin", label: "Add, edit, suspend and delete users" },
  { key: "roles.manage", group: "Admin", label: "Add roles and change permissions" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export const ALL_PERMISSIONS: string[] = PERMISSIONS.map((p) => p.key);

// Defaults for the built-in roles (used until someone changes them in the Roles page)
export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  [RoleEnum.SuperAdmin]: ALL_PERMISSIONS,
  // Admin: every create / read / update / delete in the console, including users and roles
  [RoleEnum.Admin]: ALL_PERMISSIONS,
  // User = sales agent: chats, bookings, escalations; reads the directory and plans
  [RoleEnum.User]: [
    "dashboard.view",
    "conversations.read",
    "conversations.reply",
    "bookings.read",
    "tasks.work",
    "activations.read",
    "centres.read",
    "plans.read",
    "triggers.read",
  ],
};

export const BUILT_IN_ROLES: string[] = [RoleEnum.SuperAdmin, RoleEnum.Admin, RoleEnum.User];

// The permissions a role really has: Super Admin = all; a saved list (unknown keys dropped);
// else the built-in default; else nothing.
export function permissionsOf(role: { name?: string | null; permission?: unknown } | null | undefined): string[] {
  if (!role) return [];
  if (role.name === RoleEnum.SuperAdmin) return ALL_PERMISSIONS;
  if (Array.isArray(role.permission)) return role.permission.filter((k) => ALL_PERMISSIONS.includes(k));
  return DEFAULT_PERMISSIONS[role.name ?? ""] ?? [];
}

export const PERMISSION_KEY = "permission";
/** The route needs ALL of these permissions. */
export const Permission = (...keys: PermissionKey[]) => SetMetadata(PERMISSION_KEY, keys);
