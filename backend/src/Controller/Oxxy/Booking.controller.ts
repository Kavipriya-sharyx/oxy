import { Permission } from "@Helper/Permissions";
import { Controller, Get, Param, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@Helper/Common.helper";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { BookingService } from "@Service/Oxxy/Booking.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";

@Controller({ path: "Booking", version: "1" })
@ApiTags("Booking")
export class BookingController extends JWTAuthController {
  constructor(private _BookingService: BookingService) {
    super();
  }

  // all booking requests, newest first; ?status=pending_confirmation|confirmed|cancelled|...
  @Permission("bookings.read")
  @Get("List")
  async List(@Query("status") status?: string) {
    return this.SendResponseData(await this._BookingService.list(status));
  }

  @Permission("bookings.read")
  @Get("Pending")
  async Pending() {
    return this.SendResponseData(await this._BookingService.listPending());
  }

  @Permission("bookings.confirm")
  @Put("Confirm/:Id")
  async Confirm(@Param("Id") Id: string, @CurrentUser() UserId: string) {
    await this._BookingService.confirm(Id, UserId);
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }
}
