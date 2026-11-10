import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { ChatPipelineService, Inbound } from "@Service/Oxxy/ChatPipeline.service";

export function validSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !header || !secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller({ path: "Whatsapp/Webhook", version: "1" })
@ApiTags("Whatsapp Webhook")
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly _Config: ConfigService,
    private readonly _Pipeline: ChatPipelineService,
  ) {}

  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: any,
  ) {
    if (mode === "subscribe" && token && token === this._Config.get("Whatsapp.VerifyToken")) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Invalid verify token");
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Headers("x-hub-signature-256") signature: string,
    @Body() body: any,
  ) {
    if (!validSignature(req.rawBody, signature, this._Config.get("Whatsapp.AppSecret"))) {
      res.status(403); // real 403 (the global filter would turn a thrown error into HTTP 200)
      return { status: "invalid signature" };
    }
    const inbound: Inbound[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          const text =
            msg.text?.body ??
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            (msg.location ? "[location shared]" : null);
          if (!text) continue;
          inbound.push({
            waNumber: msg.from,
            waMessageId: msg.id,
            text,
            location: msg.location
              ? { latitude: msg.location.latitude, longitude: msg.location.longitude }
              : undefined,
          });
        }
      }
    }
    // Respond to Meta fast; process in the background
    for (const m of inbound) {
      this.handle(m).catch((e) => this.logger.error(`pipeline failed: ${e.message}`));
    }
    return { status: "ok" };
  }

  private async handle(m: Inbound) {
    const saved = await this._Pipeline.saveInbound(m);
    if (!saved) return; // duplicate wa_message_id
    await this._Pipeline.process(m, saved);
  }
}
