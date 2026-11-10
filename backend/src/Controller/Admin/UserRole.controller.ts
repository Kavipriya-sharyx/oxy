import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentUser } from "@Helper/Common.helper";
import { ApiTags } from "@nestjs/swagger";
import { UserRoleService } from "@Service/Admin/UserRole.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { UserRoleModel } from "@Model/Admin/UserRole.model";
import { JWTAuthController } from "@Controller/JWTAuth.controller";

@Controller({ path: "UserRole", version: "1" })
@ApiTags("User Role")
export class UserRoleController extends JWTAuthController {
  constructor(private _UserRoleService: UserRoleService) {
    super();
  }

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
