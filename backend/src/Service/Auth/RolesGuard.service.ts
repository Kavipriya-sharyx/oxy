import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "@Helper/Roles.decorator";
import { RoleEnum } from "@Helper/Enum/RoleEnum";
import { PERMISSION_KEY, permissionsOf } from "@Helper/Permissions";
import { user_role } from "@Database/Table/Admin/user_role";

// Role permissions are read from the database (so a change in the Roles page applies at once),
// cached for a few seconds per role.
const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; perms: string[] }>();
export function clearPermissionCache() {
  cache.clear();
}

export async function permissionsForUser(u: { user_role_id?: string; user_role_name?: string } | undefined): Promise<string[]> {
  if (!u) return [];
  if (u.user_role_name === RoleEnum.SuperAdmin) return permissionsOf({ name: RoleEnum.SuperAdmin });
  const key = u.user_role_id ?? `name:${u.user_role_name}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.perms;
  const role = u.user_role_id
    ? await user_role.findOne({ where: { id: u.user_role_id } })
    : await user_role.findOne({ where: { name: u.user_role_name } });
  const perms = role && role.status !== false ? permissionsOf(role) : [];
  cache.set(key, { at: Date.now(), perms });
  return perms;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private _Reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this._Reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, targets);
    const perms = this._Reflector.getAllAndOverride<string[]>(PERMISSION_KEY, targets);
    const user = context.switchToHttp().getRequest().user;
    if (roles?.length && (!user || !roles.includes(user.user_role_name))) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }
    if (perms?.length) {
      const has = await permissionsForUser(user);
      if (!perms.every((p) => has.includes(p))) {
        throw new ForbiddenException("Your role does not have permission for this");
      }
    }
    return true;
  }
}
