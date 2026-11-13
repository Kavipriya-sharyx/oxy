import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";

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
- Never say a booking is "confirmed". For booking, collect centre_name and preferred_date (YYYY-MM-DD) before saying a booking request is received; if preferred_date is missing, ask for it first.
- Never mention tie-ups or partnerships.
- No medical advice. If unsure, set needs_human true.
Health-data consent is handled by the system before you are called: never ask for it.
Routing: Oxxy is the default. If the customer asks for Cut Medi Bills, set selected_product "cut_medi_bills" and intent "recommend". If the need is one specific upcoming expense (one planned surgery or procedure), set need_pattern "single_expense" and expected_bill when known; ongoing, family or several needs = "ongoing". Never ask the Cut Medi Bills eligibility questions yourself: the system asks them.
Collect step by step: who it is for, healthcare need, city/locality, expected bill, yearly medical spend, age.
If the context says health_questions_allowed is false, never ask about health, treatment or medical spending: offer centres, general plan information, or a team member.
Return ONLY a JSON object, no other text:
{"reply_text": string,
 "intent": "greeting|consent|collect_needs|recommend|find_centre|book|activate|other",
 "extracted_fields": {"first_name","language","age","selected_product","beneficiary","healthcare_need","need_pattern","urgency","condition_if_voluntary","pre_existing","specialisation","city","locality","postcode","travel_radius_km","service_date","preferred_date","preferred_time","centre_name","billing","expected_bill","annual_medical_spend","insurance_status","whatsapp_consent","health_data_consent"},
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
  private clientApiKey = "";

  constructor(private readonly _Config: ConfigService) {}

  private getClient() {
    const apiKey = this._Config.get<string>("Anthropic.ApiKey") || "";
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    if (!this.client || this.clientApiKey !== apiKey) {
      this.client = new Anthropic({ apiKey });
      this.clientApiKey = apiKey;
    }
    return this.client;
  }

  async generate(history: ChatTurn[], context: string, feedback?: string): Promise<ClaudeResult> {
    const system =
      `${SYSTEM_PROMPT}\n\nKnown about this customer:\n${context}` +
      (feedback
        ? `\n\nYour previous draft was rejected: ${feedback}. Rewrite it without those problems.`
        : "");

    const anthropicKey = this._Config.get<string>("Anthropic.ApiKey");
    const openAiKey = this._Config.get<string>("OpenAI.ApiKey");

    let text = "";
    if (anthropicKey) {
      const res = await this.getClient().messages.create(
        {
          model: "claude-opus-5-5",
          max_tokens: 1024,
          // the long fixed prompt is cached (plan 2); the per-customer context comes after the breakpoint
          system: [
            { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
            { type: "text", text: system.slice(SYSTEM_PROMPT.length).trim() || "No context." },
          ],
          messages: history,
        },
        { timeout: 10_000 },
      );
      if ((res as any).stop_reason === "refusal") {
        this.logger.warn("Claude refused response; escalating to human fallback");
        return { reply_text: "", intent: "other", extracted_fields: {}, needs_human: true };
      }
      text = res.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    } else if (openAiKey) {
      const model = this._Config.get<string>("OpenAI.Model") || "gpt-4o-mini";
      const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, ...history],
        },
        {
          headers: { Authorization: `Bearer ${openAiKey}` },
          timeout: 10_000,
        },
      );
      text = String(res.data?.choices?.[0]?.message?.content ?? "");
    } else {
      throw new Error("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set");
    }

    try {
      return parseClaudeJson(text);
    } catch (e: any) {
      this.logger.warn(`Bad JSON from AI: ${e.message}`);
      return { reply_text: "", intent: "other", extracted_fields: {}, needs_human: true };
    }
  }
}
