import { Injectable, Logger } from "@nestjs/common";
import { ILike } from "typeorm";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { message } from "@Database/Table/Oxxy/message";
import { need } from "@Database/Table/Oxxy/need";
import { centre } from "@Database/Table/Oxxy/centre";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { activation } from "@Database/Table/Oxxy/activation";
import { task } from "@Database/Table/Oxxy/task";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { TaskType } from "@Helper/Enum/TaskType";
import { TaskPriority } from "@Helper/Enum/TaskPriority";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { ProductType } from "@Helper/Enum/ProductType";
import { BillingCycle } from "@Helper/Enum/BillingCycle";
import { GuardrailService } from "./Guardrail.service";
import { ClaudeService, ChatTurn, ClaudeResult } from "./Claude.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { WhatsappClient } from "./WhatsappClient.service";
import { ValueCheckService } from "./ValueCheck.service";
import { CentreSearchService } from "./CentreSearch.service";
import { BookingService } from "./Booking.service";
import { DateWindowService } from "./DateWindow.service";

export const HOLDING_MESSAGE = "Thank you for your message. Our team will get back to you shortly.";

export interface Inbound {
  waNumber: string;
  waMessageId: string;
  text: string;
  location?: { latitude: number; longitude: number };
}

export interface Saved {
  customer: customer;
  conversation: conversation;
}

@Injectable()
export class ChatPipelineService {
  private readonly logger = new Logger(ChatPipelineService.name);

  constructor(
    private readonly _Guardrail: GuardrailService,
    private readonly _Claude: ClaudeService,
    private readonly _Validator: ReplyValidatorService,
    private readonly _Wa: WhatsappClient,
    private readonly _ValueCheck: ValueCheckService,
    private readonly _CentreSearch: CentreSearchService,
    private readonly _Booking: BookingService,
    private readonly _DateWindow: DateWindowService,
  ) {}

  // Step 1: dedupe + save. Returns null for a duplicate wa_message_id.
  async saveInbound(m: Inbound): Promise<Saved | null> {
    if (m.waMessageId && (await message.findOne({ where: { wa_message_id: m.waMessageId } })))
      return null;

    let cust = await customer.findOne({ where: { wa_number: m.waNumber } });
    if (!cust) {
      cust = await customer.save(customer.create({ wa_number: m.waNumber } as any));
      await consent.save(consent.create({ customer_id: cust.id } as any));
    }
    let conv = await conversation.findOne({
      where: { customer_id: cust.id, closed_at: null as any },
      order: { created_on: "DESC" } as any,
    });
    if (!conv) conv = await conversation.save(conversation.create({ customer_id: cust.id } as any));
    conv.last_customer_message_at = new Date();
    await conv.save();

    await message.save(
      message.create({
        conversation_id: conv.id,
        direction: "in",
        sender: "customer",
        wa_message_id: m.waMessageId,
        body: m.text,
        message_status: "received",
      } as any),
    );
    return { customer: cust, conversation: conv };
  }

  private async sendAndSave(conv: conversation, to: string, text: string, sender = "bot") {
    const waId = await this._Wa.sendText(to, text);
    await message.save(
      message.create({
        conversation_id: conv.id,
        direction: "out",
        sender,
        wa_message_id: waId,
        body: text,
        message_status: "sent",
      } as any),
    );
  }

  private async createTask(type: TaskType, priority: TaskPriority, s: Saved, summary: string) {
    await task.save(
      task.create({
        type,
        task_status: TaskStatus.Open,
        priority,
        customer_id: s.customer.id,
        conversation_id: s.conversation.id,
        summary,
      } as any),
    );
  }

