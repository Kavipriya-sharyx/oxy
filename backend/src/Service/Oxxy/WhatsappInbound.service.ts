import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { message } from "@Database/Table/Oxxy/message";
import { ChatPipelineService } from "./ChatPipeline.service";
import { InboundQueueService } from "./InboundQueue.service";
import { WaMessage, WaStatus, WaValue, WaWebhookBody } from "./WhatsappTypes";

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

@Injectable()
export class WhatsappInboundService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappInboundService.name);

  constructor(
    private readonly _Config: ConfigService,
    private readonly _Pipeline: ChatPipelineService,
    private readonly _Queue: InboundQueueService,
  ) {}

  onModuleInit() {
    if (!this._Config.get("Whatsapp.VerifyToken"))
      this.logger.warn("WHATSAPP_VERIFY_TOKEN is not set: webhook verification will fail");
    if (!this._Config.get("Whatsapp.AppSecret"))
      this.logger.warn("WHATSAPP_APP_SECRET is not set: every webhook POST will be rejected (403)");
  }

  // Save + queue. Never calls Claude or WhatsApp. One failing message never stops the others.
  async handlePayload(body: WaWebhookBody): Promise<void> {
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;
        for (const msg of value.messages ?? []) {
          try {
            await this.handleMessage(msg, value);
          } catch (e) {
            this.logger.error(`${msg.id} failed to save: ${(e as Error).message}`);
          }
        }
        for (const st of value.statuses ?? []) {
          try {
            await this.handleStatus(st);
          } catch (e) {
            this.logger.error(`${st.id} status update failed: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  private async handleMessage(msg: WaMessage, value: WaValue): Promise<void> {
    const type = msg.type ?? "text";
    // text messages: the text. Interactive replies: the tapped id (title if there is no id).
    // image, audio, location etc.: empty body
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    const text = msg.text?.body ?? msg.button?.text ?? reply?.id ?? reply?.title ?? "";
    const profileName =
      value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ??
      value.contacts?.[0]?.profile?.name;

    const saved = await this._Pipeline.saveInbound({
      waNumber: msg.from,
      waMessageId: msg.id,
      text,
      type,
      timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : undefined,
      profileName,
      location: msg.location,
    });
    if (!saved || !saved.message) {
      this.logger.log(`${msg.id} skipped (duplicate)`);
      return;
    }
    await this._Queue.enqueue(
      {
        messageId: saved.message.id,
        conversationId: saved.conversation.id,
        customerId: saved.customer.id,
      },
      msg.id,
    );
    this.logger.log(`${msg.id} queued`);
  }

  // Only updates our outbound message. Never queued.
  private async handleStatus(st: WaStatus): Promise<void> {
    const row = await message.findOne({ where: { wa_message_id: st.id, direction: "out" } });
    if (!row) return;
    if (st.status === "failed") {
      row.message_status = "failed";
    } else if ((STATUS_RANK[st.status] ?? 0) > (STATUS_RANK[row.message_status] ?? 0)) {
      row.message_status = st.status; // never go backwards (read -> delivered)
    } else {
      return;
    }
    await row.save();
  }
}
