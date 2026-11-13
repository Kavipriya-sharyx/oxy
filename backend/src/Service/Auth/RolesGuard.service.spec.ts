import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard, clearPermissionCache } from "./RolesGuard.service";
import { RoleEnum } from "@Helper/Enum/RoleEnum";
import { ROLES_KEY } from "@Helper/Roles.decorator";
import { DEFAULT_PERMISSIONS, PERMISSION_KEY, permissionsOf } from "@Helper/Permissions";
import { user_role } from "@Database/Table/Admin/user_role";

function ctx(roleName: string | null, roleId = "r1"): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: roleName ? { user_role_name: roleName, user_role_id: roleId } : undefined }),
    }),
  } as any;
}

function guardFor(meta: { roles?: RoleEnum[]; perms?: string[] }) {
  const reflector = {
    getAllAndOverride: (key: string) => (key === ROLES_KEY ? meta.roles : key === PERMISSION_KEY ? meta.perms : undefined),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

afterEach(() => {
  jest.restoreAllMocks();
  clearPermissionCache();
});

describe("RolesGuard", () => {
  it("allows any user when nothing is required", async () => {
    await expect(guardFor({}).canActivate(ctx(RoleEnum.User))).resolves.toBe(true);
  });

  it("still supports @Roles", async () => {
    await expect(guardFor({ roles: [RoleEnum.Admin] }).canActivate(ctx(RoleEnum.Admin))).resolves.toBe(true);
    await expect(guardFor({ roles: [RoleEnum.SuperAdmin] }).canActivate(ctx(RoleEnum.Admin))).rejects.toThrow(ForbiddenException);
  });

  it("Super Admin has every permission without a lookup", async () => {
    const find = jest.spyOn(user_role, "findOne");
    await expect(guardFor({ perms: ["settings.manage"] }).canActivate(ctx(RoleEnum.SuperAdmin))).resolves.toBe(true);
    expect(find).not.toHaveBeenCalled();
  });

  it("uses the permissions saved on the role", async () => {
    jest.spyOn(user_role, "findOne").mockResolvedValue({ name: "Supervisor", status: true, permission: ["centres.edit"] } as never);
    await expect(guardFor({ perms: ["centres.edit"] }).canActivate(ctx("Supervisor"))).resolves.toBe(true);
    clearPermissionCache();
    await expect(guardFor({ perms: ["users.manage"] }).canActivate(ctx("Supervisor"))).rejects.toThrow(ForbiddenException);
  });

  it("falls back to the built-in defaults when a role has none saved", async () => {
    jest.spyOn(user_role, "findOne").mockResolvedValue({ name: RoleEnum.User, status: true, permission: null } as never);
    await expect(guardFor({ perms: ["conversations.reply"] }).canActivate(ctx(RoleEnum.User))).resolves.toBe(true);
    clearPermissionCache();
    await expect(guardFor({ perms: ["roles.manage"] }).canActivate(ctx(RoleEnum.User))).rejects.toThrow(ForbiddenException);
  });

  it("rejects a user with no user", async () => {
    await expect(guardFor({ perms: ["dashboard.view"] }).canActivate(ctx(null))).rejects.toThrow(ForbiddenException);
  });

  it("drops unknown keys and keeps Admin able to do every CRUD by default", () => {
    expect(permissionsOf({ name: "X", permission: ["centres.edit", "nope"] })).toEqual(["centres.edit"]);
    expect(DEFAULT_PERMISSIONS[RoleEnum.Admin]).toEqual(expect.arrayContaining(["users.manage", "roles.manage", "centres.edit"]));
  });
});
