import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResult {
  reply_text: string;
  intent: string;
  extracted_fields: Record<string, any>;
  needs_human: boolean;
}

const SYSTEM_PROMPT = `You are Oxxy's WhatsApp assistant. Reply briefly in the customer's language (English, Hindi or Hinglish).
You help with ONE product at a time: either "Oxxy" (plans Everyday, Vital, Thrive, Infinity) or "Cut Medi Bills". Never offer both.
Hard rules:
- Never use the word "insurance". Never promise savings or discounts.
- Never write any price or amount in rupees. Prices and links are added by the system.
- Never say a booking is "confirmed". Say the request is received and the team will confirm it.
- Never mention tie-ups or partnerships.
- No medical advice. If unsure, set needs_human true.
Collect step by step: consent, who it is for, healthcare need, city/locality, expected bill, yearly medical spend, age.
Return ONLY a JSON object, no other text:
{"reply_text": string,
 "intent": "greeting|consent|collect_needs|recommend|find_centre|book|activate|other",
 "extracted_fields": {"first_name","language","age","selected_product","beneficiary","healthcare_need","specialisation","city","locality","travel_radius_km","service_date","preferred_date","preferred_time","centre_name","expected_bill","annual_medical_spend","insurance_status","whatsapp_consent","health_data_consent"},
 "needs_human": boolean}
Only include extracted_fields you actually learned. Dates are YYYY-MM-DD.`;

export function parseClaudeJson(raw: string): ClaudeResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON in Claude reply");
  const o = JSON.parse(raw.slice(start, end + 1));
  return {
    reply_text: String(o.reply_text ?? ""),
    intent: String(o.intent ?? "other"),
    extracted_fields:
      o.extracted_fields && typeof o.extracted_fields === "object" ? o.extracted_fields : {},
    needs_human: !!o.needs_human,
  };
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;

  constructor(private readonly _Config: ConfigService) {}

  private getClient() {
    if (!this.client) {
      const apiKey = this._Config.get("Anthropic.ApiKey");
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generate(history: ChatTurn[], context: string, feedback?: string): Promise<ClaudeResult> {
    const system =
      `${SYSTEM_PROMPT}\n\nKnown about this customer:\n${context}` +
      (feedback
        ? `\n\nYour previous draft was rejected: ${feedback}. Rewrite it without those problems.`
        : "");
    const res = await this.getClient().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      system,
      messages: history,
    });
    const text = res.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    try {
      return parseClaudeJson(text);
    } catch (e: any) {
      this.logger.warn(`Bad JSON from Claude: ${e.message}`);
      return { reply_text: "", intent: "other", extracted_fields: {}, needs_human: true };
    }
  }
}
