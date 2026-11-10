import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsNotEmpty } from "class-validator";

export class UserLoginModel {
  @IsNotEmpty({ message: "Email required" })
  @IsEmail({}, { message: "Invaild email format" })
  @ApiProperty({ required: true })
  @Type(() => String)
  email: string;

  @IsNotEmpty({ message: "Password required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  password: string;
}

export class UserLoginValidationModel {
  @IsNotEmpty({ message: "User id required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  user_id: string;

  @IsNotEmpty({ message: "OTP required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  otp: string;
}
