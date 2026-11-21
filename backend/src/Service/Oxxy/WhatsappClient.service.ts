import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { deliveryFailureReason, UNCERTAIN_REASON } from "@Helper/WhatsappFailure";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { customer } from "@Database/Table/Oxxy/customer";
import { message } from "@Database/Table/Oxxy/message";
import { OutboundMessage, SendPurpose } from "@Helper/WhatsappMessage";
import { FREQUENCY_CAP_CODES, FrequencyCapError, InvalidMessageError, WhatsappApiError, WindowClosedError } from "@Helper/WhatsappErrors";
import { checkAllowed } from "./WhatsappRules";
import { buildPayload, validateMessage } from "./WhatsappPayload";
import { assertTemplateUsable, templateLanguage } from "@Service/Ops/Templates.service";

const TIMEOUT_MS = 10_000;

interface MetaErrorShape {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number; data?: { error?: { code?: number; message?: string } } };
}

// Turns whatever axios threw into one of our typed errors
export function mapMetaError(e: unknown): Error {
  const err = e as MetaErrorShape;
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const text = err?.response?.data?.error?.message ?? err?.message ?? "unknown error";

  // no response at all = network problem or our 10 s timeout: worth retrying
  if (!err?.response) {
    return new WhatsappApiError(`WhatsApp did not answer (${err?.code ?? text})`, {
      retryable: true,
      // refused / no DNS = never reached Meta; a timeout may have been delivered all the same
      maybeSent: !["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(String(err?.code ?? "")),
    });
  }
  if (code === 131047) return new WindowClosedError();
  if (code !== undefined && FREQUENCY_CAP_CODES.includes(code)) return new FrequencyCapError();
  if (code === 190) {
    return new WhatsappApiError("WHATSAPP_ACCESS_TOKEN expired or invalid", {
      retryable: false,
      metaCode: code,
      httpStatus: status,
    });
  }
  if (code === 131026) {
    return new WhatsappApiError(
      "This phone number is not on WhatsApp (or cannot receive messages)",
      {
        retryable: false,
        metaCode: code,
        httpStatus: status,
      },
    );
  }
  if (code !== undefined && code >= 132000 && code < 133000) {
    return new WhatsappApiError(`Template problem (${code}): ${text}`, {
      retryable: false,
      metaCode: code,
      httpStatus: status,
    });
  }
  return new WhatsappApiError(`WhatsApp API error${code ? ` ${code}` : ""}: ${text}`, {
    retryable: status !== undefined && status >= 500, // 5xx retry, 4xx do not
    metaCode: code,
    httpStatus: status,
  });
}

@Injectable()
export class WhatsappClient implements OnModuleInit {
  private readonly logger = new Logger(WhatsappClient.name);

  constructor(private readonly _Config: ConfigService) {}

  onModuleInit() {
    if (!this._Config.get("Whatsapp.AccessToken"))
      this.logger.warn("WHATSAPP_ACCESS_TOKEN is not set: sending will fail");
    if (!this._Config.get("Whatsapp.PhoneNumberId"))
      this.logger.warn("WHATSAPP_PHONE_NUMBER_ID is not set: sending will fail");
  }

  // load customer + conversation -> rules -> limits -> API -> save row -> wamid
  async send(
    customerId: string,
    msg: OutboundMessage,
    purpose: SendPurpose,
    replyToWaMessageId?: string,
    opts: { sender?: "bot" | "agent" | "system"; actorId?: string } = {},
  ): Promise<string> {
    const cust = await customer.findOne({ where: { id: customerId } });
    if (!cust) throw new InvalidMessageError("customer not found");
    const conv = await conversation.findOne({
      where: { customer_id: customerId },
      order: { created_on: "DESC" },
    });
    if (!conv) throw new InvalidMessageError("customer has no conversation");

    checkAllowed(msg, purpose, conv.last_customer_message_at, new Date());
    validateMessage(msg);
    // a template Meta rejected / paused / disabled is not even tried (Console -> Templates)
    if (msg.kind === "template") {
      // Hindi customer + approved Hindi version of this template = send that one
      msg = { ...msg, languageCode: await templateLanguage(msg.name, msg.languageCode, cust.language) };
      await assertTemplateUsable(msg.name, msg.languageCode);
    }

    let wamid: string;
    try {
      wamid = await this.callApi(cust.wa_number, msg);
    } catch (e) {
      // A reply Meta may have delivered (timeout) is saved as "uncertain" with its reply tag: the retry of this
      // job and the lost-message recovery then see a reply and never send it a second time (the customer saw
      // the same message twice). The console shows it, so a person can check.
      if (replyToWaMessageId && e instanceof WhatsappApiError && e.maybeSent) {
        await message
          .save(
            message.create({
              conversation_id: conv.id,
              direction: "out",
              sender: opts.sender ?? "bot",
              created_by_id: opts.actorId ?? null,
              wa_message_id: null,
              type: msg.kind,
              body: msg.kind === "template" ? (msg.log ?? null) : msg.kind === "list" && msg.log ? msg.log : msg.body,
              template_name: msg.kind === "template" ? msg.name : null,
              reply_to_wa_message_id: replyToWaMessageId,
              message_status: "uncertain",
              error_reason: UNCERTAIN_REASON,
            }),
          )
          .catch(() => undefined);
      } else if (
        (e instanceof WhatsappApiError && !e.retryable) ||
        e instanceof WindowClosedError
      ) {
        // Meta refused it for good (window closed, not on WhatsApp, template problem …): kept as "failed" with
        // the reason, so the team sees it in Conversations; a retry would fail the same way
        await message
          .save(
            message.create({
              conversation_id: conv.id,
              direction: "out",
              sender: opts.sender ?? "bot",
              created_by_id: opts.actorId ?? null,
              wa_message_id: null,
              type: msg.kind,
              body: msg.kind === "template" ? (msg.log ?? null) : msg.kind === "list" && msg.log ? msg.log : msg.body,
              template_name: msg.kind === "template" ? msg.name : null,
              reply_to_wa_message_id: replyToWaMessageId ?? null,
              message_status: "failed",
              error_reason:
                e instanceof WindowClosedError
                  ? deliveryFailureReason(131047)
                  : deliveryFailureReason(e.metaCode ?? null, e.message),
            }),
          )
          .catch(() => undefined);
      }
      throw e;
    }

    await message.save(
      message.create({
        conversation_id: conv.id,
        direction: "out",
        sender: opts.sender ?? "bot",
        created_by_id: opts.actorId ?? null,
        wa_message_id: wamid,
        type: msg.kind,
        body: msg.kind === "template" ? (msg.log ?? null) : msg.kind === "list" && msg.log ? msg.log : msg.body,
        template_name: msg.kind === "template" ? msg.name : null,
        reply_to_wa_message_id: replyToWaMessageId ?? null,
        message_status: "sent",
      }),
    );
    this.logger.log(`${wamid} sent (${msg.kind})`); // never the body or the phone number
    return wamid;
  }

  // ---- Chat opening (Meta "conversational components"): the welcome-message event and the ice breakers ----
  // Ice breakers = up to 4 questions WhatsApp shows when the customer opens the chat, before they type; a tap
  // sends that text. The welcome-message event makes WhatsApp tell us the first time a customer opens the chat
  // (a "request_welcome" message), and the bot answers it with the welcome and the options.

  private graph() {
    const base = (this._Config.get<string>("Whatsapp.ApiBase") || "https://graph.facebook.com").replace(/\/+$/, "");
    const version = this._Config.get<string>("Whatsapp.ApiVersion");
    const phoneId = this._Config.get<string>("Whatsapp.PhoneNumberId");
    const token = this._Config.get<string>("Whatsapp.AccessToken");
    if (!phoneId || !token) throw new InvalidMessageError("WhatsApp phone number id or access token is not set");
    return { url: `${base}/${version}/${phoneId}`, headers: { Authorization: `Bearer ${token}` } };
  }

  /** What WhatsApp has now: { enable_welcome_message, prompts } */
  async getChatOpening(): Promise<{ enable_welcome_message: boolean; prompts: string[] }> {
    const g = this.graph();
    try {
      const res = await axios.get<{ conversational_automation?: { enable_welcome_message?: boolean; prompts?: string[] } }>(
        `${g.url}?fields=conversational_automation`,
        { headers: g.headers, timeout: TIMEOUT_MS },
      );
      const c = res.data?.conversational_automation ?? {};
      return { enable_welcome_message: !!c.enable_welcome_message, prompts: c.prompts ?? [] };
    } catch (e) {
      throw mapMetaError(e);
    }
  }

  /** Turns the welcome event on and sets the ice breakers (1-4 questions, 80 characters each) */
  async setChatOpening(prompts: string[], enableWelcome = true): Promise<void> {
    const clean = prompts.map((p) => String(p ?? "").trim()).filter(Boolean);
    if (clean.length > 4) throw new InvalidMessageError("WhatsApp allows up to 4 quick questions");
    const long = clean.find((p) => [...p].length > 80);
    if (long) throw new InvalidMessageError(`"${long.slice(0, 30)}…" is over 80 characters`);
    const g = this.graph();
    try {
      await axios.post(
        `${g.url}/conversational_automation`,
        { enable_welcome_message: enableWelcome, prompts: clean },
        { headers: g.headers, timeout: TIMEOUT_MS },
      );
    } catch (e) {
      throw mapMetaError(e);
    }
  }

  private async callApi(to: string, msg: OutboundMessage): Promise<string> {
    const base = (this._Config.get<string>("Whatsapp.ApiBase") || "https://graph.facebook.com").replace(/\/+$/, "");
    const version = this._Config.get<string>("Whatsapp.ApiVersion");
    const phoneId = this._Config.get<string>("Whatsapp.PhoneNumberId");
    const token = this._Config.get<string>("Whatsapp.AccessToken");
    try {
      const res = await axios.post<{ messages?: { id?: string }[] }>(
        `${base}/${version}/${phoneId}/messages`,
        buildPayload(to, msg),
        { headers: { Authorization: `Bearer ${token}` }, timeout: TIMEOUT_MS },
      );
      const wamid = res.data?.messages?.[0]?.id;
      if (!wamid)
        throw new WhatsappApiError("WhatsApp did not return a message id", { retryable: false });
      return wamid;
    } catch (e) {
      if (e instanceof WhatsappApiError) throw e;
      const mapped = mapMetaError(e);
      if (mapped instanceof WhatsappApiError && mapped.metaCode === 190)
        this.logger.error(mapped.message);
      else
        this.logger.warn(
          `send (${msg.kind}) failed: ${mapped.name}${mapped instanceof WhatsappApiError ? ` retryable=${mapped.retryable}` : ""}`,
        );
      throw mapped;
    }
  }
}
