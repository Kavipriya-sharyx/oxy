import { Injectable } from "@nestjs/common";
import { user } from "@Database/Table/Admin/user";
import { RandomValue } from "@Helper/Common.helper";
import { ChangePasswordModel, ResetPasswordModel, UserModel } from "@Model/Admin/User.model";
import { EmailService } from "../Email.service";
import { EncryptionService } from "../Encryption.service";
import { AuditLogService } from "./AuditLog.service";
import { LogActionEnum } from "@Helper/Enum/AuditLogEnum";
import { RoleEnum, RoleRank } from "@Helper/Enum/RoleEnum";
import { user_role } from "@Database/Table/Admin/user_role";
import { ForbiddenException } from "@nestjs/common";
@Injectable()
export class UserService {
  constructor(
    private _EmailService: EmailService,
    private _EncryptionService: EncryptionService,
    private _AuditLogService: AuditLogService,
  ) {}

  /**
   * Super Admin may manage anyone. Admin may only manage plain Users: they cannot
   * create/edit/suspend Admins or Super Admins, nor promote anyone to those roles.
   */
  async AssertCanManage(actorRole: string, targetRoleId?: string, targetUserId?: string) {
    if (actorRole === RoleEnum.SuperAdmin) return;
    const limit = RoleRank[RoleEnum.User];
    if (targetRoleId) {
      const role = await user_role.findOne({ where: { id: targetRoleId } });
      if (!role || (RoleRank[role.name] ?? 99) > limit) {
        throw new ForbiddenException("You cannot assign this role");
      }
    }
    if (targetUserId) {
      const target = await user.findOne({ where: { id: targetUserId }, relations: ["user_role"] });
      if (target && (RoleRank[target.user_role?.name] ?? 99) > limit) {
        throw new ForbiddenException("You cannot modify this user");
      }
    }
  }

  /** Super Admin sees everyone; Admin only sees plain Users. */
  async GetAllForRole(actorRole: string) {
    const rows = await user.find({ relations: ["user_role"], order: { created_on: "DESC" } as any });
    const visible =
      actorRole === RoleEnum.SuperAdmin ? rows : rows.filter((u) => u.user_role?.name === RoleEnum.User);
    // never send password hashes or reset OTPs to the client
    return visible.map(({ password: _p, reset_otp: _o, ...safe }) => safe);
  }

  async GetById(UserId: string) {
    return user.findOne({ where: { id: UserId } });
  }

  async Insert(UserData: UserModel, UserId: string) {
    const _UserData = new user();
    _UserData.user_role_id = UserData.user_role_id;
    _UserData.first_name = UserData.first_name;
    _UserData.last_name = UserData.last_name;
    _UserData.email = UserData.email;
    _UserData.password = UserData.password;
    _UserData.mobile = UserData.mobile;
    _UserData.created_by_id = UserId;
    _UserData.created_on = new Date();
    _UserData.password = this._EncryptionService.Encrypt(UserData.password);
    await user.insert(_UserData);
    this._AuditLogService.AuditEmitEvent({
      PerformedType: user.name,
      ActionType: LogActionEnum.Insert,
      PrimaryId: [_UserData.id],
    });
    return _UserData;
  }

  async Update(Id: string, UserData: UserModel, UserId: string) {
    const UserUpdateData = await user.findOne({ where: { id: Id } });
    if (!UserUpdateData) {
      throw new Error("Record not found");
    }
    UserUpdateData.user_role_id = UserData.user_role_id;
    UserUpdateData.first_name = UserData.first_name;
    UserUpdateData.last_name = UserData.last_name;
    UserUpdateData.email = UserData.email;
    UserUpdateData.password = UserData.password;
    UserUpdateData.mobile = UserData.mobile;
    UserUpdateData.updated_by_id = UserId;
    UserUpdateData.updated_on = new Date();
    delete UserUpdateData.password;
    delete UserUpdateData.email;
    await user.update(Id, UserUpdateData);
    this._AuditLogService.AuditEmitEvent({
      PerformedType: user.name,
      ActionType: LogActionEnum.Update,
      PrimaryId: [UserUpdateData.id],
    });
    return UserUpdateData;
  }

  async SuspendOrActivate(Id: string, UserId: string) {
    const UserData = await user.findOne({ where: { id: Id } });
    if (!UserData) {
      throw new Error("User not found");
    }
    UserData.updated_by_id = UserId;
    UserData.updated_on = new Date();
    UserData.status = !UserData.status;
    await UserData.save();
    if (UserData.status == true) {
      this._AuditLogService.AuditEmitEvent({
        PerformedType: user.name,
        ActionType: LogActionEnum.Active,
        PrimaryId: [UserData.id],
      });
    } else {
      this._AuditLogService.AuditEmitEvent({
        PerformedType: user.name,
        ActionType: LogActionEnum.Suspend,
        PrimaryId: [UserData.id],
      });
    }
    return UserData;
  }

  async ForgotPassword(EmailId: string) {
    const UserData = await user.findOne({ where: { email: EmailId } });
    if (!UserData) {
      throw new Error("User not found");
    }
    UserData.reset_otp = RandomValue(100000, 999999);
    await UserData.save();
    const EncryptedUserId = this._EncryptionService.Encrypt(String(UserData.id));
    return await this._EmailService.ForgotPassword(EmailId, UserData.reset_otp, EncryptedUserId);
  }

  async ResetPassword(ResetPasswordData: ResetPasswordModel) {
    const UserData = await user.findOne({
      where: { id: this._EncryptionService.Decrypt(ResetPasswordData.user_id) },
    });
    if (!UserData) {
      throw new Error("User not found");
    }
    if (UserData.reset_otp != ResetPasswordData.reset_otp) {
      throw new Error("Invalid Reset OTP");
    }
    UserData.password = this._EncryptionService.Encrypt(ResetPasswordData.password);
    UserData.reset_otp = null;
    UserData.updated_by_id = UserData.id;
    UserData.updated_on = new Date();
    await UserData.save();
    return true;
  }

  async ChangePassword(UserId: string, ChangePasswordData: ChangePasswordModel) {
    const UserData = await user.findOne({ where: { id: UserId } });
    if (!UserData) {
      throw new Error("User not found");
    }
    if (this._EncryptionService.Decrypt(UserData.password) != ChangePasswordData.old_password) {
      throw new Error("Old password not matched");
    }
    UserData.password = this._EncryptionService.Encrypt(ChangePasswordData.password);
    UserData.updated_by_id = UserId;
    UserData.updated_on = new Date();
    await UserData.save();
    return true;
  }

  async UserResetPassword(Id: string, UserData: UserModel, UserId: string) {
    UserData.updated_by_id = UserId;
    UserData.updated_on = new Date();
    UserData.password = this._EncryptionService.Encrypt(UserData.password);
    await user.update(Id, UserData as any);
    this._AuditLogService.AuditEmitEvent({
      PerformedType: user.name,
      ActionType: LogActionEnum.ResetPassword,
      PrimaryId: [UserData.id],
    });
    return UserData as user;
  }
}
