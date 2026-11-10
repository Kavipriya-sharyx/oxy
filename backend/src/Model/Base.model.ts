import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Allow } from "class-validator";

export class BaseModel {
  @Allow()
  @ApiProperty({ required: false })
  @Type(() => String)
  id: string;

  @Allow()
  @ApiProperty({ default: true, required: false })
  @Type(() => Boolean)
  status: boolean;

  @Type(() => String)
  created_by_id: string;

  @Type(() => String)
  updated_by_id: string;

  @Type(() => Date)
  created_on: Date;

  @Type(() => Date)
  updated_on: Date;
}

export class PaginationModel {
  @ApiProperty({ required: true })
  @Type(() => Number)
  take: number = 10;

  @ApiProperty({ required: true })
  @Type(() => Number)
  skip: number = 0;

  @ApiProperty({ required: true })
  @Type(() => String)
  keyword: string = "";
}
