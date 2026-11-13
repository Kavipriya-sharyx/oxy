export enum RoleEnum {
  SuperAdmin = "Super Admin",
  Admin = "Admin",
  User = "User",
}

export const RoleLandingPage: Record<RoleEnum, string> = {
  [RoleEnum.SuperAdmin]: "/reports",
  [RoleEnum.Admin]: "/bookings",
  [RoleEnum.User]: "/live-chat",
};

/** Higher number = more privileged. */
export const RoleRank: Record<string, number> = {
  [RoleEnum.User]: 1,
  [RoleEnum.Admin]: 2,
  [RoleEnum.SuperAdmin]: 3,
};
