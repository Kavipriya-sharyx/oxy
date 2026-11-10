import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsNotEmpty, MinLength, ValidateIf } from "class-validator";
import { BaseModel } from "../Base.model";

export class UserModel extends BaseModel {
  @IsNotEmpty({ message: "User role required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  user_role_id: string;

  @IsNotEmpty({ message: "First name required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  first_name: string;

  @ApiProperty({ required: false })
  @Type(() => String)
  last_name: string;

  @IsEmail({}, { message: "Invaild Email format" })
  @IsNotEmpty({ message: "Email required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  email: string;

  @ValidateIf((o: UserModel) => !(o.id > "0"))
  @IsNotEmpty({ message: "Password required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  password: string;

  @ApiProperty({ required: false })
  @Type(() => String)
  mobile: string;
}

export class ForgotPasswordModel {
  @IsNotEmpty({ message: "Email required" })
  @IsEmail({}, { message: "Invaild Email format" })
  @ApiProperty({ required: true })
  @Type(() => String)
  email: string;
}

export class ResetPasswordModel {
  @IsNotEmpty({ message: "User id required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  user_id: string;

  @IsNotEmpty({ message: "Reset OTP required" })
  @ApiProperty({ required: true })
  @Type(() => Number)
  reset_otp: number;

  @IsNotEmpty({ message: "Password required" })
  @MinLength(6, {
    message: "Password length mininum 6 characters",
  })
  @ApiProperty({ required: true })
  @Type(() => String)
  password: string;
}

export class ChangePasswordModel {
  @IsNotEmpty({ message: "Password required" })
  @MinLength(6, {
    message: "Password length mininum 6 characters",
  })
  @ApiProperty({ required: true })
  @Type(() => String)
  old_password: string;

  @IsNotEmpty({ message: "Password required" })
  @MinLength(6, {
    message: "Password length mininum 6 characters",
  })
  @ApiProperty({ required: true })
  @Type(() => String)
  password: string;
}
