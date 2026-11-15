import { Permission } from "@Helper/Permissions";
import { Controller, Get, Param, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@Helper/Common.helper";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { BookingService } from "@Service/Oxxy/Booking.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { audit } from "@Helper/AuditTrail";

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
    const b = await this._BookingService.confirm(Id, UserId);
    await audit({ action: "Confirm", table: "booking_request", recordId: Id, userId: UserId });
    const n = b.notice;
    const at =
      n.state === "scheduled"
        ? new Date(n.at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
    const text =
      n.state === "sent"
        ? "Booking confirmed. The customer was told on WhatsApp."
        : n.state === "scheduled"
          ? `Booking confirmed. It is quiet hours now, so the WhatsApp message goes out at ${at} (see Follow-ups).`
          : `Booking confirmed, but the WhatsApp message was NOT sent: ${n.problem}`;
    return this.SendResponse(ResponseEnum.Success, text, { notice: n });
  }
}
