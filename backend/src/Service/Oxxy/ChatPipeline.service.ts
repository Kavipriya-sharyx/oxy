import { Injectable, Logger, Optional } from "@nestjs/common";
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
import { fixedReply, NOTICE_VERSION } from "@Helper/FixedReplies";
import {
  ASK_AGE,
  ASK_CITY,
  disclosureText,
  honestText,
  INSURANCE_ANSWER,
  INSURANCE_COORDINATION,
  PLAN_REASON,
  LINK_DECLINED,
  linkText,
  NO_CENTRE,
  PAYMENT_DONE,
  PAYMENT_FAILED,
  PAYMENT_NOT_NOW,
  recommendText,
  SOFT_ACTIVATION_DECLINED,
  softActivationText,
  timingCaution,
  unknownCentreText,
} from "@Helper/PlanReplies";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { eligibility } from "@Database/Table/Oxxy/eligibility";
import { cmbWorthIt } from "./ValueCheck.service";
import {
  asksForCmb,
  cmbNotWorthText,
  cmbOfferText,
  columnFor,
  GATE_QUESTION,
  GATE_STEPS,
  GateStep,
  gateComplete,
  gateFailed,
  notEligibleText,
  parseAmount,
} from "./CmbGate";
import { FollowUpSchedulerService } from "./FollowUpScheduler.service";
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
import { canTransition, InvalidTransitionError } from "./ConversationStateMachine";
import { TriggerEngineService } from "./TriggerEngine.service";
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

// Trigger Q: one reminder this long after the link, if it is still unpaid [CONFIRM] the delay
export const TRIGGER_Q_DELAY_MS = Number(process.env.TRIGGER_Q_DELAY_HOURS || 4) * 60 * 60 * 1000;

// A reply after the activation link (plan 12.5). Short messages only: a longer one is a question for Claude.
export function paymentReplyKind(text: string): "done" | "failed" | "not_now" | null {
  const t = (text || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 8) return null;
  if (
    /\b(payment|transaction|txn|paisa|paise|payment ho)\b.*\b(failed|fail|declined|not (gone|going|working)|nahi hua|nahi gaya|atak)\b/.test(t) ||
    /\b(failed|declined)\b.*\b(payment|transaction)\b/.test(t) ||
    /पेमेंट (फेल|नहीं हुआ)/.test(t)
  )
    return "failed";
  if (
    /^(done|paid|payment done|paid done|completed|payment completed|i have paid|i paid|ho gaya|ho gya|kar diya|payment ho gaya|payment kar diya|हो गया|पेमेंट हो गया|कर दिया)( (it|now|already|ji|sir|madam))?$/.test(
      t,
    )
  )
    return "done";
  if (/^(not now|later|maybe later|baad mein|baad me|abhi nahi|abhi nahin|बाद में|अभी नहीं)( please| ji)?$/.test(t))
    return "not_now";
  return null;
}

