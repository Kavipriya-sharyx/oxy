import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { CommonService } from "@Service/Common.service";
import { ModuleTypeEnum } from "@Helper/Enum/ModuleTypeEnum";

@Controller({ path: "AutoNumber", version: "1" })
@ApiTags("AutoNumber")
export class AutoNumberController extends JWTAuthController {
  constructor(private _CommonService: CommonService) {
    super();
  }

  @Get("Generate/:Type")
  async Generate(@Param("Type") Type: ModuleTypeEnum) {
    const ResultData = await this._CommonService.TransactionRunningNumber(Type);
    return this.SendResponseData({ number: ResultData });
  }
}
