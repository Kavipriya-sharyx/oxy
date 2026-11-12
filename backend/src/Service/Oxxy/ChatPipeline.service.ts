import { Injectable, Logger } from "@nestjs/common";
import { ILike, In } from "typeorm";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { message } from "@Database/Table/Oxxy/message";
import { need } from "@Database/Table/Oxxy/need";
import { centre } from "@Database/Table/Oxxy/centre";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { activation } from "@Database/Table/Oxxy/activation";
import { task } from "@Database/Table/Oxxy/task";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { fixedReply, NEUTRAL_SAVINGS_LINE, NOTICE_VERSION } from "@Helper/FixedReplies";
import { OutboundMessage } from "@Helper/WhatsappMessage";
import { matchMenuRow, menuReply, openingList, WELCOME } from "@Helper/OpeningMenu";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { TaskType } from "@Helper/Enum/TaskType";
import { TaskPriority } from "@Helper/Enum/TaskPriority";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { ProductType } from "@Helper/Enum/ProductType";
import { BillingCycle } from "@Helper/Enum/BillingCycle";
import { GuardrailService, GuardrailHit } from "./Guardrail.service";
import { ClaudeService, ChatTurn, ClaudeResult } from "./Claude.service";
import { ReplyValidatorService } from "./ReplyValidator.service";
import { WhatsappClient } from "./WhatsappClient.service";
import { ValueCheckService } from "./ValueCheck.service";
import { CentreSearchService } from "./CentreSearch.service";
import { BookingService } from "./Booking.service";
import { DateWindowService } from "./DateWindow.service";
import { DataSource } from "typeorm";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { ConversationRepository } from "./ConversationRepository.service";
import { InvalidTransitionError } from "./ConversationStateMachine";
import {
  asksHealthQuestion,
  healthConsentStatus,
  parseConsentAnswer,
  withoutHealthFields,
} from "./HealthConsent";

export const HOLDING_MESSAGE = "Thank you for your message. Our team will get back to you shortly.";

export interface Inbound {
  waNumber: string;
  waMessageId: string;
  text: string; // "" for non-text messages
  type?: string;
  timestamp?: Date;
  profileName?: string;
  location?: { latitude: number; longitude: number };
}

// Postgres unique_violation
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; driverError?: { code?: string } };
  return err?.code === "23505" || err?.driverError?.code === "23505";
}