  // Pipeline: guardrails -> last 20 messages -> Claude -> validator -> send -> save
  async process(m: Inbound, s: Saved): Promise<void> {
    const cons = await consent.findOne({ where: { customer_id: s.customer.id } });
    if (cons?.opt_out_at) return; // opted out: no messages at all

    // 1. Guardrails (before Claude, fixed replies)
    const hit = this._Guardrail.check(m.text);
    if (hit) {
      if (hit.kind === "stop") {
        cons.opt_out_at = new Date();
        await cons.save();
        s.conversation.state = ConversationState.OptedOut;
        s.conversation.closed_at = new Date();
        await s.conversation.save();
        return;
      }
      await this.createTask(
        TaskType.Emergency,
        TaskPriority.Urgent,
        s,
        `${hit.kind}: ${m.text}`.slice(0, 500),
      );
      await this.sendAndSave(s.conversation, m.waNumber, hit.reply);
      return;
    }

    // 2. Last 20 messages
    const rows = await message.find({
      where: { conversation_id: s.conversation.id },
      order: { created_on: "DESC" } as any,
      take: 20,
    });
    const history: ChatTurn[] = rows
      .reverse()
      .filter((r) => r.body)
      .map((r) => ({ role: r.direction === "in" ? "user" : "assistant", content: r.body }));
    // Claude needs the conversation to start with and end on a user turn
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length) history.push({ role: "user", content: m.text });

    const context = this.describe(s.customer, cons);

