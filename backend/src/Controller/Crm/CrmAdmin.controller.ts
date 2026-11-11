import { Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";

// Logged-in users only: see CRM calls that gave up, and retry them.
@Controller({ path: "CrmAdmin", version: "1" })
@ApiTags("CRM Admin")
export class CrmAdminController extends JWTAuthController {
  constructor(private readonly _Outbox: CrmOutboxService) {
    super();
  }

  @Get("Dead")
  async Dead() {
    return this.SendResponseData(await this._Outbox.listDead());
  }

  @Put("Retry/:Id")
  async Retry(@Param("Id") Id: string) {
    const row = await this._Outbox.retry(Id);
    if (!row) return this.SendResponse(ResponseEnum.Error, "Outbox row not found");
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }
}
