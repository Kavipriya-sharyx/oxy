import { DataSource } from "typeorm";
import { user_role } from "../Table/Admin/user_role";
import { user } from "../Table/Admin/user";
import { Injectable } from "@nestjs/common";
import { EncryptionService } from "@Service/Encryption.service";
import { RoleEnum, RoleLandingPage } from "@Helper/Enum/RoleEnum";
import { OxxySeederService } from "./OxxySeeder.service";

@Injectable()
export class CommonSeederService {
  constructor(
    private readonly _EncryptionService: EncryptionService,
    private readonly _OxxySeeder: OxxySeederService,
    private _DataSource: DataSource,
  ) {}
  async Run() {
    try {
      await this.UserRoleSeed();
    } catch (e) {
      console.log(e);
    }

    try {
      await this.UserSeed();
    } catch (e) {
      console.log(e);
    }

    await this._OxxySeeder.Run();
  }

  UserRoleSeed = async () => {
    const roles = [
      { name: RoleEnum.SuperAdmin, code: "SUPER_ADMIN" },
      { name: RoleEnum.Admin, code: "ADMIN" },
      { name: RoleEnum.User, code: "USER" },
    ];
    for (const r of roles) {
      const existing = await user_role.findOne({ where: { name: r.name } });
      if (existing) {
        if (!existing.code) {
          existing.code = r.code;
          existing.landing_page = RoleLandingPage[r.name];
          await existing.save();
        }
        continue;
      }
      await this._DataSource.manager
        .createQueryBuilder()
        .insert()
        .into(user_role)
        .values([
          { ...r, landing_page: RoleLandingPage[r.name], created_by_id: "0", created_on: new Date() },
        ])
        .execute();
    }
  };

  UserSeed = async () => {
    const users = [
      { email: "admin@user.com", role: RoleEnum.SuperAdmin, first_name: "Super Admin" },
      { email: "superadmin@oxxy.com", role: RoleEnum.SuperAdmin, first_name: "Super Admin" },
      { email: "admin@oxxy.com", role: RoleEnum.Admin, first_name: "Admin" },
      { email: "user@oxxy.com", role: RoleEnum.User, first_name: "User" },
    ];
    for (const u of users) {
      if (await user.findOne({ where: { email: u.email } })) continue;
      const role = await user_role.findOne({ where: { name: u.role } });
      await this._DataSource.manager
        .createQueryBuilder()
        .insert()
        .into(user)
        .values([
          {
            user_role_id: role.id,
            email: u.email,
            first_name: u.first_name,
            password: this._EncryptionService.Encrypt("Login123!!"),
            created_by_id: "0",
            created_on: new Date(),
          },
        ])
        .execute();
    }
  };
}
