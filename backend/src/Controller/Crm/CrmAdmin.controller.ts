import { Permission } from "@Helper/Permissions";
import { Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { crm_outbox } from "@Database/Table/Crm/crm_outbox";
import { crm_webhook_event } from "@Database/Table/Crm/crm_webhook_event";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";

// Logged-in users only: see CRM calls, webhook logs, and retry failed ones.
@Permission("crm.manage")
@Controller({ path: "CrmAdmin", version: "1" })
@ApiTags("CRM Admin")
export class CrmAdminController extends JWTAuthController {
  constructor(private readonly _Outbox: CrmOutboxService) {
    super();
  }

  @Get("Outbox")
  async Outbox() {
    const rows = await crm_outbox.find({
      order: { created_on: "DESC" } as any,
      take: 100,
    });
    return this.SendResponseData(rows);
  }

  @Get("Webhooks")
  async Webhooks() {
    const rows = await crm_webhook_event.find({
      order: { received_at: "DESC" } as any,
      take: 100,
    });
    return this.SendResponseData(rows);
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
