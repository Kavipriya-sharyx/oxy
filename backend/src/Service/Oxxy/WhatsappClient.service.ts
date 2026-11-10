import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface ReplyButton {
  id: string;
  title: string; // max 20
}
export interface ListRow {
  id: string;
  title: string; // max 24
  description?: string;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

@Injectable()
export class WhatsappClient {
  private readonly logger = new Logger(WhatsappClient.name);
  constructor(private readonly _Config: ConfigService) {}

  private async post(payload: any): Promise<string | null> {
    const phoneId = this._Config.get("Whatsapp.PhoneNumberId");
    const token = this._Config.get("Whatsapp.AccessToken");
    try {
      const res = await axios.post(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        { messaging_product: "whatsapp", recipient_type: "individual", ...payload },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );
      return res.data?.messages?.[0]?.id ?? null;
    } catch (e: any) {
      this.logger.error(`WhatsApp send failed: ${JSON.stringify(e?.response?.data ?? e.message)}`);
      throw e;
    }
  }

  sendText(to: string, body: string) {
    return this.post({ to, type: "text", text: { body, preview_url: false } });
  }

  // max 3 buttons, title max 20 chars
  sendButtons(to: string, body: string, buttons: ReplyButton[]) {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: cut(b.title, 20) },
          })),
        },
      },
    });
  }

  // list rows, title max 24 chars (WhatsApp allows up to 10 rows)
  sendList(to: string, body: string, buttonText: string, rows: ListRow[]) {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: cut(buttonText, 20),
          sections: [
            {
              title: "Options",
              rows: rows.slice(0, 10).map((r) => ({
                id: r.id,
                title: cut(r.title, 24),
                ...(r.description ? { description: cut(r.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    });
  }
}