export interface Saved {
  customer: customer;
  conversation: conversation;
  message?: message;
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
    private readonly _DataSource: DataSource,
    private readonly _Outbox: CrmOutboxService,
    private readonly _ConvRepo: ConversationRepository,
  ) {}

  // Step 1: dedupe + save. Returns null for a duplicate wa_message_id.
  async saveInbound(m: Inbound): Promise<Saved | null> {
    if (m.waMessageId && (await message.findOne({ where: { wa_message_id: m.waMessageId } })))
      return null;

    let cust = await customer.findOne({ where: { wa_number: m.waNumber } });
    if (!cust) {
      const created = await this._DataSource.transaction(async (mg) => {
        const c = await mg.save(
          mg.create(customer, { wa_number: m.waNumber, first_name: m.profileName ?? null }),
        );
        await mg.save(mg.create(consent, { customer_id: c.id }));
        const row = await this._Outbox.enqueue(mg, CrmAction.UpsertCustomer, c.id, {
          customer_id: c.id,
          wa_number: m.waNumber,
        });
        return { c, row };
      });
      cust = created.c;
      await this._Outbox.dispatch(created.row);
    } else if (!cust.first_name && m.profileName) {
      cust.first_name = m.profileName;
      await cust.save();
    }
    const conv = (await this._ConvRepo.findOpenByCustomer(cust.id)) ?? (await this._ConvRepo.openNew(cust.id));
    conv.last_customer_message_at = new Date();
    // update only this column: a full save() could overwrite the state the repository just wrote
    await conversation.update(conv.id, { last_customer_message_at: conv.last_customer_message_at });

    let saved: message;
    try {
      saved = await message.save(
        message.create({
          conversation_id: conv.id,
          direction: "in",
          sender: "customer",
          wa_message_id: m.waMessageId,
          type: m.type ?? "text",
          body: m.text,
          wa_timestamp: m.timestamp ?? null,
          message_status: "received",
        }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) return null; // same wamid arrived twice at once
      throw e;
    }
    return { customer: cust, conversation: conv, message: saved };
  }

  private async alreadyReplied(inboundWamid: string): Promise<boolean> {
    if (!inboundWamid) return false;
    return !!(await message.findOne({ where: { direction: "out", reply_to_wa_message_id: inboundWamid } }));
  }

  // WhatsappClient.send() checks the rules, sends and saves the outbound row (tagged with the inbound wamid).
  // If a reply to this inbound message already exists, nothing is sent.
  private async sendAndSave(customerId: string, content: string | OutboundMessage, replyTo: string) {
    if (await this.alreadyReplied(replyTo)) return;
    const msg: OutboundMessage = typeof content === "string" ? { kind: "text", body: content } : content;
    try {
      await this._Wa.send(customerId, msg, "reply", replyTo);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // someone else already saved a reply: fine
    }
  }

  // Change state only through ConversationRepository. A change the state machine does not allow
  // is logged (ids and state names only) and skipped, never forced.
  private async setState(s: Saved, path: ConversationState[]): Promise<void> {
    if (s.conversation.state === path[path.length - 1]) return;
    for (const to of path) {
      try {
        const updated = await this._ConvRepo.transition(s.conversation.id, to);
        s.conversation.state = updated.state;
      } catch (e) {
        if (e instanceof InvalidTransitionError) {
          this.logger.warn(`conversation ${s.conversation.id}: state change ${e.from} -> ${e.to} not allowed, skipped`);
          return;
        }
        throw e;
      }
    }
  }

  private async createTask(type: TaskType, priority: TaskPriority, s: Saved, summary: string) {
    const row = await this._DataSource.transaction(async (mg) => {
      const t = await mg.save(
        mg.create(task, {
          type,
          task_status: TaskStatus.Open,
          priority,
          customer_id: s.customer.id,
          conversation_id: s.conversation.id,
          summary,
        } as any),
      );
      return await this._Outbox.enqueue(mg, CrmAction.CreateTask, s.customer.id, {
        task_id: (t as any).id,
        type,
        priority,
        summary,
        conversation_id: s.conversation.id,
      });
    });
    await this._Outbox.dispatch(row);
  }

  // Task for a guardrail event. Stores only type, priority, and the inbound wamid (no message text,
  // no health detail). Safe to call again for the same wamid: the second call creates nothing.
  private async createTaskOnce(type: TaskType, priority: TaskPriority, s: Saved, summary: string) {
    const exists = await task.findOne({
      where: { conversation_id: s.conversation.id, type, summary },
    });
    if (exists) return;
    await this.createTask(type, priority, s, summary);
  }

  // An open booking request or an unpaid activation = a human must still follow up after STOP
  private async openCases(customerId: string): Promise<{ booking: boolean; payment: boolean }> {
    const booking = await booking_request.findOne({
      where: {
        customer_id: customerId,
        booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]),
      },
    });
    const payment = await activation.findOne({
      where: {
        customer_id: customerId,
        payment_status: PaymentStatus.Pending,
        activation_status: In([ActivationStatus.Pending, ActivationStatus.LinkSent]),
      },
    });
    return { booking: !!booking, payment: !!payment };
  }

  // Opt-out + state OPTED_OUT + CRM outbox row: all or nothing.
  // Not built yet (no follow_up table and no scheduler exist): cancelling pending follow-ups and
  // delayed jobs. Today the only marketing flag is consent.marketing_consent. The inbound
  // recovery job already skips opted-out customers.
  private async recordOptOut(s: Saved, cons: consent | null) {
    const at = new Date();
    const row = await this._DataSource.transaction(async (mg) => {
      const c = cons ?? mg.create(consent, { customer_id: s.customer.id });
      c.opt_out_at = at;
      c.marketing_consent = false;
      await mg.save(c);
      try {
        const updated = await this._ConvRepo.transition(s.conversation.id, ConversationState.OptedOut, {
          reason: "stop",
          manager: mg,
        });
        s.conversation.state = updated.state;
      } catch (e) {
        // STOP must always work: the opt-out is saved even if the state change is refused
        if (!(e instanceof InvalidTransitionError)) throw e;
        this.logger.warn(`conversation ${s.conversation.id}: state change ${e.from} -> ${e.to} not allowed, skipped`);
      }
      return await this._Outbox.enqueue(mg, CrmAction.SetOptOut, s.customer.id, {
        customer_id: s.customer.id,
        opt_out_at: at.toISOString(),
      });
    });
    await this._Outbox.dispatch(row);
  }

  // Fixed replies, no Claude. Each branch: task first (once per wamid), then state, then the reply
  // last, so a retried job after a failed send still ends with the reply and no second task.
  private async handleGuardrail(hit: GuardrailHit, m: Inbound, s: Saved, cons: consent | null) {
    const optedOut = !!cons?.opt_out_at;
    const lang = s.customer.language;
    const ref = `wamid:${m.waMessageId}`;

    if (hit.kind === "emergency" || hit.kind === "self_harm") {
      const type = hit.kind === "emergency" ? TaskType.Emergency : TaskType.SelfHarm;
      await this.createTaskOnce(type, TaskPriority.Urgent, s, ref);
      // an opted-out customer stays OPTED_OUT (the machine would refuse PAUSE anyway); safety reply still goes out
      if (!optedOut) await this.setState(s, [ConversationState.Pause]);
      if (hit.also_stop && !optedOut) await this.recordOptOut(s, cons); // PAUSE -> OPTED_OUT
      await this.sendAndSave(s.customer.id, fixedReply(hit.kind, lang), m.waMessageId);
      return;
    }

    if (optedOut) return; // STOP again, or a request for a person: no messages to an opted-out customer

    if (hit.kind === "stop") {
      const open = await this.openCases(s.customer.id);
      await this.recordOptOut(s, cons);
      if (open.booking || open.payment) {
        await this.createTaskOnce(
          TaskType.OptOutOpenCase,
          TaskPriority.Normal,
          s,
          `${ref} opted out, ${open.booking ? "booking request" : "payment"} still open`,
        );
      }
      await this.sendAndSave(
        s.customer.id,
        fixedReply(open.booking ? "opt_out_booking" : "opt_out", lang),
        m.waMessageId,
      );
      return;
    }

    // talk to a person
    await this.createTaskOnce(TaskType.Escalation, TaskPriority.Normal, s, `${ref} customer asked for a person`);
    await this.setState(s, [ConversationState.Escalated]);
    await this.sendAndSave(s.customer.id, fixedReply("escalation", lang), m.waMessageId);
  }

  // DPDP consent step. Ends the turn. No Claude call, no health question, no other text than the fixed replies.
  //  none     -> send the notice (nothing else in this turn), then remember it was sent
  //  awaiting -> read this message as the answer: YES / NO saved first, then the reply; unclear -> ask again
  private async handleConsentStep(status: "none" | "awaiting", m: Inbound, s: Saved, cons: consent | null) {
    const lang = s.customer.language;
    const customerId = s.customer.id;

    if (status === "none") {
      await this.sendAndSave(customerId, fixedReply("health_notice", lang), m.waMessageId);
      await this.saveConsentRow(customerId, cons, (c) => {
        c.notice_sent_at = new Date();
        c.notice_sent_version = NOTICE_VERSION;
      });
      return;
    }

    const answer = parseConsentAnswer(m.text);
    if (answer === "yes") {
      // saved BEFORE the reply: if saving fails nothing is sent and nothing is allowed (the job is retried)
      await this.saveConsentRow(customerId, cons, (c) => {
        c.health_data_consent = true;
        c.notice_version = NOTICE_VERSION;
        c.consent_timestamp = new Date();
        c.consent_source = m.waMessageId;
        c.health_refused_at = null;
        c.health_refused_version = null;
      });
      const ack = fixedReply("health_consent_yes", lang);
      if (s.conversation.state === ConversationState.New) {
        // the first thing after consent: welcome + the 4-row opening list
        await this.sendAndSave(customerId, openingList(lang, ack), m.waMessageId);
        await this.setState(s, [ConversationState.IntentMenu]);
      } else {
        await this.sendAndSave(customerId, `${ack} ${WELCOME[lang === "hi" || lang === "hinglish" ? lang : "en"]}`, m.waMessageId);
      }
    } else if (answer === "no") {
      await this.saveConsentRow(customerId, cons, (c) => {
        c.health_data_consent = false;
        c.consent_timestamp = null;
        c.consent_source = m.waMessageId;
        c.health_refused_at = new Date();
        c.health_refused_version = NOTICE_VERSION;
      });
      await this.sendAndSave(customerId, fixedReply("health_consent_no", lang), m.waMessageId);
    } else {
      await this.sendAndSave(customerId, fixedReply("health_consent_unclear", lang), m.waMessageId);
    }
  }

  // One transaction; throws when it cannot save (fail closed)
  private async saveConsentRow(customerId: string, cons: consent | null, change: (c: consent) => void) {
    await this._DataSource.transaction(async (mg) => {
      const c = cons ?? mg.create(consent, { customer_id: customerId });
      change(c);
      await mg.save(c);
    });
  }

  // Pipeline: guardrails -> consent gate -> last 20 messages -> Claude -> validator -> send -> save
  async process(m: Inbound, s: Saved): Promise<void> {
    // a retried job must not do the work (or reply) twice: already answered = job done
    if (await this.alreadyReplied(m.waMessageId)) return;

    const cons = await consent.findOne({ where: { customer_id: s.customer.id } });

    // 1. Guardrails run first: before Claude, before any context is loaded, and even for an
    // opted-out customer (a safety reply must still go out). A hit ends the turn.
    const hit = this._Guardrail.check(m.text);
    if (hit) {
      await this.handleGuardrail(hit, m, s, cons);
      return;
    }

    if (cons?.opt_out_at) return; // opted out: no messages at all

    // 1b. DPDP health-data consent gate. Server-side, before any context is loaded and before Claude is
    // called, so no health question can be asked (or even generated) until YES is saved for the CURRENT
    // notice version. Only the customer's own words decide it, never Claude. Any other state fails closed.
    const consentStatus = healthConsentStatus(cons);
    if (consentStatus === "none" || consentStatus === "awaiting") {
      await this.handleConsentStep(consentStatus, m, s, cons);
      return;
    }
    const healthBlocked = consentStatus === "refused"; // refused: Claude may talk, but never about health

    // 1c. Opening list (plan 12.2). A new conversation gets the welcome + 4-row list (state INTENT_MENU).
    // A tap on a row goes to that row's state with a fixed reply. Anything else is a normal conversation.
    if (consentStatus === "granted") {
      const row = matchMenuRow(m.text);
      const tapped = !!row && m.text.trim().toLowerCase() === row.id; // a list tap sends the row id
      if (row && (tapped || s.conversation.state === ConversationState.IntentMenu)) {
        await this.sendAndSave(s.customer.id, menuReply(row, s.customer.language), m.waMessageId);
        await this.setState(s, [row.state]);
        return;
      }
      if (s.conversation.state === ConversationState.New) {
        await this.sendAndSave(s.customer.id, openingList(s.customer.language), m.waMessageId);
        await this.setState(s, [ConversationState.IntentMenu]);
        return;
      }
    }

    // the first message of a conversation starts the discovery
    await this.setState(s, [ConversationState.Discovery]);

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
    // the current message must be the last (user) turn
    if (history[history.length - 1].role !== "user") history.push({ role: "user", content: m.text });

    const context = this.describe(s.customer, cons, !healthBlocked);

    // 3. Claude + validator (retry once)
    let result: ClaudeResult | null = null;
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        const draft = await this._Claude.generate(history, context, feedback);
        if (draft.needs_human && !draft.reply_text) break;
        // refused customer: a reply that asks about health is never sent (checked here, not by prompt)
        if (healthBlocked && asksHealthQuestion(draft.reply_text)) {
          feedback = "do not ask any health question";
          continue;
        }
        // prices and plan names only from plan_catalog; nothing about a second product
        const lockedProduct = s.customer.active_product || s.conversation.selected_product || null;
        const v = await this._Validator.validate(draft.reply_text, { lockedProduct });
        if (v.ok && draft.reply_text) result = draft;
        else {
          feedback = v.reasons.join("; ") || "empty reply";
          // the reasons only (never the draft text) go to the log
          this.logger.warn(`conversation ${s.conversation.id}: draft rejected (attempt ${attempt + 1}): ${feedback}`);
        }
      } catch (e: any) {
        this.logger.error(`Claude call failed: ${e.message}`);
        feedback = "technical error";
      }
    }
    if (!result) {
      this.logger.warn(`conversation ${s.conversation.id}: draft replaced by the fixed holding message: ${feedback ?? "n/a"}`);
      await this.createTask(
        TaskType.HoldingMessage,
        TaskPriority.High,
        s,
        `Draft rejected: ${feedback ?? "n/a"}`,
      );
      await this.sendAndSave(s.customer.id, HOLDING_MESSAGE, m.waMessageId);
      return;
    }

    // 4. Apply extracted fields + system-built additions (prices, links, centres come from the DB)
    if (healthBlocked) {
      // health answers are not stored, and a plan pick (it needs the yearly medical spend) is not made
      result = {
        ...result,
        extracted_fields: withoutHealthFields(result.extracted_fields || {}),
        intent: result.intent === "recommend" ? "other" : result.intent,
      };
    }
    const extras = await this.applyResult(result, s, m);
    const finalText = [result.reply_text, ...extras].join("\n\n");

    if (result.needs_human) {
      await this.createTask(
        TaskType.HumanHandoff,
        TaskPriority.Normal,
        s,
        result.reply_text.slice(0, 500),
      );
      await this.setState(s, [ConversationState.Escalated]);
    }
    await this.sendAndSave(s.customer.id, finalText, m.waMessageId);
  }

  private describe(c: customer, cons: consent | null, healthQuestionsAllowed: boolean): string {
    return JSON.stringify({
      first_name: c.first_name,
      language: c.language,
      age: c.age,
      active_product: c.active_product,
      whatsapp_consent: cons?.whatsapp_consent,
      health_questions_allowed: healthQuestionsAllowed,
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
    // health_data_consent is NOT read from Claude: only the consent gate (the customer's own YES/NO) sets it
    if (f.whatsapp_consent != null) {
      const cons = await consent.findOne({ where: { customer_id: c.id } });
      if (f.whatsapp_consent != null) cons.whatsapp_consent = !!f.whatsapp_consent;
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
        await this.setState(s, [
          ConversationState.Routing,
          product === ProductType.CutMediBills ? ConversationState.CutMediBillsFit : ConversationState.PlanFit,
        ]);
        const gst = 0.18;
        extras.push(
          `Suggested plan: ${pick.plan.toUpperCase()} - \u20b9${pick.price} per year + GST ` +
            `(\u20b9${Math.round(pick.price * (1 + gst))} incl. 18% GST).`,
        );
        // never a saving promise: the neutral line goes with every plan suggestion
        extras.push(NEUTRAL_SAVINGS_LINE[c.language === "hi" || c.language === "hinglish" ? c.language : "en"]);
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
          await this.setState(s, [ConversationState.BookingCapture, ConversationState.BookingRecorded]);
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
        const actRow = await this._DataSource.transaction(async (mg) => {
          const a = await mg.save(
            mg.create(activation, {
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
          return await this._Outbox.enqueue(mg, CrmAction.CreateActivation, c.id, {
            activation_id: (a as any).id,
            product: cat.product,
            plan: cat.plan,
            billing: cat.billing,
          });
        });
        await this._Outbox.dispatch(actRow);
        await this.setState(s, [ConversationState.Activation]);
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

    await conversation.update(conv.id, {
      selected_product: conv.selected_product,
      recommended_plan: conv.recommended_plan,
    });
    return extras;
  }
}
