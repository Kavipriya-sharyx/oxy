import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { user } from "@Database/Table/Admin/user";
import { EncryptionService } from "../Encryption.service";

@Injectable()
export class AuthService {
  constructor(
    private _JwtService: JwtService,
    private _EncryptionService: EncryptionService,
  ) {}

  async ValidateUser(username: string, password: string): Promise<any> {
    const UserData = await user.findOne({ where: { email: username }, relations: ["user_role"] });
    if (!UserData) {
      throw new Error("Invalid email id");
    }
    if (UserData.status == false) {
      throw new Error("User suspended, contanct administration");
    }
    if (this._EncryptionService.Decrypt(UserData.password) != password) {
      throw new Error("Invalid password");
    }
    const payload = {
      email: UserData.email,
      user_id: UserData.id,
      user_role_id: UserData.user_role_id,
      user_role_name: UserData.user_role.name,
    };
    const api_token = this._JwtService.sign(payload);
    return { api_token };
  }
}