// true when the plan's activation time ("5 to 10 working days") ends after the requested date
export function activationAfter(preferredDate: string, activationTime: string, now = new Date()): boolean {
  const nums = (activationTime.match(/\d+/g) || []).map(Number);
  if (!nums.length) return false;
  const n = Math.max(...nums);
  const days = /working|business/i.test(activationTime) ? Math.ceil((n * 7) / 5) : n;
  const date = new Date(`${preferredDate}T00:00:00+05:30`);
  if (isNaN(date.getTime())) return false;
  return date.getTime() < now.getTime() + days * 24 * 60 * 60 * 1000;
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
    @Optional() private readonly _Triggers?: TriggerEngineService,
    @Optional() private readonly _Scheduler?: FollowUpSchedulerService,
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
    const conv =
      (await this._ConvRepo.findOpenByCustomer(cust.id)) ?? (await this._ConvRepo.openNew(cust.id));
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

  // true when a later inbound message in this conversation already has a reply
  async isStale(s: Saved): Promise<boolean> {
    const m = s.message;
    if (!m?.id) return false;
    // compared inside SQL: created_on has no time zone, so a JS Date parameter would shift by 5:30
    const newer = await message
      .createQueryBuilder("o")
      .where("o.conversation_id = :cid", { cid: m.conversation_id })
      .andWhere("o.direction = 'in'")
      .andWhere("o.id <> :id", { id: m.id })
      .andWhere(`o.created_on > (SELECT x.created_on FROM "message" x WHERE x.id = :id)`, { id: m.id })
      .andWhere(
        `EXISTS (SELECT 1 FROM "message" r WHERE r.direction = 'out' AND r.reply_to_wa_message_id = o.wa_message_id)`,
      )
      .getCount();
    return newer > 0;
  }

  private async alreadyReplied(inboundWamid: string): Promise<boolean> {
    if (!inboundWamid) return false;
    return !!(await message.findOne({
      where: { direction: "out", reply_to_wa_message_id: inboundWamid },
    }));
  }

  // WhatsappClient.send() checks the rules, sends and saves the outbound row (tagged with the inbound wamid).
  // If a reply to this inbound message already exists, nothing is sent.
  private async sendAndSave(
    customerId: string,
    content: string | OutboundMessage,
    replyTo: string,
  ) {
    if (await this.alreadyReplied(replyTo)) return;
    const msg: OutboundMessage =
      typeof content === "string" ? { kind: "text", body: content } : content;
    try {
      await this._Wa.send(customerId, msg, "reply", replyTo);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // someone else already saved a reply: fine
    }
  }

  // Change state only through ConversationRepository. A change the state machine does not allow
  // is logged (ids and state names only) and skipped, never forced.
  // `path` is the route to the target, e.g. [ROUTING, PLAN_FIT, ACTIVATION]. Steps the conversation is
  // already past are skipped, so the same path works from DISCOVERY, PLAN_FIT or BOOKING_RECORDED.
  private async setState(s: Saved, path: ConversationState[]): Promise<void> {
    if (s.conversation.state === path[path.length - 1]) return;
    for (let i = 0; i < path.length; i++) {
      const to = path[i];
      const isLast = i === path.length - 1;
      if (!isLast && !canTransition(s.conversation.state, to)) continue;
      try {
        const updated = await this._ConvRepo.transition(s.conversation.id, to);
        s.conversation.state = updated.state;
      } catch (e) {
        if (e instanceof InvalidTransitionError) {
          this.logger.warn(
            `conversation ${s.conversation.id}: state change ${e.from} -> ${e.to} not allowed, skipped`,
          );
          return;
        }
        throw e;
      }
    }
  }

  private async createTask(
    type: TaskType,
    priority: TaskPriority,
    s: Saved,
    summary: string,
    opts: { sendToCrm?: boolean } = {},
  ) {
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
      if (opts.sendToCrm === false) return null;
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
        const updated = await this._ConvRepo.transition(
          s.conversation.id,
          ConversationState.OptedOut,
          {
            reason: "stop",
            manager: mg,
          },
        );
        s.conversation.state = updated.state;
      } catch (e) {
        // STOP must always work: the opt-out is saved even if the state change is refused
        if (!(e instanceof InvalidTransitionError)) throw e;
        this.logger.warn(
          `conversation ${s.conversation.id}: state change ${e.from} -> ${e.to} not allowed, skipped`,
        );
      }
      return await this._Outbox.enqueue(mg, CrmAction.SetOptOut, s.customer.id, {
        customer_id: s.customer.id,
        opt_out_at: at.toISOString(),
      });
    });
    await this._Outbox.dispatch(row);
    // every scheduled follow-up stops at once (plan 12.7)
    await this._Scheduler?.cancelAll(s.customer.id, "opt_out");
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

    if (hit.kind === "privacy") {
      await this.saveConsentRow(s.customer.id, cons, (c) => {
        c.privacy_request_at = new Date();
        c.marketing_consent = false;
      });
      await this._Scheduler?.cancelAll(s.customer.id, "privacy_request");
      await this.createTaskOnce(
        TaskType.PrivacyRequest,
        TaskPriority.High,
        s,
        `${ref} privacy / deletion request`,
      );
      await this.setState(s, [ConversationState.Pause]);
      await this.sendAndSave(s.customer.id, fixedReply("privacy", lang), m.waMessageId);
      return;
    }

    if (hit.kind === "complaint") {
      await this.createTaskOnce(
        TaskType.Escalation,
        TaskPriority.Urgent,
        s,
        `${ref} complaint or payment dispute`,
      );
      await this.setState(s, [ConversationState.Escalated]);
      await this.sendAndSave(s.customer.id, fixedReply("complaint", lang), m.waMessageId);
      return;
    }

    // talk to a person
    await this.createTaskOnce(
      TaskType.Escalation,
      TaskPriority.Normal,
      s,
      `${ref} customer asked for a person`,
    );
    await this.setState(s, [ConversationState.Escalated]);
    await this.sendAndSave(s.customer.id, fixedReply("escalation", lang), m.waMessageId);
  }

  // DPDP consent step. Ends the turn. No Claude call, no health question, no other text than the fixed replies.
  //  none     -> send the notice (nothing else in this turn), then remember it was sent
  //  awaiting -> read this message as the answer: YES / NO saved first, then the reply; unclear -> ask again
  private async handleConsentStep(
    status: "none" | "awaiting",
    m: Inbound,
    s: Saved,
    cons: consent | null,
  ) {
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
        await this.sendAndSave(
          customerId,
          `${ack} ${WELCOME[lang === "hi" || lang === "hinglish" ? lang : "en"]}`,
          m.waMessageId,
        );
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
  private async saveConsentRow(
    customerId: string,
    cons: consent | null,
    change: (c: consent) => void,
  ) {
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
    // the customer's response to the last trigger (Trigger layer 13: trigger-to-response KPIs)
    await this.markTriggerResponse(
      s.conversation.id,
      hit?.kind === "stop" || hit?.also_stop
        ? "opted_out"
        : hit && hit.kind !== "emergency" && hit.kind !== "self_harm"
          ? "escalated"
          : "replied",
    );
    if (hit) {
      await this.handleGuardrail(hit, m, s, cons);
      return;
    }

    if (cons?.opt_out_at) return; // opted out: no messages at all

    // 1a. Strict order (plan 12.10). A retried or recovered job can reach us after a NEWER message from
    // the same customer was already answered. Running it now would read an old "yes" or "hi" as the
    // answer to today's question, so it is skipped (safety and STOP were already handled above).
    if (await this.isStale(s)) {
      await message.update(s.message!.id, { message_status: "stale" });
      this.logger.warn(
        `conversation ${s.conversation.id}: message ${s.message!.id} skipped, a newer message was already answered`,
      );
      return;
    }

    if (
      s.conversation.state === ConversationState.Pause ||
      s.conversation.state === ConversationState.Escalated
    ) {
      return; // bot stays quiet while paused or handed off to a human
    }

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

    // 1d. Answers the system is waiting for, and questions with an approved fixed answer (no Claude)
    if (await this.handleCmbGate(m, s)) return;
    if (await this.handleActivationAnswer(m, s)) return;
    if (await this.handleSoftActivationAnswer(m, s)) return;
    if (await this.handlePaymentReply(m, s)) return;
    if (await this.handleInsurance(m, s)) return;

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
    if (history[history.length - 1].role !== "user")
      history.push({ role: "user", content: m.text });

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
          this.logger.warn(
            `conversation ${s.conversation.id}: draft rejected (attempt ${attempt + 1}): ${feedback}`,
          );
        }
      } catch (e: any) {
        this.logger.error(`Claude call failed: ${e.message}`);
        feedback = "technical error";
      }
    }
    if (!result) {
      this.logger.warn(
        `conversation ${s.conversation.id}: draft replaced by the fixed holding message: ${feedback ?? "n/a"}`,
      );
      await this.createTask(
        TaskType.HoldingMessage,
        TaskPriority.High,
        s,
        `Draft rejected: ${feedback ?? "n/a"}`,
      );
      await this.setState(s, [ConversationState.Pause]);
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
    // while the Cut Medi Bills gate is open no trigger fires; Trigger I is recorded when it passes
    if (this._Triggers && !s.conversation.pending_action?.startsWith("cmb_gate:")) {
      const trig = this._Triggers.inferCandidate(
        result.intent,
        s.conversation.selected_product,
        result.needs_human,
      );
      await this._Triggers.recordIfAllowed(
        s.customer.id,
        s.conversation,
        trig,
        result.intent,
        s.customer.active_product,
      );
    }
    // a question interrupted the Cut Medi Bills gate: answer it, then ask the same question again (12.2)
    const openGate = s.conversation.pending_action?.startsWith("cmb_gate:")
      ? (s.conversation.pending_action.split(":")[1] as GateStep)
      : null;
    const back = openGate && !extras.length && GATE_QUESTION[openGate] ? [GATE_QUESTION[openGate]] : [];
    const finalText = [result.reply_text, ...extras, ...back].join("\n\n");

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

    // rule: one active product per customer. Cut Medi Bills is set only after its eligibility gate
    // passes (plan 12.3 / 8.2), never straight from Claude.
    let wantsCmb = false;
    if (f.selected_product && Object.values(ProductType).includes(f.selected_product)) {
      if (c.active_product && c.active_product !== f.selected_product) {
        extras.push(
          "You already have an active product with us, so I can help only with that one.",
        );
      } else if (f.selected_product === ProductType.CutMediBills) {
        wantsCmb = conv.selected_product !== ProductType.CutMediBills;
      } else {
        conv.selected_product = f.selected_product;
      }
    }
    if (asksForCmb(m.text) && !c.active_product && conv.selected_product !== ProductType.CutMediBills)
      wantsCmb = true;
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
      "urgency",
      "postcode",
      "condition_if_voluntary",
    ];
    const needData: any = {};
    for (const k of needKeys) if (f[k] != null && f[k] !== "") needData[k] = f[k];
    if (["ongoing", "single_expense"].includes(f.need_pattern)) needData.need_pattern = f.need_pattern;
    if (typeof f.pre_existing === "boolean") needData.pre_existing = f.pre_existing;
    let n = await need.findOne({ where: { conversation_id: conv.id } });
    if (Object.keys(needData).length) {
      if (!n) n = need.create({ conversation_id: conv.id } as any);
      Object.assign(n, needData);
      await n.save();
    }

    // Routing (plan 12.3): an explicit ask, or one known upcoming expense whose 30% saving beats the
    // monthly price + GST, goes to Cut Medi Bills, but only through the eligibility gate.
    let routedToCmb = false;
    const gateOpen = !!conv.pending_action?.startsWith("cmb_gate:");
    if (!gateOpen && !c.active_product && conv.selected_product !== ProductType.CutMediBills) {
      const single =
        r.intent === "recommend" &&
        n?.need_pattern === "single_expense" &&
        !!n?.expected_bill &&
        !n?.annual_medical_spend &&
        (await this.cmbValue(Number(n.expected_bill)))?.ok === true;
      if (wantsCmb || single) {
        const gate = await this.latestGate(conv.id);
        const named = f.centre_name ? String(f.centre_name).trim() : null;
        const otherCentre =
          !!named && named.toLowerCase() !== (gate?.centre_name || "").trim().toLowerCase();
        if (!gate || (!gateFailed(gate) && !gateComplete(gate)) || (gateFailed(gate) && otherCentre)) {
          extras.push(await this.startCmbGate(s, n, named));
          routedToCmb = true;
        } else if (gateFailed(gate) && wantsCmb) {
          extras.push(
            "As we checked earlier, Cut Medi Bills cannot be used for that expense because something was already booked, registered, started or billed at that centre. If it is for a different centre, tell me its name.",
          );
          routedToCmb = true;
        }
      }
    }

    // intent actions
    // Oxxy plan choice (12.3): age first, then by need, then the value check; an honest answer when no
    // plan pays for itself. Prices and the saving figure come from plan_catalog, never from Claude.
    if (
      !routedToCmb &&
      r.intent === "recommend" &&
      n?.annual_medical_spend &&
      (conv.selected_product || ProductType.Oxxy) === ProductType.Oxxy
    ) {
      const spend = Number(n.annual_medical_spend);
      const pick = await this._ValueCheck.recommend(
        spend,
        c.age ?? null,
        n.healthcare_need,
        ProductType.Oxxy,
      );
      if (pick?.status === "ask_age") {
        extras.push(ASK_AGE);
      } else if (pick) {
        const prices = await this._ValueCheck.prices(ProductType.Oxxy, pick.plan);
        conv.selected_product = ProductType.Oxxy;
        conv.recommended_plan = pick.plan;
        // Routing group (Playbook 17)
        conv.recommendation_reason = PLAN_REASON[pick.plan] ?? null;
        conv.value_check_passed = pick.status === "recommend";
        conv.alternate_product_suppressed = true;
        await this.setState(s, [ConversationState.Routing, ConversationState.PlanFit]);
        extras.push(
          pick.status === "recommend"
            ? recommendText(
                pick.plan,
                prices.yearly ?? pick.price,
                prices.monthly,
                spend,
                pick.saving,
              )
            : honestText(pick.plan, prices.yearly ?? pick.price, prices.monthly, spend),
        );
      }
    }

    if (r.intent === "find_centre" && !m.location && !n?.city) {
      extras.push(ASK_CITY); // never list centres from another city
    } else if (r.intent === "find_centre") {
      const list = await this._CentreSearch.search({
        latitude: m.location?.latitude,
        longitude: m.location?.longitude,
        radiusKm: n?.travel_radius_km ?? 10,
        specialisation: n?.specialisation,
        city: n?.city,
      });
      if (n) {
        // Provider group: exactly the directory ids shown, in order (never names the model wrote)
        n.suggested_centre_ids = list.map((x) => x.id);
        await n.save();
      }
      if (list.length) {
        extras.push(
          "Centres near you:\n" +
            list
              .map(
                (x, i) =>
                  `${i + 1}. ${x.name}${x.branch ? ", " + x.branch : ""} (${x.locality || x.city})`,
              )
              .join("\n") +
            "\n\nReply with 1-5, or send the name of another centre you prefer.",
        );
      } else {
        extras.push(NO_CENTRE);
      }
    }

    if (r.intent === "book") {
      if (!f.preferred_date) {
        extras.push(
          "Please share your preferred date (YYYY-MM-DD) and optional time so I can submit your booking request.",
        );
      } else {
        const chk = this._DateWindow.validate(String(f.preferred_date));
        if (!chk.valid) {
          extras.push(`Please choose a date between ${chk.min} and ${chk.max}.`);
        } else if (f.centre_name) {
          const ctr = await this.findVerifiedCentre(String(f.centre_name));
          if (ctr) {
            await this._Booking.create({
              customer_id: c.id,
              conversation_id: conv.id,
              centre_id: ctr.id,
              specialisation: n?.specialisation,
              preferred_date: String(f.preferred_date),
              preferred_time: f.preferred_time ? String(f.preferred_time) : undefined,
            });
            // the CRM creates the sales team's "confirm booking" task from create_booking_request,
            // so this local row is the console's mirror only (no second create_task call)
            await this.createTask(
              TaskType.BookingConfirm,
              TaskPriority.Normal,
              s,
              `Booking request at ${ctr.name} on ${f.preferred_date}`,
              { sendToCrm: false },
            );
            await this.setState(s, [
              ConversationState.BookingCapture,
              ConversationState.BookingRecorded,
            ]);
            extras.push(
              "Your booking request has been received. It is pending confirmation: our team will confirm it with you shortly.",
            );
            await this.recordTrigger(s, "H", "booking request saved");
            conv.outcome = "booking_requested";
            if (n) {
              n.preferred_centre_id = ctr.id;
              await n.save();
            }
            const soft = await this.softActivationOffer(s, String(f.preferred_date));
            if (soft) extras.push(soft);
          } else {
            // never reject a centre just because we did not suggest it: the team checks it (plan 12.4)
            const name = String(f.centre_name).trim().slice(0, 80);
            await this.createTaskOnce(
              TaskType.DirectoryVerification,
              TaskPriority.Normal,
              s,
              `Check centre named by the customer: ${name}`,
            );
            extras.push(unknownCentreText(name));
          }
        }
      }
    }

    // Activation (12.5): price, GST and renewal first, then ask; the link goes only after a YES
    // (handleActivationAnswer). One product per customer.
    if (r.intent === "activate" && !c.active_product && !routedToCmb && !gateOpen) {
      const billing = f.billing || (/\bmonthly\b|\bmahina|\bmonth\b/i.test(m.text) ? "monthly" : undefined);
      const cat = await this.activationRow(conv, billing);
      if (cat?.activation_link) {
        conv.pending_action = `send_activation_link:${cat.id}`;
        await this.setState(s, this.activationPath(cat.product));
        extras.push(
          disclosureText(
            this.productLabel(cat),
            Number(cat.price),
            cat.billing,
            cat.renewal_terms,
            cat.activation_time,
          ),
        );
      } else if (conv.selected_product || conv.recommended_plan) {
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
      pending_action: conv.pending_action ?? null,
      // Routing + Engagement groups (Playbook 17)
      recommendation_reason: conv.recommendation_reason ?? null,
      value_check_passed: conv.value_check_passed ?? null,
      alternate_product_suppressed: !!conv.alternate_product_suppressed || !!conv.selected_product,
      last_intent: r.intent,
      outcome: conv.outcome ?? null,
    });
    return extras;
  }

  // ---- Cut Medi Bills gate (plan 8.2, 12.3). pending_action = "cmb_gate:<step>:<eligibility id>" ----

  private async latestGate(conversationId: string): Promise<eligibility | null> {
    return await eligibility.findOne({
      where: { conversation_id: conversationId },
      order: { created_on: "DESC" } as any,
    });
  }

  private async cmbPrices(): Promise<{ monthly: plan_catalog | null; yearly: plan_catalog | null }> {
    const rows = await plan_catalog.find({
      where: { product: ProductType.CutMediBills, status: true },
    });
    return {
      monthly: rows.find((r) => r.billing === BillingCycle.Monthly) ?? null,
      yearly: rows.find((r) => r.billing === BillingCycle.Yearly) ?? null,
    };
  }

  // value check on the one bill against the monthly price + GST; null when the catalogue has no price
  private async cmbValue(bill: number): Promise<{ ok: boolean; saving: number } | null> {
    const { monthly } = await this.cmbPrices();
    if (!monthly || !bill) return null;
    return cmbWorthIt(
      bill,
      Number(monthly.price),
      Number((monthly as any).illustration_pct ?? monthly.max_saving_pct ?? 30),
      Number(monthly.gst_rate) || 0.18,
    );
  }

  // Opens the gate and returns the first question. The answers are kept per centre in `eligibility`.
  private async startCmbGate(s: Saved, n: need | null, centreName: string | null): Promise<string> {
    const name = (centreName || "").trim().slice(0, 80) || null;
    const ctr = name ? await this.findVerifiedCentre(name) : null;
    const row = await eligibility.save(
      eligibility.create({
        customer_id: s.customer.id,
        conversation_id: s.conversation.id,
        centre_id: ctr?.id ?? null,
        centre_name: name,
        booking_state: "unknown",
        registration_state: "unknown",
        treatment_state: "unknown",
        bill_state: "unknown",
      } as any),
    );
    const step: GateStep = name ? "booking" : "centre";
    s.conversation.pending_action = `cmb_gate:${step}:${(row as any).id}`;
    await this.setState(s, [ConversationState.Routing, ConversationState.CutMediBillsFit]);
    return (
      "Cut Medi Bills can be used only before anything is booked, registered, started or billed at the centre, " +
      "so I will check that first.\n\n" +
      GATE_QUESTION[step]
    );
  }

  private async setPending(s: Saved, value: string | null) {
    await conversation.update(s.conversation.id, { pending_action: value });
    s.conversation.pending_action = value;
  }

  // One gate answer per turn. Returns true when this message was handled.
  private async handleCmbGate(m: Inbound, s: Saved): Promise<boolean> {
    const pending = s.conversation.pending_action;
    if (!pending?.startsWith("cmb_gate:")) return false;
    const [, step, id] = pending.split(":") as [string, GateStep, string];
    const row = await eligibility.findOne({ where: { id } });
    if (!row) {
      await this.setPending(s, null);
      return false;
    }
    const reply = (text: string) => this.sendAndSave(s.customer.id, text, m.waMessageId);
    const isQuestion = /\?\s*$/.test(m.text.trim());

    if (step === "centre") {
      if (isQuestion || !m.text.trim()) return false; // answered normally, then the same question again
      const name = m.text.trim().slice(0, 80);
      const ctr = await this.findVerifiedCentre(name);
      row.centre_name = name;
      row.centre_id = ctr?.id ?? null;
      await row.save();
      await this.setPending(s, `cmb_gate:booking:${id}`);
      await reply(GATE_QUESTION.booking);
      return true;
    }

    if (step === "bill_amount") {
      const amount = parseAmount(m.text);
      if (!amount) {
        if (isQuestion) return false;
        await reply(`${GATE_QUESTION.bill_amount} A rough amount is fine, for example 80,000.`);
        return true;
      }
      let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
      n.expected_bill = amount;
      n.need_pattern = "single_expense";
      await n.save();
      await this.setPending(s, null);
      await reply(await this.cmbOutcome(s, amount));
      return true;
    }

    const gateStep = step as (typeof GATE_STEPS)[number];
    if (!GATE_STEPS.includes(gateStep)) {
      await this.setPending(s, null);
      return false;
    }
    const answer = parseConsentAnswer(m.text);
    if (answer === "unclear") {
      if (isQuestion) return false;
      await reply(GATE_QUESTION[gateStep]);
      return true;
    }
    (row as any)[columnFor(gateStep)] =
      answer === "yes" ? (gateStep === "bill" ? "generated" : "done") : "none";
    await row.save();

    if (answer === "yes") {
      // not eligible at this centre: never offer Cut Medi Bills for it; Oxxy stays possible
      await this.setPending(s, null);
      await reply(notEligibleText(gateStep));
      return true;
    }
    const next = GATE_STEPS[GATE_STEPS.indexOf(gateStep) + 1];
    if (next) {
      await this.setPending(s, `cmb_gate:${next}:${id}`);
      await reply(GATE_QUESTION[next]);
      return true;
    }
    // all four answered NO: eligible. The value check needs the expected bill.
    const n = await need.findOne({ where: { conversation_id: s.conversation.id } });
    if (!n?.expected_bill) {
      await this.setPending(s, `cmb_gate:bill_amount:${id}`);
      await reply(GATE_QUESTION.bill_amount);
      return true;
    }
    await this.setPending(s, null);
    await reply(await this.cmbOutcome(s, Number(n.expected_bill)));
    return true;
  }

  // Eligible: run the value check, then offer Cut Medi Bills (Trigger I) or give the honest answer.
  private async cmbOutcome(s: Saved, bill: number): Promise<string> {
    const { monthly, yearly } = await this.cmbPrices();
    const value = await this.cmbValue(bill);
    if (!value) {
      await this.createTask(TaskType.Activation, TaskPriority.Normal, s, "Cut Medi Bills price missing in plan_catalog");
      return HOLDING_MESSAGE;
    }
    if (!value.ok) {
      await conversation.update(s.conversation.id, { value_check_passed: false });
      return cmbNotWorthText(bill, monthly ? Number(monthly.price) : null);
    }
    await conversation.update(s.conversation.id, {
      selected_product: ProductType.CutMediBills,
      recommended_plan: null,
      // Routing group (Playbook 17)
      recommendation_reason: "one known upcoming expense, nothing done yet at the centre",
      value_check_passed: true,
      alternate_product_suppressed: true,
    });
    s.conversation.selected_product = ProductType.CutMediBills;
    s.conversation.recommended_plan = null;
    await this.recordTrigger(s, "I", "one upcoming expense, eligible");
    return cmbOfferText(
      bill,
      value.saving,
      monthly ? Number(monthly.price) : null,
      yearly ? Number(yearly.price) : null,
      monthly?.activation_time ?? yearly?.activation_time ?? null,
    );
  }

  private productLabel(cat: plan_catalog): string {
    if (cat.product === ProductType.CutMediBills)
      return `Cut Medi Bills (${cat.billing === "monthly" ? "monthly" : "annual"})`;
    return `Oxxy ${cat.plan.charAt(0).toUpperCase()}${cat.plan.slice(1)} plan`;
  }

  // The catalog row for the selected product: the recommended Oxxy plan (yearly unless the customer asked
  // for monthly), or Cut Medi Bills monthly / yearly.
  private async activationRow(
    conv: conversation,
    billingWanted?: string,
  ): Promise<plan_catalog | null> {
    const product = conv.selected_product || (conv.recommended_plan ? ProductType.Oxxy : null);
    if (!product) return null;
    const billing =
      billingWanted === BillingCycle.Monthly ? BillingCycle.Monthly : BillingCycle.Yearly;
    if (product === ProductType.Oxxy) {
      if (!conv.recommended_plan) return null;
      return await plan_catalog.findOne({
        where: { product, plan: conv.recommended_plan, billing, status: true },
      });
    }
    return await plan_catalog.findOne({ where: { product, billing, status: true } });
  }

  // The customer's answer to "Shall I send the official secure activation link?"
  // Returns true when this message was that answer (the turn is then finished).
  private async handleActivationAnswer(m: Inbound, s: Saved): Promise<boolean> {
    const pending = s.conversation.pending_action;
    if (!pending?.startsWith("send_activation_link:")) return false;
    const answer = parseConsentAnswer(m.text);
    if (answer === "unclear") {
      await conversation.update(s.conversation.id, { pending_action: null }); // a question etc.: Claude answers it
      s.conversation.pending_action = null;
      return false;
    }
    await conversation.update(s.conversation.id, { pending_action: null });
    s.conversation.pending_action = null;
    if (answer === "no") {
      await this.markTriggerResponse(s.conversation.id, "declined", { triggerId: "E", force: true });
      await conversation.update(s.conversation.id, { outcome: "activation_declined" });
      await this.sendAndSave(s.customer.id, LINK_DECLINED, m.waMessageId);
      return true;
    }
    await this.markTriggerResponse(s.conversation.id, "clicked", { triggerId: "E", force: true });
    const cat = await plan_catalog.findOne({ where: { id: pending.split(":")[1], status: true } });
    if (!cat?.activation_link || s.customer.active_product) {
      await this.createTask(
        TaskType.Activation,
        TaskPriority.Normal,
        s,
        "Activation link could not be sent",
      );
      await this.sendAndSave(s.customer.id, HOLDING_MESSAGE, m.waMessageId);
      return true;
    }
    const actRow = await this._DataSource.transaction(async (mg) => {
      // switching before payment: the earlier unpaid link is cancelled, only the new product stays
      await mg.update(
        activation,
        {
          customer_id: s.customer.id,
          activation_status: In([ActivationStatus.Pending, ActivationStatus.LinkSent]),
        },
        { activation_status: ActivationStatus.Failed, payment_status: "cancelled" },
      );
      const a = await mg.save(
        mg.create(activation, {
          customer_id: s.customer.id,
          catalog_id: cat.id,
          product: cat.product,
          plan: cat.plan,
          billing: cat.billing,
          link_sent_at: new Date(),
          link_version: cat.version,
          // what the customer was shown (Playbook 17 Activation group): the disclosure always comes first
          price: cat.price,
          gst_rate: cat.gst_rate,
          renewal_terms_shown: true,
          payment_status: PaymentStatus.Pending,
          activation_status: ActivationStatus.LinkSent,
        } as any),
      );
      return await this._Outbox.enqueue(mg, CrmAction.CreateActivation, s.customer.id, {
        activation_id: (a as any).id,
        product: cat.product,
        plan: cat.plan,
        billing: cat.billing,
      });
    });
    await this._Outbox.dispatch(actRow);
    await this.setState(s, [ConversationState.AwaitingPayment]);
    await this.sendAndSave(s.customer.id, linkText(cat.activation_link), m.waMessageId);
    // Trigger Q: one reminder if the link is still unpaid (the scheduler re-checks everything at send time)
    await this._Scheduler?.create({
      customerId: s.customer.id,
      conversationId: s.conversation.id,
      kind: "trigger_q",
      scheduledFor: new Date(Date.now() + TRIGGER_Q_DELAY_MS),
      templateName: "activation_reminder",
      reason: "link sent, payment not completed",
      selectedProduct: cat.product,
      source: "whatsapp_inbound",
    });
    return true;
  }

  private activationPath(product: string): ConversationState[] {
    return [
      ConversationState.Routing,
      product === ProductType.CutMediBills
        ? ConversationState.CutMediBillsFit
        : ConversationState.PlanFit,
      ConversationState.Activation,
    ];
  }

  // After a booking request (plan 12.4): the timing caution and ONE soft activation suggestion per
  // journey, never when a product is already active. Returns the text to add, or null.
  private async softActivationOffer(s: Saved, preferredDate: string): Promise<string | null> {
    if (s.customer.active_product) return null;
    const offered = await trigger_event.findOne({
      where: { conversation_id: s.conversation.id, trigger_id: "E", reason: "soft_activation" },
    });
    if (offered) return null;
    const product = s.conversation.selected_product || ProductType.Oxxy;
    const cat = await plan_catalog.findOne({
      where:
        product === ProductType.Oxxy && s.conversation.recommended_plan
          ? { product, plan: s.conversation.recommended_plan, status: true }
          : { product, status: true },
    });
    const caution =
      cat?.activation_time && activationAfter(preferredDate, cat.activation_time)
        ? timingCaution(cat.activation_time)
        : null;
    await trigger_event.save(
      trigger_event.create({
        customer_id: s.customer.id,
        conversation_id: s.conversation.id,
        trigger_id: "E",
        reason: "soft_activation",
      } as any),
    );
    s.conversation.pending_action = "soft_activation";
    const label =
      product === ProductType.CutMediBills
        ? "Cut Medi Bills"
        : s.conversation.recommended_plan
          ? `the Oxxy ${s.conversation.recommended_plan.charAt(0).toUpperCase()}${s.conversation.recommended_plan.slice(1)} plan`
          : "an Oxxy plan";
    return softActivationText(label, caution);
  }

  // The answer to the soft activation suggestion. YES = disclosure (12.5), NO = booking stays recorded.
  private async handleSoftActivationAnswer(m: Inbound, s: Saved): Promise<boolean> {
    if (s.conversation.pending_action !== "soft_activation") return false;
    const answer = parseConsentAnswer(m.text);
    await conversation.update(s.conversation.id, { pending_action: null });
    s.conversation.pending_action = null;
    if (answer === "unclear") return false; // a question: answered normally
    if (answer === "no") {
      await this.sendAndSave(s.customer.id, SOFT_ACTIVATION_DECLINED, m.waMessageId);
      return true;
    }
    const cat = await this.activationRow(s.conversation);
    if (!cat?.activation_link) {
      // no plan picked yet: the value check needs the yearly spend first
      await this.sendAndSave(
        s.customer.id,
        "Happy to help. To suggest the right plan, roughly how much does your family spend on healthcare in a year?",
        m.waMessageId,
      );
      return true;
    }
    await conversation.update(s.conversation.id, {
      pending_action: `send_activation_link:${cat.id}`,
    });
    s.conversation.pending_action = `send_activation_link:${cat.id}`;
    await this.setState(s, this.activationPath(cat.product));
    await this.sendAndSave(
      s.customer.id,
      disclosureText(
        this.productLabel(cat),
        Number(cat.price),
        cat.billing,
        cat.renewal_terms,
        cat.activation_time,
      ),
      m.waMessageId,
    );
    return true;
  }

  // Replies after the activation link (plan 12.5, AWAITING_PAYMENT). Charged twice is a complaint and
  // is handled by the guardrail before this. A question returns false and is answered normally.
  private async handlePaymentReply(m: Inbound, s: Saved): Promise<boolean> {
    const kind = paymentReplyKind(m.text);
    if (!kind) return false;
    const open = await activation.findOne({
      where: {
        customer_id: s.customer.id,
        payment_status: PaymentStatus.Pending,
        activation_status: ActivationStatus.LinkSent,
      },
      order: { created_on: "DESC" } as any,
    });
    if (!open) return false;

    if (kind === "done") {
      await this.createTaskOnce(
        TaskType.VerifyActivation,
        TaskPriority.High,
        s,
        `Customer says payment is done (activation ${(open as any).id})`,
      );
      await this.recordTrigger(s, "P", "customer said done");
      await this.setState(s, [ConversationState.FollowUp]);
      await this.sendAndSave(s.customer.id, PAYMENT_DONE, m.waMessageId);
      return true;
    }
    if (kind === "failed") {
      await this.createTaskOnce(
        TaskType.PaymentIssue,
        TaskPriority.High,
        s,
        `Payment failed (activation ${(open as any).id})`,
      );
      await this.setState(s, [ConversationState.Escalated]);
      await this.sendAndSave(s.customer.id, PAYMENT_FAILED, m.waMessageId);
      return true;
    }
    await this.setState(s, [ConversationState.FollowUp]);
    await this.sendAndSave(s.customer.id, PAYMENT_NOT_NOW, m.waMessageId);
    return true;
  }

  // Sets customer_response on the latest trigger of this journey that has none yet (or, with force,
  // overrides it: e.g. YES to the activation link = clicked). Ignored = still empty after 24 hours.
  private async markTriggerResponse(
    conversationId: string,
    response: "replied" | "clicked" | "declined" | "opted_out" | "escalated",
    opts: { triggerId?: string; force?: boolean } = {},
  ) {
    try {
      const qb = trigger_event
        .createQueryBuilder("t")
        .addSelect("t.created_on") // not selected by default (BaseTable)
        .where("t.conversation_id = :c", { c: conversationId });
      if (opts.triggerId) qb.andWhere("t.trigger_id = :id", { id: opts.triggerId });
      const last = await qb.orderBy("t.created_on", "DESC").getOne();
      if (!last || (last.response && !opts.force)) return;
      if (Date.now() - new Date(last.created_on).getTime() > 24 * 60 * 60 * 1000 && !opts.force) return;
      await trigger_event.update(last.id, { response });
    } catch (e) {
      this.logger.debug(`trigger response not saved: ${(e as Error).message}`);
    }
  }

  private async recordTrigger(s: Saved, id: string, reason: string) {
    try {
      await trigger_event.save(
        trigger_event.create({
          customer_id: s.customer.id,
          conversation_id: s.conversation.id,
          trigger_id: id,
          reason,
          conversation_source: "whatsapp_inbound",
          next_state: s.conversation.state,
        } as any),
      );
    } catch (e) {
      this.logger.debug(`trigger ${id} not recorded: ${(e as Error).message}`);
    }
  }

  // Trigger B / J: insurance questions get the approved fixed answer (Claude never words this)
  private async handleInsurance(m: Inbound, s: Saved): Promise<boolean> {
    const t = (m.text || "").toLowerCase();
    if (!/insurance|\bbima\b|बीमा|इंश्योरेंस/.test(t)) return false;
    const has =
      /\b(i|we|my|mother|father|family)\b[^.?!]{0,30}\b(have|has|got|covered)\b[^.?!]{0,20}(insurance|bima)|my (health )?insurance|insurance (will|can) (pay|cover)/.test(
        t,
      );
    if (has) {
      let n = await need.findOne({ where: { conversation_id: s.conversation.id } });
      if (!n) n = need.create({ conversation_id: s.conversation.id } as any);
      n.insurance_status = "has_insurance";
      await n.save();
    }
    await this.sendAndSave(
      s.customer.id,
      has ? INSURANCE_COORDINATION : INSURANCE_ANSWER,
      m.waMessageId,
    );
    return true;
  }

  /** Match a centre by full text or stripped base name (e.g. "Sample Dental Clinic, Adyar (Adyar)"). */
  private async findVerifiedCentre(rawName: string): Promise<centre | null> {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const direct = await centre.findOne({
      where: { name: ILike(`%${trimmed}%`), verified: true, active: true },
    });
    if (direct) return direct;
    const baseName = trimmed
      .replace(/^\d+\.\s*/, "")
      .replace(/\(.*?\)/g, "")
      .split(",")[0]
      .trim();
    if (!baseName || baseName === trimmed) return null;
    return await centre.findOne({
      where: { name: ILike(`%${baseName}%`), verified: true, active: true },
    });
  }
}
