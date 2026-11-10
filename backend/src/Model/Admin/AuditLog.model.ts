import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsNotEmpty } from "class-validator";
import { DBDateTimeEnd, DBDateTimeStart } from "@Helper/Common.helper";
import { LogActionEnum } from "@Helper/Enum/AuditLogEnum";
import { PaginationModel } from "../Base.model";

export class AuditLogModel {
  PerformedType: string;
  PrimaryId: string[];
  ActionType: LogActionEnum;
}

export declare class AuditLogFilterModel {
  Start_date: Date;
  end_date: Date;
}

export class AuditLogLazyLoadModel extends PaginationModel {
  @ApiProperty({ required: false })
  @Type(() => String)
  action: string;

  @ApiProperty({ required: false })
  @Type(() => String)
  user_id: string;

  @ApiProperty({ required: false })
  @Type(() => String)
  module: string;

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
