import { Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@Helper/Common.helper";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Roles } from "@Helper/Roles.decorator";
import { RoleEnum } from "@Helper/Enum/RoleEnum";
import { BookingService } from "@Service/Oxxy/Booking.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";

@Controller({ path: "Booking", version: "1" })
@ApiTags("Booking")
export class BookingController extends JWTAuthController {
  constructor(private _BookingService: BookingService) {
    super();
  }

  @Get("Pending")
  async Pending() {
    return this.SendResponseData(await this._BookingService.listPending());
  }

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Put("Confirm/:Id")
  async Confirm(@Param("Id") Id: string, @CurrentUser() UserId: string) {
    await this._BookingService.confirm(Id, UserId);
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }
}
