import { Body, Controller, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { WhatsappClient } from "@Service/Oxxy/WhatsappClient.service";
import { ConversationRepository } from "@Service/Oxxy/ConversationRepository.service";
import { customer } from "@Database/Table/Oxxy/customer";
import { OutboundMessage, SendPurpose } from "@Helper/WhatsappMessage";
import {
  InvalidMessageError,
  QuietHoursError,
  WhatsappApiError,
  WindowClosedError,
} from "@Helper/WhatsappErrors";

type DevType = "text" | "buttons" | "list" | "template";

interface DevSendBody {
  to: string;
  type: DevType;
  purpose?: SendPurpose; // default "reply"
}

export const DEV_SAMPLES: Record<DevType, OutboundMessage> = {
  text: { kind: "text", body: "Test message from Oxxy (text)" },
  buttons: {
    kind: "buttons",
    body: "Test message from Oxxy: choose one",
    buttons: [
      { id: "dev_yes", title: "Yes" },
      { id: "dev_no", title: "No" },
    ],
  },
  list: {
    kind: "list",
    body: "Test message from Oxxy: pick a plan",
    buttonLabel: "Choose",
    rows: [
      { id: "dev_everyday", title: "Everyday", description: "Sample row 1" },
      { id: "dev_vital", title: "Vital", description: "Sample row 2" },
      { id: "dev_thrive", title: "Thrive" },
    ],
  },
  template: { kind: "template", name: "hello_world", languageCode: "en_US" },
};

// Development only. Sends a fixed sample message to a number. Not available when NODE_ENV=production.
@Controller({ path: "Whatsapp/DevSend", version: "1" })
@ApiTags("Whatsapp Dev")
export class WhatsappDevSendController extends JWTAuthController {
  constructor(
    private readonly _Wa: WhatsappClient,
    private readonly _ConvRepo: ConversationRepository,
  ) {
    super();
  }

  @Post()
  async send(@Body() body: DevSendBody, @Res({ passthrough: true }) res: Response) {
    if (process.env.NODE_ENV === "production") {
      res.status(404); // real 404 (the global filter would turn a thrown error into HTTP 200)
      return { status: "not found" };
    }
    const sample = DEV_SAMPLES[body?.type];
    if (!body?.to || !sample) {
      res.status(400);
      return {
        Type: "E",
        error: "InvalidMessageError",
        message: "body needs to and type (text|buttons|list|template)",
      };
    }
    try {
      // the number needs a customer + conversation row. Created here if this is the first time.
      let cust = await customer.findOne({ where: { wa_number: body.to } });
      if (!cust) cust = await customer.save(customer.create({ wa_number: body.to }));
      await this._ConvRepo.openNew(cust.id);

      const wamid = await this._Wa.send(cust.id, sample, body.purpose ?? "reply");
      return { Type: "S", wamid };
    } catch (e) {
      const err = e as Error;
      if (
        err instanceof WindowClosedError ||
        err instanceof QuietHoursError ||
        err instanceof InvalidMessageError ||
        err instanceof WhatsappApiError
      ) {
        return {
          Type: "E",
          error: err.name,
          message: err.message,
          ...(err instanceof QuietHoursError ? { nextAllowedAt: err.nextAllowedAt } : {}),
          ...(err instanceof WhatsappApiError ? { retryable: err.retryable } : {}),
        };
      }
      throw err;
    }
  }
}
