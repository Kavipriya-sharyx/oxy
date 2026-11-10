import { Injectable } from "@nestjs/common";
import { user_role } from "@Database/Table/Admin/user_role";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { UserRoleModel } from "@Model/Admin/UserRole.model";
import { Not } from "typeorm";
import { AuditLogService } from "./AuditLog.service";
import { LogActionEnum } from "@Helper/Enum/AuditLogEnum";
import { CacheService } from "@Service/Cache.service";
import { CacheEnum } from "@Helper/Enum/CacheEnum";

@Injectable()
export class UserRoleService {
  constructor(
    private _AuditLogService: AuditLogService,
    private _CacheService: CacheService,
  ) {}

  async GetAll() {
    const ResultData = await this._CacheService.Get(`${CacheEnum.UserRole}:*`);
    if (ResultData.length > 0) {
      return ResultData;
    } else {
      const UserRoleList = await user_role.find();
      await this._CacheService.Store(`${CacheEnum.UserRole}`, UserRoleList);
      return UserRoleList;
    }
  }

  async GetAllExpectSuperAdmin() {
    const ResultData = await this._CacheService.Get(`${CacheEnum.UserRole}:*`);
    if (ResultData.length > 0) {
      return ResultData;
    } else {
      const UserRoleList = await user_role.find({
        where: { created_by_id: Not("0") },
      });
      await this._CacheService.Store(`${CacheEnum.UserRole}`, UserRoleList);
      return UserRoleList;
    }
  }

  async GetById(UserRoleId: string) {
    const ResultData = await this._CacheService.Get(`${CacheEnum.UserRole}:${UserRoleId}`);
    if (ResultData.length > 0) {
      return ResultData[0];
    } else {
      const UserRoleData = await user_role.findOne({
        where: { id: UserRoleId },
      });
      await this._CacheService.Store(`${CacheEnum.UserRole}:${UserRoleId}`, [UserRoleData]);
      return UserRoleData;
    }
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
    await this._CacheService.Store(`${CacheEnum.UserRole}`, [_UserRoleData]);
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
    await this._CacheService.Store(`${CacheEnum.UserRole}`, [{ ...UserRoleUpdateData, id: Id }]);
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
    await this._CacheService.Remove(`${CacheEnum.UserRole}:${Id}`, UserRoleData);
    return true;
  }
}
