import { Body, Controller, Delete, Get, Param, Post, Put, Req } from "@nestjs/common";
import { CurrentUser } from "@Helper/Common.helper";
import { ApiTags } from "@nestjs/swagger";
import { UserRoleService } from "@Service/Admin/UserRole.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { UserRoleModel } from "@Model/Admin/UserRole.model";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Roles } from "@Helper/Roles.decorator";
import { RoleEnum, RoleRank } from "@Helper/Enum/RoleEnum";
import { user_role } from "@Database/Table/Admin/user_role";

@Roles(RoleEnum.SuperAdmin)
@Controller({ path: "UserRole", version: "1" })
@ApiTags("User Role")
export class UserRoleController extends JWTAuthController {
  constructor(private _UserRoleService: UserRoleService) {
    super();
  }

  /** Roles the caller may assign: Super Admin -> all, Admin -> User only. */
  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Get("Assignable")
  async Assignable(@Req() req: any) {
    const rows = await user_role.find({ order: { name: "ASC" } as any });
    const max = RoleRank[req.user.user_role_name === RoleEnum.SuperAdmin ? RoleEnum.SuperAdmin : RoleEnum.User];
    return this.SendResponseData(rows.filter((r) => (RoleRank[r.name] ?? 99) <= max));
  }

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Get("List")
  async List() {
    const UserRoleListData = await this._UserRoleService.GetAllExpectSuperAdmin();
    return this.SendResponseData(UserRoleListData);
  }

  @Get("ById/:Id")
  async ById(@Param("Id") Id: string) {
    const UserRoleData = await this._UserRoleService.GetById(Id);
    return this.SendResponseData(UserRoleData);
  }

  @Post("Insert")
  async Insert(@Body() UserRoleData: UserRoleModel, @CurrentUser() UserId: string) {
    await this._UserRoleService.Insert(UserRoleData, UserId);
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Created);
  }

  @Put("Update/:Id")
  async Update(
    @Param("Id") Id: string,
    @Body() UserRoleData: UserRoleModel,
    @CurrentUser() UserId: string,
  ) {
    await this._UserRoleService.Update(Id, UserRoleData, UserId);
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  @Delete("Delete/:Id")
  async Delete(@Param("Id") Id: string) {
    await this._UserRoleService.Delete(Id);
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Deleted);
  }
}