    // 3. Claude + validator (retry once)
    let result: ClaudeResult | null = null;
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        const draft = await this._Claude.generate(history, context, feedback);
        if (draft.needs_human && !draft.reply_text) break;
        const v = await this._Validator.validate(draft.reply_text);
        if (v.ok && draft.reply_text) result = draft;
        else feedback = v.reasons.join("; ") || "empty reply";
      } catch (e: any) {
        this.logger.error(`Claude call failed: ${e.message}`);
        feedback = "technical error";
      }
    }
    if (!result) {
      await this.createTask(
        TaskType.HoldingMessage,
        TaskPriority.High,
        s,
        `Draft rejected: ${feedback ?? "n/a"}`,
      );
      await this.sendAndSave(s.conversation, m.waNumber, HOLDING_MESSAGE);
      return;
    }

    // 4. Apply extracted fields + system-built additions (prices, links, centres come from the DB)
    const extras = await this.applyResult(result, s, m);
    const finalText = [result.reply_text, ...extras].join("\n\n");

    if (result.needs_human) {
      await this.createTask(
        TaskType.HumanHandoff,
        TaskPriority.Normal,
        s,
        result.reply_text.slice(0, 500),
      );
      s.conversation.state = ConversationState.Human;
      await s.conversation.save();
    }
    await this.sendAndSave(s.conversation, m.waNumber, finalText);
  }

  private describe(c: customer, cons: consent | null): string {
    return JSON.stringify({
      first_name: c.first_name,
      language: c.language,
      age: c.age,
      active_product: c.active_product,
      whatsapp_consent: cons?.whatsapp_consent,
      health_data_consent: cons?.health_data_consent,
    });
  }

  private async applyResult(r: ClaudeResult, s: Saved, m: Inbound): Promise<string[]> {
    const f = r.extracted_fields || {};
    const extras: string[] = [];
    const c = s.customer;
    const conv = s.conversation;

    // customer fields
    if (f.first_name) c.first_name = String(f.first_name);
    if (["en", "hi", "hinglish"].includes(f.language)) c.language = f.language;
    if (Number.isFinite(Number(f.age)) && Number(f.age) > 0) c.age = Number(f.age);

    // rule: one active product per customer
    if (f.selected_product && Object.values(ProductType).includes(f.selected_product)) {
      if (c.active_product && c.active_product !== f.selected_product) {
        extras.push(
          "You already have an active product with us, so I can help only with that one.",
        );
      } else {
        conv.selected_product = f.selected_product;
      }
    }
    await c.save();

    // consent
    if (f.whatsapp_consent != null || f.health_data_consent != null) {
      const cons = await consent.findOne({ where: { customer_id: c.id } });
      if (f.whatsapp_consent != null) cons.whatsapp_consent = !!f.whatsapp_consent;
      if (f.health_data_consent != null) cons.health_data_consent = !!f.health_data_consent;
      await cons.save();
    }

    // needs
    const needKeys = [
      "beneficiary",
      "healthcare_need",
      "specialisation",
      "city",
      "locality",
      "travel_radius_km",
      "service_date",
      "expected_bill",
      "annual_medical_spend",
      "insurance_status",
    ];
    const needData: any = {};
    for (const k of needKeys) if (f[k] != null && f[k] !== "") needData[k] = f[k];
    let n = await need.findOne({ where: { conversation_id: conv.id } });
    if (Object.keys(needData).length) {
      if (!n) n = need.create({ conversation_id: conv.id } as any);
      Object.assign(n, needData);
      await n.save();
    }

    // intent actions
    if (r.intent === "recommend" && n?.annual_medical_spend) {
      const product = conv.selected_product || ProductType.Oxxy;
      const pick = await this._ValueCheck.recommend(
        Number(n.annual_medical_spend),
        c.age ?? null,
        product,
      );
      if (pick) {
        conv.recommended_plan = pick.plan;
        conv.state = ConversationState.Recommend;
        const gst = 0.18;
        extras.push(
          `Suggested plan: ${pick.plan.toUpperCase()} - \u20b9${pick.price} per year + GST ` +
            `(\u20b9${Math.round(pick.price * (1 + gst))} incl. 18% GST).`,
        );
      }
    }

    if (r.intent === "find_centre") {
      const list = await this._CentreSearch.search({
        latitude: m.location?.latitude,
        longitude: m.location?.longitude,
        radiusKm: n?.travel_radius_km ?? 10,
        specialisation: n?.specialisation,
        city: n?.city,
      });
      if (list.length) {
        extras.push(
          "Centres near you:\n" +
            list
              .map(
                (x, i) =>
                  `${i + 1}. ${x.name}${x.branch ? ", " + x.branch : ""} (${x.locality || x.city})`,
              )
              .join("\n"),
        );
      }
    }

    if (r.intent === "book" && f.preferred_date) {
      const chk = this._DateWindow.validate(String(f.preferred_date));
      if (!chk.valid) {
        extras.push(`Please choose a date between ${chk.min} and ${chk.max}.`);
      } else if (f.centre_name) {
        const ctr = await centre.findOne({
          where: { name: ILike(`%${String(f.centre_name)}%`), verified: true, active: true },
        });
        if (ctr) {
          await this._Booking.create({
            customer_id: c.id,
            conversation_id: conv.id,
            centre_id: ctr.id,
            specialisation: n?.specialisation,
            preferred_date: String(f.preferred_date),
            preferred_time: f.preferred_time ? String(f.preferred_time) : undefined,
          });
          await this.createTask(
            TaskType.BookingConfirm,
            TaskPriority.Normal,
            s,
            `Booking request at ${ctr.name} on ${f.preferred_date}`,
          );
          conv.state = ConversationState.Booking;
          extras.push(
            "Your booking request has been received. Our team will confirm it with you shortly.",
          );
        }
      }
    }

    if (r.intent === "activate" && conv.recommended_plan && !c.active_product) {
      const product = conv.selected_product || ProductType.Oxxy;
      const cat = await plan_catalog.findOne({
        where: { product, plan: conv.recommended_plan, billing: BillingCycle.Yearly, status: true },
      });
      if (cat?.activation_link) {
        await activation.save(
          activation.create({
            customer_id: c.id,
            catalog_id: cat.id,
            product: cat.product,
            plan: cat.plan,
            billing: cat.billing,
            link_sent_at: new Date(),
            payment_status: PaymentStatus.Pending,
            activation_status: ActivationStatus.LinkSent,
          } as any),
        );
        conv.state = ConversationState.Activation;
        extras.push(`Activation link: ${cat.activation_link}`);
      } else {
        await this.createTask(
          TaskType.Activation,
          TaskPriority.Normal,
          s,
          "Activation link missing in plan_catalog",
        );
      }
    }

    await conv.save();
    return extras;
  }
}
