import { Body, Controller, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { CrmWebhookService } from "@Service/Crm/CrmWebhook.service";

// header: X-CRM-Signature = hex(HMAC-SHA256(rawBody, CRM_WEBHOOK_SECRET)), optional "sha256=" prefix
export function validCrmSignature(raw: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!raw || !header || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.replace(/^sha256=/, ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

@Controller({ path: "Crm/Webhook", version: "1" })
@ApiTags("CRM Webhook")
export class CrmWebhookController {
  constructor(
    private readonly _Config: ConfigService,
    private readonly _Webhook: CrmWebhookService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Headers("x-crm-signature") signature: string,
    @Body() body: any,
  ) {
    if (this._Config.get("Crm.Enabled") !== true) {
      res.status(404);
      return { status: "crm disabled" };
    }
    if (!validCrmSignature(req.rawBody, signature, this._Config.get("Crm.WebhookSecret"))) {
      res.status(401); // real status (the global filter would turn a thrown error into HTTP 200)
      return { status: "invalid signature" };
    }
    const result = await this._Webhook.handle(body);
    if (result === "invalid") res.status(400);
    return { status: result };
  }
}
