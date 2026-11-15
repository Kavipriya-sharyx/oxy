import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Permission } from "@Helper/Permissions";
import { buildPostmanCollection, buildVoicePostmanCollection } from "@Helper/PostmanCollection";
import { ApiKeyService } from "@Service/Admin/ApiKey.service";
import { ApiLogFilter, ApiLogService } from "@Service/Admin/ApiLog.service";
import { Roles } from "@Helper/Roles.decorator";
import { RoleEnum } from "@Helper/Enum/RoleEnum";

// Console > Admin > Developer: API keys for the client's CRM / voice AI, the CRM webhook secret and the
// Postman collection. A key or secret is shown once, when it is made.
@Controller({ path: "Developer", version: "1" })
@ApiTags("Developer")
export class DeveloperController extends JWTAuthController {
  constructor(
    private readonly _Keys: ApiKeyService,
    private readonly _Logs: ApiLogService,
  ) {
    super();
  }

  // API logs: every call the client's CRM / voice agent made. Super Admin only.
  @Roles(RoleEnum.SuperAdmin)
  @Get("ApiLogs")
  async ApiLogs(@Query() q: ApiLogFilter) {
    return this.SendResponseData(await this._Logs.list(q ?? {}));
  }

  @Roles(RoleEnum.SuperAdmin)
  @Get("ApiLogs/Stats")
  async ApiLogStats(@Query("hours") hours?: string) {
    return this.SendResponseData(await this._Logs.stats(Number(hours) || 24));
  }

  @Permission("developer.manage")
  @Get("Overview")
  async Overview() {
    return this.SendResponseData(await this._Keys.overview());
  }

  @Permission("developer.manage")
  @Get("ApiKeys")
  async List() {
    return this.SendResponseData(await this._Keys.list());
  }

  @Permission("developer.manage")
  @Post("ApiKeys")
  async Create(@Body() body: { name?: string; expires_in_days?: number | null }, @Req() req: any) {
    const days =
      body?.expires_in_days === null || body?.expires_in_days === undefined
        ? null
        : Number(body.expires_in_days);
    const made = await this._Keys.create(String(body?.name ?? ""), days, {
      id: req.user?.user_id,
      name: req.user?.email ?? null,
    });
    return this.SendResponseData(made);
  }

  @Permission("developer.manage")
  @Delete("ApiKeys/:Id")
  async Revoke(@Param("Id") Id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(Id)) throw new BadRequestException("Invalid key id");
    return this.SendResponseData(await this._Keys.revoke(Id));
  }

  @Permission("developer.manage")
  @Post("WebhookSecret/Rotate")
  async RotateWebhookSecret() {
    return this.SendResponseData(await this._Keys.rotateWebhookSecret());
  }

  @Permission("developer.manage")
  @Post("Postman")
  Postman(@Body("base_url") baseUrl?: string, @Body("audience") audience?: string) {
    const clean =
      typeof baseUrl === "string" && /^https?:\/\/[^\s"]+$/.test(baseUrl)
        ? baseUrl.replace(/\/+$/, "")
        : undefined;
    return this.SendResponseData(
      audience === "voice" ? buildVoicePostmanCollection(clean) : buildPostmanCollection(clean),
    );
  }
}
