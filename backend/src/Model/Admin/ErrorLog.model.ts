import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsNotEmpty } from "class-validator";
import { DBDateTimeEnd, DBDateTimeStart } from "@Helper/Common.helper";
import { PaginationModel } from "../Base.model";

export class ErrorLogLazyLoadModel extends PaginationModel {
  @IsNotEmpty({ message: "User id required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  user_id: string;

  @IsNotEmpty({ message: "Start date required" })
  @ApiProperty({ required: true })
  @Transform(({ value }) => DBDateTimeStart(value), { toClassOnly: false })
  @Type(() => Date)
  start_date: Date;

  @IsNotEmpty({ message: "End date required" })
  @Transform(({ value }) => DBDateTimeEnd(value), { toClassOnly: false })
  @ApiProperty({ required: true })
  @Type(() => Date)
  end_date: Date;
}

export class ErrorLogDeleteModel {
  @IsNotEmpty({ message: "Password required" })
  @ApiProperty({ required: true })
  @Type(() => String)
  password: string;

  @IsNotEmpty({ message: "Start date required" })
  @ApiProperty({ required: true })
  @Transform(({ value }) => DBDateTimeEnd(value), { toClassOnly: false })
  @Type(() => Date)
  as_of_date: Date;
}
