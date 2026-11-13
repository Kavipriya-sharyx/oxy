import { SetMetadata } from "@nestjs/common";
import { RoleEnum } from "@Helper/Enum/RoleEnum";

export const ROLES_KEY = "roles";
/** Restrict a controller or route to the given roles. No decorator = any logged-in user. */
export const Roles = (...roles: RoleEnum[]) => SetMetadata(ROLES_KEY, roles);
