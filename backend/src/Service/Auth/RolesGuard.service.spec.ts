import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./RolesGuard.service";
import { RoleEnum } from "@Helper/Enum/RoleEnum";

function ctx(roleName: string | null): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: roleName ? { user_role_name: roleName } : undefined }),
    }),
  } as any;
}

function guardFor(required: RoleEnum[] | undefined) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe("RolesGuard", () => {
  it("allows any user when no roles are required", () => {
    expect(guardFor(undefined).canActivate(ctx(RoleEnum.User))).toBe(true);
  });
  it("allows a listed role", () => {
    expect(guardFor([RoleEnum.Admin, RoleEnum.SuperAdmin]).canActivate(ctx(RoleEnum.Admin))).toBe(true);
  });
  it("rejects an unlisted role", () => {
    expect(() => guardFor([RoleEnum.SuperAdmin]).canActivate(ctx(RoleEnum.Admin))).toThrow(ForbiddenException);
  });
  it("rejects a missing user", () => {
    expect(() => guardFor([RoleEnum.User]).canActivate(ctx(null))).toThrow(ForbiddenException);
  });
});
