import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ErrorLogService } from "@Service/Admin/ErrorLog.service";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { ErrorLogDeleteModel, ErrorLogLazyLoadModel } from "@Model/Admin/ErrorLog.model";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";

@Controller({ path: "ErrorLog", version: "1" })
@ApiTags("Error Log")
export class ErrorLogController extends JWTAuthController {
  constructor(private _ErrorLogService: ErrorLogService) {
    super();
  }

  @Post("LazyLoadList")
  async LazyLoadList(@Body() ErrorLogLazyLoadData: ErrorLogLazyLoadModel) {
    const ErrorLogListData = await this._ErrorLogService.LazyLoadList(ErrorLogLazyLoadData);
    return this.SendResponseData({
      data: ErrorLogListData,
      total: ErrorLogListData[0]?.total_count ?? 0,
    });
  }

  @Post("DeleteByAsOfDate")
  async DeleteByAsOfDate(@Body() ErrorLogDeleteData: ErrorLogDeleteModel) {
    await this._ErrorLogService.DeleteByAsOfDate(ErrorLogDeleteData);
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Deleted);
  }
}
