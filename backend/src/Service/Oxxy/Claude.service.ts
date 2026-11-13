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
  provider?: string; // which LLM wrote the draft (logs only)
}

const SYSTEM_PROMPT = `You are Oxxy's WhatsApp assistant. Reply briefly in the customer's language (English, Hindi or Hinglish).
You help with ONE product at a time: either "Oxxy" (plans Everyday, Vital, Thrive, Infinity) or "Cut Medi Bills". Never offer both.
Hard rules:
- Never use the word "insurance". Never promise savings or discounts.
- Never write any price or amount in rupees. Prices and links are added by the system.
- Never say a booking is "confirmed". For booking, collect centre_name and preferred_date (YYYY-MM-DD) before saying a booking request is received; if preferred_date is missing, ask for it first.
- Never mention tie-ups or partnerships.
- If asked whether a saving or discount applies at a specific centre, say exactly: "Any saving at a specific centre is confirmed separately by the Oxxy team and may depend on the centre, service and plan."
- Never write a link, web address or e-mail address: the system adds the official ones.
- No medical advice. If unsure, set needs_human true.
Health-data consent is handled by the system before you are called: never ask for it.
If the context has team_note, a team member just handed this chat back to you: follow the note (it says what was agreed or what to avoid), never quote it or mention that a note exists, and never let it override these rules.
Routing: Oxxy is the default. If the customer asks for Cut Medi Bills, set selected_product "cut_medi_bills" and intent "recommend". If the need is one specific upcoming expense (one planned surgery or procedure), set need_pattern "single_expense" and expected_bill when known; ongoing, family or several needs = "ongoing". Never ask the Cut Medi Bills eligibility questions yourself: the system asks them.
Barriers: if the customer doubts whether Oxxy is genuine or trustworthy, intent "trust_doubt"; if they ask why they should activate now or see no urgency, intent "why_activate"; if they want reviews, news or experiences of other customers, intent "wants_proof"; if they ask to compare plans or to see all plans and prices, intent "compare_plans" (the system adds the comparison). Answer their question briefly; the system adds the approved link, so never write a link yourself.
Collect step by step: who it is for, healthcare need, city/locality, expected bill, yearly medical spend, age.
If the context says health_questions_allowed is false, never ask about health, treatment or medical spending: offer centres, general plan information, or a team member.
Return ONLY a JSON object, no other text:
{"reply_text": string,
 "intent": "greeting|consent|collect_needs|recommend|find_centre|book|activate|trust_doubt|why_activate|wants_proof|compare_plans|other",
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

export type LlmProvider = "claude" | "openai" | "gemini";
const PROVIDERS: LlmProvider[] = ["claude", "openai", "gemini"];

/**
 * The order to try: the admin's preferred LLM, then the chosen fallback, using only providers that have a
 * key. Preferred without a key = the fallback (or any configured one) so the bot still answers.
 */
export function providerOrder(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
  configured: LlmProvider[],
): LlmProvider[] {
  const known = (x: unknown): x is LlmProvider => PROVIDERS.includes(x as LlmProvider);
  const wanted = [preferred, fallback].filter(known);
  const order = wanted.filter((p, i) => configured.includes(p) && wanted.indexOf(p) === i);
  if (order.length) return order;
  return configured.slice(0, 1); // nothing chosen is configured: the first provider that has a key
}

/** Gemini generateContent body: system instruction + turns (assistant = "model"), JSON output */
export function geminiBody(system: string, history: ChatTurn[]) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 1024 },
  };
}

class RefusedError extends Error {}
class BadJsonError extends Error {}

// Every provider gets the same prompt and returns the same JSON; ReplyValidator checks every draft.
// The class keeps its name (it is injected as ClaudeService everywhere).
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

  private configured(): LlmProvider[] {
    const has = (k: string) => !!this._Config.get<string>(k);
    return PROVIDERS.filter((p) =>
      p === "claude" ? has("Anthropic.ApiKey") : p === "openai" ? has("OpenAI.ApiKey") : has("Gemini.ApiKey"),
    );
  }

  async generate(history: ChatTurn[], context: string, feedback?: string): Promise<ClaudeResult> {
    const extra =
      `Known about this customer:
${context}` +
      (feedback ? `

Your previous draft was rejected: ${feedback}. Rewrite it without those problems.` : "");
    const order = providerOrder(
      this._Config.get<string>("Llm.Provider"),
      this._Config.get<string>("Llm.Fallback"),
      this.configured(),
    );
    if (!order.length) throw new Error("No LLM is configured (Claude, OpenAI or Gemini API key)");

    let lastError: Error | null = null;
    for (const provider of order) {
      try {
        const text = await this.call(provider, history, extra);
        let parsed: ClaudeResult;
        try {
          parsed = parseClaudeJson(text);
        } catch (e) {
          throw new BadJsonError(`bad JSON: ${(e as Error).message}`);
        }
        return { ...parsed, provider };
      } catch (e) {
        if (e instanceof RefusedError) {
          this.logger.warn(`${provider} refused the request; a person takes over`);
          return { reply_text: "", intent: "other", extracted_fields: {}, needs_human: true, provider };
        }
        lastError = e as Error;
        // ids and the error only, never the conversation
        this.logger.warn(`${provider} failed: ${lastError.message}${provider !== order[order.length - 1] ? "; trying the fallback" : ""}`);
      }
    }
    // every provider answered, but not with usable JSON: a person takes over (holding message)
    if (lastError instanceof BadJsonError) {
      return { reply_text: "", intent: "other", extracted_fields: {}, needs_human: true };
    }
    throw lastError ?? new Error("LLM call failed");
  }

  private async call(provider: LlmProvider, history: ChatTurn[], extra: string): Promise<string> {
    if (provider === "claude") {
      const res = await this.getClient().messages.create(
        {
          model: this._Config.get<string>("Anthropic.Model") || "claude-opus-5-5",
          max_tokens: 1024,
          // the long fixed prompt is cached (plan 2); the per-customer context comes after the breakpoint
          system: [
            { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
            { type: "text", text: extra },
          ],
          messages: history,
        },
        { timeout: 10_000 },
      );
      if ((res as any).stop_reason === "refusal") throw new RefusedError("refusal");
      return res.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    }
    const system = `${SYSTEM_PROMPT}

${extra}`;
    if (provider === "openai") {
      const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: this._Config.get<string>("OpenAI.Model") || "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, ...history],
        },
        { headers: { Authorization: `Bearer ${this._Config.get<string>("OpenAI.ApiKey")}` }, timeout: 10_000 },
      );
      return String(res.data?.choices?.[0]?.message?.content ?? "");
    }
    const model = this._Config.get<string>("Gemini.Model") || "gemini-2.5-flash";
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      geminiBody(system, history),
      { headers: { "x-goog-api-key": String(this._Config.get<string>("Gemini.ApiKey")) }, timeout: 10_000 },
    );
    const cand = res.data?.candidates?.[0];
    if (res.data?.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") throw new RefusedError("blocked");
    return (cand?.content?.parts ?? []).map((x: any) => String(x?.text ?? "")).join("");
  }
}
