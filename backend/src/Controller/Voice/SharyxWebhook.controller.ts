// POST /api/v1/Voice/Sharyx/Webhook: the SharyX Voice AI call result (give this https address to SharyX, or add it
// under Integrations in their dashboard). Signed with the company's signing secret (SHARYX_WEBHOOK_SECRET).
// Answer within 10 seconds with 2xx; a repeated x-sharyx-delivery is answered without doing the work again.
import { Body, Controller, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { validSharyx } from "@Service/Voice/SharyxVoice.service";
import { SharyxWebhookService } from "@Service/Voice/SharyxWebhook.service";

const seen = new Set<string>();

@Controller({ path: "Voice/Sharyx/Webhook", version: "1" })
@ApiTags("Voice AI Webhook")
export class SharyxWebhookController {
  constructor(private readonly _Webhook: SharyxWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Headers("x-sharyx-event") event: string,
    @Headers("x-sharyx-delivery") delivery: string,
    @Headers("x-sharyx-timestamp") timestamp: string,
    @Headers("x-sharyx-signature") signature: string,
    @Body() body: any,
  ) {
    const secret = process.env.SHARYX_WEBHOOK_SECRET;
    if (!secret) {
      res.status(404);
      return { status: "voice webhook not configured" };
    }
    const ok = validSharyx(secret, {
      timestamp,
      signature,
      method: req.method,
      pathAndQuery: req.originalUrl,
      rawBody: req.rawBody ? req.rawBody.toString("utf8") : "",
    });
    if (!ok) {
      res.status(401); // real status (the global filter would turn a thrown error into HTTP 200)
      return { status: "invalid signature or stale timestamp" };
    }
    if (delivery && seen.has(delivery)) return { status: "duplicate" };
    const status = await this._Webhook.handle(event || body?.event, body);
    if (delivery) {
      seen.add(delivery);
      if (seen.size > 5000) seen.delete(seen.values().next().value as string);
    }
    return { status };
  }
}
