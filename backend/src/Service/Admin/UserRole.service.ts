import { Injectable } from "@nestjs/common";
import { user_role } from "@Database/Table/Admin/user_role";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { UserRoleModel } from "@Model/Admin/UserRole.model";
import { Not } from "typeorm";
import { AuditLogService } from "./AuditLog.service";
import { LogActionEnum } from "@Helper/Enum/AuditLogEnum";

// Roles are read from the database every time (no Redis copy): the old boilerplate cache mixed the "all" and
// "all but Super Admin" lists, stored single roles under a key it never read back, and was not cleared when the
// Roles page changed permissions. Permission checks use RolesGuard (database + a 10 s in-memory cache).
@Injectable()
export class UserRoleService {
  constructor(private _AuditLogService: AuditLogService) {}

  async GetAll() {
    return await user_role.find();
  }

  async GetAllExpectSuperAdmin() {
    return await user_role.find({ where: { created_by_id: Not("0") } });
  }

  async GetById(UserRoleId: string) {
    return await user_role.findOne({ where: { id: UserRoleId } });
  }

  async Insert(UserRoleData: UserRoleModel, UserId: string) {
    const _UserRoleData = new user_role();
    _UserRoleData.name = UserRoleData.name;
    _UserRoleData.code = UserRoleData.code;
    _UserRoleData.created_by_id = UserId;
    _UserRoleData.created_on = new Date();
    await user_role.insert(_UserRoleData);
    this._AuditLogService.AuditEmitEvent({
      PerformedType: user_role.name,
      ActionType: LogActionEnum.Insert,
      PrimaryId: [_UserRoleData.id],
    });
    return _UserRoleData;
  }

  async Update(Id: string, UserRoleData: UserRoleModel, UserId: string) {
    const UserRoleUpdateData = await user_role.findOne({ where: { id: Id } });
    if (!UserRoleUpdateData) {
      throw new Error("Record not found");
    }
    UserRoleUpdateData.name = UserRoleData.name;
    UserRoleUpdateData.code = UserRoleData.code;
    UserRoleUpdateData.updated_by_id = UserId;
    UserRoleUpdateData.updated_on = new Date();
    await user_role.update(Id, UserRoleUpdateData);
    this._AuditLogService.AuditEmitEvent({
      PerformedType: user_role.name,
      ActionType: LogActionEnum.Update,
      PrimaryId: [UserRoleUpdateData.id],
    });
    return UserRoleUpdateData;
  }

  async Delete(Id: string) {
    const UserRoleData = await user_role.findOne({ where: { id: Id } });
    if (!UserRoleData) {
      throw new Error(ResponseEnum.NotFound);
    }
    await UserRoleData.remove();
    this._AuditLogService.AuditEmitEvent({
      PerformedType: user_role.name,
      ActionType: LogActionEnum.Delete,
      PrimaryId: [UserRoleData.id],
    });
    return true;
  }
}
