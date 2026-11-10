import { DataSource } from "typeorm";
import { user_role } from "../Table/Admin/user_role";
import { user } from "../Table/Admin/user";
import { Injectable } from "@nestjs/common";
import { EncryptionService } from "@Service/Encryption.service";
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
    await this._DataSource.manager
      .createQueryBuilder()
      .insert()
      .into(user_role)
      .values([{ name: "Super Admin", code: "", created_by_id: "0", created_on: new Date() }])
      .execute();
  };

  UserSeed = async () => {
    const UserRoleData = await user_role.findOne({ where: { name: "Super Admin" } });
    await this._DataSource.manager
      .createQueryBuilder()
      .insert()
      .into(user)
      .values([
        {
          user_role_id: UserRoleData.id,
          email: "admin@user.com",
          password: this._EncryptionService.Encrypt("Login123!!"),
          created_by_id: "0",
          created_on: new Date(),
        },
      ])
      .execute();
  };
}
