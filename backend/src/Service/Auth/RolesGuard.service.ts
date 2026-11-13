import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "@Helper/Roles.decorator";
import { RoleEnum } from "@Helper/Enum/RoleEnum";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private _Reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this._Reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user;
    if (!user || !required.includes(user.user_role_name)) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }
    return true;
  }
}
