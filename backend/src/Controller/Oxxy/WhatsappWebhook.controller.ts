import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { Response } from "express";
import { WhatsappInboundService } from "@Service/Oxxy/WhatsappInbound.service";
import { WaWebhookBody } from "@Service/Oxxy/WhatsappTypes";

// header format: "sha256=<hex>" = HMAC-SHA256 of the RAW body with the app secret
export function validSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || !header || !secret) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

@Controller({ path: "Whatsapp/Webhook", version: "1" })
@ApiTags("Whatsapp Webhook")
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly _Config: ConfigService,
    private readonly _Inbound: WhatsappInboundService,
  ) {}

  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ) {
    const expected = this._Config.get<string>("Whatsapp.VerifyToken");
    if (mode === "subscribe" && expected && token === expected) {
      return res.status(200).type("text/plain").send(challenge);
    }
    return res.status(403).send("Invalid verify token");
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: { rawBody?: Buffer },
    @Res({ passthrough: true }) res: Response,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() body: WaWebhookBody,
  ) {
    if (!validSignature(req.rawBody, signature, this._Config.get<string>("Whatsapp.AppSecret"))) {
      res.status(403); // real 403 (the global filter would turn a thrown error into HTTP 200)
      return { status: "invalid signature" };
    }
    try {
      await this._Inbound.handlePayload(body);
    } catch (e) {
      // still 200, otherwise Meta retries the same payload forever
      this.logger.error(`webhook handling failed: ${(e as Error).message}`);
    }
    return { status: "ok" };
  }
}
