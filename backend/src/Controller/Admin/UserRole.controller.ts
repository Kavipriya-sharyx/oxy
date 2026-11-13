import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { RoleEnum } from "@Helper/Enum/RoleEnum";
import { user_role } from "@Database/Table/Admin/user_role";
import { user } from "@Database/Table/Admin/user";
import { ALL_PERMISSIONS, BUILT_IN_ROLES, Permission, PERMISSIONS, permissionsOf } from "@Helper/Permissions";
import { clearPermissionCache, permissionsForUser } from "@Service/Auth/RolesGuard.service";

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

// Roles and permissions (prototype: Admin > Roles and permissions).
@Controller({ path: "UserRole", version: "1" })
@ApiTags("User Role")
export class UserRoleController extends JWTAuthController {
  /** What the signed-in user may do. The console uses it for the menu and the buttons. */
  @Get("MyPermissions")
  async MyPermissions(@Req() req: any) {
    return this.SendResponseData({
      role: req.user?.user_role_name ?? null,
      permissions: await permissionsForUser(req.user),
    });
  }

  /** The permission catalog shown as the rows of the matrix */
  @Permission("roles.manage")
  @Get("Permissions")
  async Permissions() {
    return this.SendResponseData(PERMISSIONS);
  }

  /** Every role with its permissions and how many users hold it */
  @Permission("roles.manage")
  @Get("Roles")
  async Roles() {
    const roles = await user_role.find({ order: { name: "ASC" } as any });
    const counts: { user_role_id: string; n: string }[] = await user
      .createQueryBuilder("u")
      .select("u.user_role_id", "user_role_id")
      .addSelect("count(*)", "n")
      .groupBy("u.user_role_id")
      .getRawMany();
    const byId = new Map(counts.map((c) => [c.user_role_id, Number(c.n)]));
    return this.SendResponseData(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        active: r.status !== false,
        builtIn: BUILT_IN_ROLES.includes(r.name),
        locked: r.name === RoleEnum.SuperAdmin,
        users: byId.get(r.id) ?? 0,
        permissions: permissionsOf(r),
      })),
    );
  }

  /** Roles the caller may give a user: everything except Super Admin, unless the caller is one */
  @Permission("users.manage")
  @Get("Assignable")
  async Assignable(@Req() req: any) {
    const rows = await user_role.find({ where: { status: true }, order: { name: "ASC" } as any });
    const sa = req.user.user_role_name === RoleEnum.SuperAdmin;
    return this.SendResponseData(rows.filter((r) => sa || r.name !== RoleEnum.SuperAdmin).map((r) => ({ id: r.id, name: r.name })));
  }

  @Permission("users.manage")
  @Get("List")
  async List() {
    const rows = await user_role.find({ order: { name: "ASC" } as any });
    return this.SendResponseData(rows.filter((r) => r.name !== RoleEnum.SuperAdmin));
  }

  private cleanPermissions(p: unknown): string[] {
    if (!Array.isArray(p)) throw new BadRequestException("permissions must be a list");
    const bad = p.filter((k) => !ALL_PERMISSIONS.includes(k));
    if (bad.length) throw new BadRequestException(`Unknown permission: ${bad.join(", ")}`);
    return [...new Set(p as string[])];
  }

  /** New role: { name, permissions?, copy_from? (role id) } */
  @Permission("roles.manage")
  @Post("Insert")
  async Insert(@Body() body: { name?: string; permissions?: string[]; copy_from?: string }) {
    const name = String(body?.name ?? "").trim();
    if (name.length < 2 || name.length > 40) throw new BadRequestException("Role name must be 2 to 40 characters");
    if (await user_role.createQueryBuilder("r").where("lower(r.name) = lower(:name)", { name }).getOne())
      throw new BadRequestException("A role with this name already exists");
    let permissions: string[] = [];
    if (body.permissions) permissions = this.cleanPermissions(body.permissions);
    else if (body.copy_from) permissions = permissionsOf(await user_role.findOne({ where: { id: body.copy_from } }));
    const row = await user_role.save(
      user_role.create({ name, code: slug(name) || `role_${Date.now()}`, landing_page: "/dashboard", permission: permissions } as any),
    );
    clearPermissionCache();
    return this.SendResponseData({ id: (row as any).id });
  }

  /** Rename and / or change permissions: { name?, permissions? } */
  @Permission("roles.manage")
  @Put("Update/:Id")
  async Update(@Param("Id") Id: string, @Body() body: { name?: string; permissions?: string[] }, @Req() req: any) {
    const role = await user_role.findOne({ where: { id: Id } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.name === RoleEnum.SuperAdmin) throw new BadRequestException("Super Admin always has every permission");
    if (body.name !== undefined && body.name.trim() !== role.name) {
      if (BUILT_IN_ROLES.includes(role.name)) throw new BadRequestException("Built-in roles cannot be renamed");
      const name = body.name.trim();
      if (name.length < 2 || name.length > 40) throw new BadRequestException("Role name must be 2 to 40 characters");
      if (await user_role.createQueryBuilder("r").where("lower(r.name) = lower(:name) AND r.id <> :Id", { name, Id }).getOne())
        throw new BadRequestException("A role with this name already exists");
      role.name = name;
    }
    if (body.permissions !== undefined) {
      const next = this.cleanPermissions(body.permissions);
      // nobody can lock themselves out of this page
      if (req.user.user_role_id === Id && !next.includes("roles.manage"))
        throw new BadRequestException("You cannot remove 'Add roles and change permissions' from your own role");
      role.permission = next;
    }
    role.updated_on = new Date();
    await role.save();
    clearPermissionCache();
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  @Permission("roles.manage")
  @Delete("Delete/:Id")
  async Delete(@Param("Id") Id: string) {
    const role = await user_role.findOne({ where: { id: Id } });
    if (!role) throw new NotFoundException("Role not found");
    if (BUILT_IN_ROLES.includes(role.name)) throw new BadRequestException("Built-in roles cannot be deleted");
    const n = await user.count({ where: { user_role_id: Id } });
    if (n) throw new BadRequestException(`${n} user${n > 1 ? "s have" : " has"} this role. Move them to another role first.`);
    await user_role.delete(Id);
    clearPermissionCache();
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Deleted);
  }
}
