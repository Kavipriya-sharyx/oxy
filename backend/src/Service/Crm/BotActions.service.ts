// The Playbook 17.1 actions: lookup_customer, search_centres, create_booking_request, create_follow_up,
// get_official_plan, send_approved_asset, create_escalation, set_opt_out. Used by the CRM, the voice AI and
// the console through ActionsController. Every rule is checked here, never left to the caller.
import { isPlaceholder, isRealLink, planReady } from "@Helper/GoLive";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DataSource, ILike, In } from "typeorm";
import { customer } from "@Database/Table/Oxxy/customer";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { centre } from "@Database/Table/Oxxy/centre";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { activation } from "@Database/Table/Oxxy/activation";
import { task } from "@Database/Table/Oxxy/task";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { asset_send } from "@Database/Table/Oxxy/asset_send";
import { need } from "@Database/Table/Oxxy/need";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { PaymentStatus } from "@Helper/Enum/PaymentStatus";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { TaskType } from "@Helper/Enum/TaskType";
import { TaskPriority } from "@Helper/Enum/TaskPriority";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { ProductType } from "@Helper/Enum/ProductType";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { QuietHoursError, WindowClosedError } from "@Helper/WhatsappErrors";
import { CrmOutboxService } from "./CrmOutbox.service";
import { ConversationRepository } from "@Service/Oxxy/ConversationRepository.service";
import { CentreSearchService } from "@Service/Oxxy/CentreSearch.service";
import { BookingService } from "@Service/Oxxy/Booking.service";
import { DateWindowService } from "@Service/Oxxy/DateWindow.service";
import { FollowUpSchedulerService } from "@Service/Oxxy/FollowUpScheduler.service";
import { WhatsappClient } from "@Service/Oxxy/WhatsappClient.service";
import { isQuietHours, isWithin24h, nextAllowedAt } from "@Service/Oxxy/WhatsappRules";
import { cleanCallContext, describeCallContext, type CallContext } from "@Helper/CallContext";
import { LEAD_INTRO_TEXT, LEAD_ROWS } from "@Helper/OpeningMenu";
import { lang } from "@Helper/Lang";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { InvalidTransitionError } from "@Service/Oxxy/ConversationStateMachine";

export type Source = "voice_ai" | "whatsapp_inbound" | "whatsapp_outbound" | "human_agent" | "crm";
const SOURCES: Source[] = [
  "voice_ai",
  "whatsapp_inbound",
  "whatsapp_outbound",
  "human_agent",
  "crm",
];
export const sourceOf = (s: unknown): Source =>
  SOURCES.includes(s as Source) ? (s as Source) : "crm";

const ASSET_KINDS = [
  "document",
  "comparison",
  "media",
  "testimonial",
  "policy",
  "website",
  "article",
];

/** "+91 98400 12345", "09840012345", "9840012345" -> "919840012345" (how WhatsApp sends it) */
export function normaliseWa(n: unknown): string | null {
  const d = String(n ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** An ISO date-time; null when it cannot be read */
export function parseWhen(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 400 instead of a database error for an id that is not a UUID */
export function assertId(v: unknown, name: string): string {
  const s = String(v ?? "");
  if (!UUID.test(s))
    throw new BadRequestException({ message: `${name} must be a UUID`, code: "invalid_id" });
  return s;
}

export interface CustomerRef {
  customer_id?: string;
  wa_number?: string;
}

@Injectable()
export class BotActionsService {
  private readonly logger = new Logger(BotActionsService.name);

  constructor(
    private readonly _DataSource: DataSource,
    private readonly _Outbox: CrmOutboxService,
    private readonly _ConvRepo: ConversationRepository,
    private readonly _CentreSearch: CentreSearchService,
    private readonly _Booking: BookingService,
    private readonly _DateWindow: DateWindowService,
    private readonly _Scheduler: FollowUpSchedulerService,
    private readonly _Wa: WhatsappClient,
  ) {}

  // ---------------------------------------------------------------- helpers

  async findCustomer(ref: CustomerRef): Promise<customer | null> {
    if (ref.customer_id)
      return await customer.findOne({ where: { id: assertId(ref.customer_id, "customer_id") } });
    const wa = normaliseWa(ref.wa_number);
    if (!wa) return null;
    return await customer.findOne({ where: { wa_number: wa } });
  }

  private async mustFindCustomer(ref: CustomerRef): Promise<customer> {
    if (!ref.customer_id && !ref.wa_number)
      throw new BadRequestException({
        message: "customer_id or wa_number is required",
        code: "customer_ref_required",
      });
    const c = await this.findCustomer(ref);
    if (!c)
      throw new NotFoundException({ message: "Customer not found", code: "customer_not_found" });
    return c;
  }

  private async openConversation(customerId: string): Promise<conversation> {
    return (
      (await this._ConvRepo.findOpenByCustomer(customerId)) ??
      (await this._ConvRepo.openNew(customerId))
    );
  }

  private async moveTo(conv: conversation, to: ConversationState, reason: string) {
    try {
      const u = await this._ConvRepo.transition(conv.id, to, { reason });
      conv.state = u.state;
    } catch (e) {
      if (!(e instanceof InvalidTransitionError)) throw e;
      this.logger.warn(`conversation ${conv.id}: ${e.from} -> ${e.to} not allowed, kept`);
    }
  }

  /** Trigger log row (Trigger layer 13). Duplicates in the same journey are recorded as suppressed. */
  async logTrigger(
    c: customer,
    conv: conversation | null,
    triggerId: string,
    reason: string,
    source: Source,
    extra: { assets?: string[]; cta?: string; response?: string; suppression?: string } = {},
  ) {
    const dup = conv
      ? await trigger_event.findOne({ where: { conversation_id: conv.id, trigger_id: triggerId } })
      : null;
    await trigger_event.save(
      trigger_event.create({
        customer_id: c.id,
        conversation_id: conv?.id ?? null,
        trigger_id: triggerId,
        reason: reason.slice(0, 500),
        conversation_source: source === "crm" ? "human_agent" : source,
        assets: extra.assets ?? null,
        cta: extra.cta ?? null,
        response: extra.response ?? null,
        next_state: conv?.state ?? null,
        suppression_reason: extra.suppression ?? (dup ? "duplicate" : null),
      } as any),
    );
  }

  /** customer_response on the latest trigger of the journey that has none yet */
  private async markLastResponse(conversationId: string, response: string) {
    const last = await trigger_event
      .createQueryBuilder("t")
      .where("t.conversation_id = :c", { c: conversationId })
      .andWhere("t.response IS NULL")
      .andWhere("t.created_on > now() - interval '24 hours'") // older = already counted as ignored
      .orderBy("t.created_on", "DESC")
      .getOne();
    if (last) await trigger_event.update(last.id, { response });
  }

  // ---------------------------------------------------------------- lookup_customer

  /** Active product, consent, language and open booking / activation / escalation cases */
  async lookupCustomer(ref: CustomerRef) {
    const c = await this.mustFindCustomer(ref);
    const cons = await consent.findOne({ where: { customer_id: c.id } });
    const conv = await this._ConvRepo.findOpenByCustomer(c.id);
    const bookings = await booking_request.find({
      where: {
        customer_id: c.id,
        booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]),
      },
      relations: { centre: true },
      order: { created_on: "DESC" } as any,
    });
    const activations = await activation.find({
      where: {
        customer_id: c.id,
        activation_status: In([
          ActivationStatus.Pending,
          ActivationStatus.LinkSent,
          ActivationStatus.Active,
        ]),
      },
      order: { created_on: "DESC" } as any,
    });
    const escalations = await task.find({
      where: { customer_id: c.id, task_status: In([TaskStatus.Open, TaskStatus.InProgress]) },
      order: { created_on: "DESC" } as any,
    });
    return {
      customer_id: c.id,
      crm_customer_id: c.crm_customer_id ?? null,
      lead_id: c.lead_id ?? null,
      first_name: c.first_name ?? null,
      wa_number: c.wa_number,
      language: c.language,
      timezone: c.timezone ?? "Asia/Kolkata",
      active_product: c.active_product ?? null,
      active_plan: c.active_plan ?? null,
      opted_out: !!cons?.opt_out_at,
      consent: {
        whatsapp_consent: !!cons?.whatsapp_consent,
        marketing_consent: !!cons?.marketing_consent,
        health_data_consent: !!cons?.health_data_consent,
        consent_notice_version: cons?.notice_version ?? null,
        opt_out_timestamp: cons?.opt_out_at ?? null,
        privacy_request: cons?.privacy_request_at ?? null,
      },
      conversation: conv
        ? {
            id: conv.id,
            state: conv.state,
            selected_product: conv.selected_product ?? null,
            recommended_plan: conv.recommended_plan ?? null,
          }
        : null,
      open_bookings: bookings.map((b) => ({
        booking_request_id: b.id,
        centre: b.centre?.name ?? null,
        branch: b.centre?.branch ?? null,
        preferred_date: b.preferred_date,
        preferred_time: b.preferred_time ?? null,
        status: b.booking_status,
      })),
      open_activations: activations.map((a) => ({
        activation_id: a.id,
        product: a.product,
        plan: a.plan ?? null,
        billing: a.billing,
        payment_status: a.payment_status,
        activation_status: a.activation_status,
        link_sent_at: a.link_sent_at,
      })),
      open_cases: escalations.map((t) => ({
        task_id: t.id,
        type: t.type,
        priority: t.priority,
        status: t.task_status,
      })),
    };
  }

  // ---------------------------------------------------------------- search_centres

  /** Verified private centres from the directory only, up to 5, with their verification source */
  async searchCentres(q: {
    city?: string;
    latitude?: number | string;
    longitude?: number | string;
    radius_km?: number | string;
    specialisation?: string;
    locality?: string;
    customer_id?: string;
  }) {
    const lat = q.latitude != null && q.latitude !== "" ? Number(q.latitude) : undefined;
    const lon = q.longitude != null && q.longitude !== "" ? Number(q.longitude) : undefined;
    if (!q.city && (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)))
      throw new BadRequestException({
        message: "city, or latitude and longitude, is required",
        code: "location_required",
      });
    const radius = Math.min(200, Math.max(1, Number(q.radius_km) || 10));
    const list = await this._CentreSearch.search({
      city: q.city,
      latitude: lat,
      longitude: lon,
      radiusKm: radius,
      specialisation: q.specialisation,
      locality: q.locality,
    });
    if (q.customer_id) {
      // Provider group: the ids shown, so the record says exactly what was suggested
      const conv = await this._ConvRepo.findOpenByCustomer(assertId(q.customer_id, "customer_id"));
      if (conv) {
        let n = await need.findOne({ where: { conversation_id: conv.id } });
        if (!n) n = need.create({ conversation_id: conv.id } as any);
        n.suggested_centre_ids = list.map((c) => c.id);
        await n.save();
      }
    }
    return {
      count: list.length,
      radius_km: radius,
      note:
        list.length === 0
          ? "No verified option in that area. Ask to widen the radius or name a centre."
          : list.length < 5
            ? `Only ${list.length} verified option(s) found.`
            : null,
      centres: list.map((c) => ({
        centre_id: c.id,
        name: c.name,
        branch: c.branch ?? null,
        locality: c.locality ?? null,
        city: c.city,
        type: c.centre_type ?? null,
        specialisations: c.specialisations ?? [],
        distance_km: c.distance_km != null ? Math.round(c.distance_km * 10) / 10 : null,
        private_status_verified: !!c.is_private && !!c.verified,
        verified_at: c.verified_at ?? null,
        verification_source: c.verification_source ?? null,
      })),
    };
  }

  // ---------------------------------------------------------------- create_booking_request

  /** Playbook 17.2 payload. Always pending_confirmation; out-of-window dates are refused. */
  async createBookingRequest(body: {
    customer_id?: string;
    wa_number?: string;
    centre?: { centre_id?: string; id?: string; name?: string; branch?: string };
    specialisation?: string;
    preferred_date?: string;
    preferred_time?: string;
    selected_product?: string;
    source?: string;
  }) {
    const c = await this.mustFindCustomer(body);
    const source = sourceOf(body.source);
    const date = String(body.preferred_date ?? "");
    const chk = this._DateWindow.validate(date);
    if (!chk.valid)
      throw new BadRequestException({
        message: `preferred_date must be between ${chk.min} and ${chk.max} (Asia/Kolkata)`,
        code: "date_out_of_window",
        reason: chk.reason,
        min: chk.min,
        max: chk.max,
      });
    if (!body.specialisation?.trim())
      throw new BadRequestException({
        message: "specialisation is required",
        code: "specialisation_required",
      });
    const conv = await this.openConversation(c.id);

    const centreId = body.centre?.centre_id ?? body.centre?.id;
    let ctr: centre | null = null;
    if (centreId)
      ctr = await centre.findOne({
        where: { id: assertId(centreId, "centre.centre_id"), verified: true, active: true },
      });
    else if (body.centre?.name) {
      ctr = await centre.findOne({
        where: {
          name: ILike(body.centre.name.trim()),
          ...(body.centre.branch ? { branch: ILike(body.centre.branch.trim()) } : {}),
          verified: true,
          active: true,
        },
      });
    } else
      throw new BadRequestException({
        message: "centre.centre_id or centre.name is required",
        code: "centre_required",
      });

    if (!ctr) {
      // never reject a centre the customer chose: the team checks it, then the booking is made
      const name = `${body.centre?.name ?? centreId}${body.centre?.branch ? `, ${body.centre.branch}` : ""}`;
      const t = await this.newTask(c, conv, {
        type: TaskType.DirectoryVerification,
        priority: TaskPriority.Normal,
        summary: `Check centre before booking: ${name.slice(0, 120)} on ${date}`,
        reason: "centre not in the verified directory",
      });
      throw new UnprocessableEntityException({
        message: "Centre is not in the verified directory yet. A verification task was created.",
        code: "centre_needs_verification",
        task_id: t.id,
      });
    }

    const b = await this._Booking.create({
      customer_id: c.id,
      conversation_id: conv.id,
      centre_id: ctr.id,
      specialisation: body.specialisation.trim(),
      preferred_date: date,
      preferred_time: body.preferred_time ? String(body.preferred_time) : undefined,
    });
    // the CRM makes the "confirm booking" task from create_booking_request: local mirror only
    await task.save(
      task.create({
        type: TaskType.BookingConfirm,
        task_status: TaskStatus.Open,
        priority: TaskPriority.Normal,
        customer_id: c.id,
        conversation_id: conv.id,
        summary: `Booking request at ${ctr.name} on ${date}`,
      } as any),
    );
    let n = await need.findOne({ where: { conversation_id: conv.id } });
    if (!n) n = need.create({ conversation_id: conv.id } as any);
    n.preferred_centre_id = ctr.id;
    n.specialisation = body.specialisation.trim();
    await n.save();
    await conversation.update(conv.id, { outcome: "booking_requested" });
    if (conv.state !== ConversationState.OptedOut) {
      await this.moveTo(conv, ConversationState.BookingCapture, "booking via API");
      await this.moveTo(conv, ConversationState.BookingRecorded, "booking via API");
    }
    await this.logTrigger(c, conv, "H", `booking request saved (${source})`, source, {
      cta: "pending_confirmation",
    });
    return {
      booking_request_id: b.id,
      request_status: BookingStatus.PendingConfirmation,
      customer_id: c.id,
      centre: { centre_id: ctr.id, name: ctr.name, branch: ctr.branch ?? null },
      specialisation: body.specialisation.trim(),
      preferred_date: date,
      preferred_time: body.preferred_time ?? null,
      timezone: "Asia/Kolkata",
      selected_product: body.selected_product ?? conv.selected_product ?? null,
      source,
    };
  }

  // ---------------------------------------------------------------- create_follow_up

  /** Exact date/time, reason and selected product. Proactive sends only 09:00-21:00 IST. */
  async createFollowUp(body: {
    customer_id?: string;
    wa_number?: string;
    scheduled_for?: string;
    reason?: string;
    selected_product?: string;
    kind?: string;
    template_name?: string;
    source?: string;
  }) {
    const c = await this.mustFindCustomer(body);
    const when = parseWhen(body.scheduled_for);
    if (!when)
      throw new BadRequestException({
        message: "scheduled_for must be an ISO date-time, e.g. 2026-11-20T11:00:00+05:30",
        code: "invalid_time",
      });
    if (when.getTime() < Date.now() + 60_000)
      throw new BadRequestException({
        message: "scheduled_for must be in the future",
        code: "time_in_past",
      });
    if (when.getTime() > Date.now() + 90 * 24 * 3600 * 1000)
      throw new BadRequestException({
        message: "scheduled_for must be within 90 days",
        code: "time_too_far",
      });
    if (isQuietHours(when))
      throw new BadRequestException({
        message: "Follow-ups can be sent only between 09:00 and 21:00 IST",
        code: "quiet_hours",
      });
    if (!body.reason?.trim())
      throw new BadRequestException({ message: "reason is required", code: "reason_required" });
    const product = body.selected_product ?? null;
    if (product && !Object.values(ProductType).includes(product as ProductType))
      throw new BadRequestException({
        message: "selected_product must be oxxy or cut_medi_bills",
        code: "invalid_product",
      });
    const cons = await consent.findOne({ where: { customer_id: c.id } });
    if (cons?.opt_out_at)
      throw new ForbiddenException({
        message: "The customer opted out: no follow-ups",
        code: "opted_out",
      });
    if (cons?.privacy_request_at)
      throw new ForbiddenException({
        message: "Open privacy request: no follow-ups",
        code: "privacy_request_open",
      });
    const kind = ["agreed_follow_up", "rescue", "booking_update"].includes(String(body.kind))
      ? (body.kind as "agreed_follow_up")
      : "agreed_follow_up";
    const conv = await this.openConversation(c.id);
    const row = await this._Scheduler.create({
      customerId: c.id,
      conversationId: conv.id,
      kind,
      scheduledFor: when,
      templateName: body.template_name?.trim() || "agreed_follow_up",
      reason: body.reason.trim().slice(0, 500),
      selectedProduct: product ?? conv.selected_product ?? null,
      source: sourceOf(body.source),
    });
    await conversation.update(conv.id, { follow_up_at: when });
    if (kind === "agreed_follow_up") {
      await this.moveTo(conv, ConversationState.FollowUp, "agreed follow-up");
      await this.logTrigger(c, conv, "N", body.reason.trim(), sourceOf(body.source), {
        cta: when.toISOString(),
      });
    }
    return {
      follow_up_id: row.id,
      scheduled_for: when.toISOString(),
      kind,
      selected_product: row.selected_product,
      status: row.follow_up_status,
    };
  }

  // ---------------------------------------------------------------- get_official_plan

  /** Current price, GST, renewal, link and version time. Only from plan_catalog. */
  async getOfficialPlan(q: { product?: string; plan?: string; billing?: string }) {
    const product = String(q.product ?? "");
    if (!Object.values(ProductType).includes(product as ProductType))
      throw new BadRequestException({
        message: "product must be oxxy or cut_medi_bills",
        code: "invalid_product",
      });
    if (product === ProductType.Oxxy && !q.plan)
      throw new BadRequestException({
        message: "plan is required for oxxy (everyday, vital, thrive, infinity)",
        code: "plan_required",
      });
    const where: any = { product, status: true };
    if (product === ProductType.Oxxy) where.plan = String(q.plan).toLowerCase();
    if (q.billing) where.billing = String(q.billing).toLowerCase();
    const rows = await plan_catalog.find({
      where,
      order: { billing: "ASC" } as any,
      // the version time; BaseTable hides these columns by default
      select: [
        "id",
        "product",
        "plan",
        "billing",
        "price",
        "gst_rate",
        "auto_renews",
        "renewal_terms",
        "max_saving_pct",
        "age_limit",
        "activation_time",
        "activation_link",
        "version",
        "created_on",
        "updated_on",
      ] as any,
    });
    if (!rows.length)
      throw new NotFoundException({
        message: "No current official plan for this product",
        code: "plan_not_found",
      });
    return {
      product,
      plan: product === ProductType.Oxxy ? where.plan : null,
      options: rows.map((r) => {
        const gst = Number(r.gst_rate) || 0;
        const price = Number(r.price);
        const unconfirmed = !planReady(r);
        return {
          catalog_id: r.id,
          billing: r.billing,
          price,
          gst_rate: gst,
          gst_amount: Math.round(price * gst * 100) / 100,
          price_incl_gst: Math.round(price * (1 + gst) * 100) / 100,
          auto_renews: !!r.auto_renews,
          renewal_terms: isPlaceholder(r.renewal_terms) ? null : r.renewal_terms,
          activation_time: isPlaceholder(r.activation_time) ? null : r.activation_time,
          max_saving_pct: r.max_saving_pct != null ? Number(r.max_saving_pct) : null,
          age_limit: r.age_limit ?? null,
          activation_link: isRealLink(r.activation_link) ? r.activation_link : null,
          version: r.version,
          version_timestamp: (r.updated_on ?? r.created_on) as Date,
          // true = a value is missing or a placeholder (returned as null): do not quote this plan as final
          needs_confirmation: unconfirmed,
        };
      }),
    };
  }

  // ---------------------------------------------------------------- send_approved_asset

  /** Only approved, in-date assets; one send per asset per journey; consent, 24 h window, quiet hours. */
  async sendApprovedAsset(body: {
    customer_id?: string;
    wa_number?: string;
    asset_id?: string;
    code?: string;
    source?: string;
  }) {
    const c = await this.mustFindCustomer(body);
    const source = sourceOf(body.source);
    if (!body.asset_id && !body.code)
      throw new BadRequestException({
        message: "asset_id or code is required",
        code: "asset_ref_required",
      });
    const a = await approved_asset.findOne({
      where: body.asset_id
        ? { id: assertId(body.asset_id, "asset_id") }
        : { code: String(body.code) },
    });
    if (!a || !a.status)
      throw new NotFoundException({ message: "Asset not found", code: "asset_not_found" });
    if (!a.approved || !ASSET_KINDS.includes(a.kind))
      throw new ForbiddenException({
        message: "Asset is not approved for sending",
        code: "asset_not_approved",
      });
    if (a.valid_to && new Date(a.valid_to).getTime() < Date.now())
      throw new GoneException({ message: "Asset has expired", code: "asset_expired" });

    const cons = await consent.findOne({ where: { customer_id: c.id } });
    if (cons?.opt_out_at)
      throw new ForbiddenException({ message: "The customer opted out", code: "opted_out" });
    if (cons?.privacy_request_at)
      throw new ForbiddenException({
        message: "Open privacy request",
        code: "privacy_request_open",
      });
    const conv = await this.openConversation(c.id);
    if (conv.state === ConversationState.Pause)
      throw new ConflictException({
        message: "Safety event open: no commercial content",
        code: "safety_event_open",
      });
    if (await asset_send.findOne({ where: { conversation_id: conv.id, asset_id: a.id } }))
      throw new ConflictException({
        message: "Already sent in this journey",
        code: "duplicate",
        suppression_reason: "duplicate",
      });

    const inWindow = isWithin24h(conv.last_customer_message_at);
    let wamid: string;
    try {
      if (inWindow) {
        wamid = await this._Wa.send(
          c.id,
          { kind: "text", body: `${a.title}\n${a.url}` },
          source === "whatsapp_inbound" ? "reply" : "proactive",
        );
      } else if (a.template_name) {
        wamid = await this._Wa.send(
          c.id,
          {
            kind: "template",
            name: a.template_name,
            languageCode: a.language === "hi" ? "hi" : "en",
            params: [a.title, a.url],
          },
          "proactive",
        );
      } else {
        throw new ConflictException({
          message: "Outside the 24-hour window and the asset has no approved template",
          code: "window_closed_no_template",
        });
      }
    } catch (e) {
      if (e instanceof QuietHoursError)
        throw new ConflictException({
          message: "Quiet hours (21:00-09:00 IST)",
          code: "quiet_hours",
          next_allowed_at: e.nextAllowedAt,
        });
      if (e instanceof WindowClosedError)
        throw new ConflictException({ message: e.message, code: "window_closed" });
      throw e;
    }
    const sent = await asset_send.save(
      asset_send.create({
        customer_id: c.id,
        conversation_id: conv.id,
        asset_id: a.id,
        kind: a.kind,
        wa_message_id: wamid,
        source,
      } as any),
    );
    if (a.trigger_id)
      await this.logTrigger(c, conv, a.trigger_id, `asset ${a.code} sent`, source, {
        assets: [a.id],
        cta: a.url,
      });
    return {
      asset_send_id: sent.id,
      asset_id: a.id,
      code: a.code,
      kind: a.kind,
      wa_message_id: wamid,
    };
  }

  // ---------------------------------------------------------------- create_escalation

  private async newTask(
    c: customer,
    conv: conversation | null,
    t: {
      type: TaskType;
      priority: TaskPriority;
      summary: string;
      reason: string;
      callbackFrom?: Date | null;
      callbackTo?: Date | null;
    },
  ): Promise<task> {
    const { row, ob } = await this._DataSource.transaction(async (mg) => {
      const saved = await mg.save(
        mg.create(task, {
          type: t.type,
          task_status: TaskStatus.Open,
          priority: t.priority,
          customer_id: c.id,
          conversation_id: conv?.id ?? null,
          summary: t.summary,
          reason: t.reason,
          callback_from: t.callbackFrom ?? null,
          callback_to: t.callbackTo ?? null,
          due_at: t.callbackFrom ?? null,
        } as any),
      );
      const out = await this._Outbox.enqueue(mg, CrmAction.CreateTask, c.id, {
        task_id: (saved as any).id,
        type: t.type,
        priority: t.priority,
        reason: t.reason,
        summary: t.summary,
        callback_window: t.callbackFrom ? { from: t.callbackFrom, to: t.callbackTo } : null,
        conversation_id: conv?.id ?? null,
        activation_pitch_allowed: false, // an escalation is never a sales call (Playbook 11.2)
      });
      return { row: saved as task, ob: out };
    });
    await this._Outbox.dispatch(ob);
    return row;
  }

  /** Priority, reason, callback window and transcript summary. Commercial prompts stop until it is closed. */
  async createEscalation(body: {
    customer_id?: string;
    wa_number?: string;
    priority?: string;
    reason?: string;
    callback_window?: { from?: string; to?: string };
    summary?: string;
    source?: string;
  }) {
    const c = await this.mustFindCustomer(body);
    const priority = Object.values(TaskPriority).includes(body.priority as TaskPriority)
      ? (body.priority as TaskPriority)
      : TaskPriority.Normal;
    if (!body.reason?.trim())
      throw new BadRequestException({ message: "reason is required", code: "reason_required" });
    if (!body.summary?.trim())
      throw new BadRequestException({
        message: "summary is required (no health details)",
        code: "summary_required",
      });
    const from = parseWhen(body.callback_window?.from);
    const to = parseWhen(body.callback_window?.to);
    if ((body.callback_window?.from && !from) || (body.callback_window?.to && !to))
      throw new BadRequestException({
        message: "callback_window.from / to must be ISO date-times",
        code: "invalid_time",
      });
    if (from && to && to <= from)
      throw new BadRequestException({
        message: "callback_window.to must be after from",
        code: "invalid_callback_window",
      });
    const conv = await this.openConversation(c.id);
    const t = await this.newTask(c, conv, {
      type: TaskType.Escalation,
      priority,
      summary: body.summary.trim().slice(0, 2000),
      reason: body.reason.trim().slice(0, 500),
      callbackFrom: from,
      callbackTo: to,
    });
    await conversation.update(conv.id, { escalation_reason: body.reason.trim().slice(0, 500) });
    if (conv.state !== ConversationState.OptedOut && conv.state !== ConversationState.Pause)
      await this.moveTo(conv, ConversationState.Escalated, "escalation via API");
    // the escalation is the response to the trigger before it; O itself is the outcome
    await this.markLastResponse(conv.id, "escalated");
    await this.logTrigger(c, conv, "O", body.reason.trim(), sourceOf(body.source));
    return {
      task_id: t.id,
      priority,
      reason: t.reason,
      callback_window: from ? { from: from.toISOString(), to: to?.toISOString() ?? null } : null,
      status: TaskStatus.Open,
    };
  }

  // ---------------------------------------------------------------- start_conversation (Playbook 4.1)

  /**
   * A consented outbound lead (lead form, voice AI call, CRM). Playbook 4.1 Message 1 with three buttons.
   * - context: what the customer already said on the call (need, city, product …). Saved on the conversation
   *   and the need record, so the chat does not ask it again.
   * - quiet hours (21:00-09:00 IST): queued and sent at 09:00 IST (status "queued").
   * - a new chat: the approved template lead_intro (status "sent").
   * - the customer wrote within 24 hours and nothing is in progress: the same three buttons as a normal
   *   message (status "sent"). A chat in progress is not interrupted: only the context is saved
   *   (status "context_saved").
   * Never to an opted-out number.
   */
  async startConversation(body: {
    wa_number?: string;
    first_name?: string;
    lead_id?: string;
    consent_source?: string;
    whatsapp_consent?: boolean;
    language?: string;
    source?: string;
    context?: unknown;
  }) {
    const wa = normaliseWa(body.wa_number);
    if (!wa)
      throw new BadRequestException({
        message: "wa_number is required",
        code: "customer_ref_required",
      });
    if (body.whatsapp_consent !== true || !body.consent_source?.trim())
      throw new BadRequestException({
        message:
          "whatsapp_consent: true and consent_source are required (Playbook 4.1: consented leads only)",
        code: "consent_required",
      });
    const ctx = cleanCallContext(body.context);
    let c = await customer.findOne({ where: { wa_number: wa } });
    if (!c) {
      c = await customer.save(
        customer.create({
          wa_number: wa,
          first_name: body.first_name?.trim() || null,
          lead_id: body.lead_id ?? null,
          language: ["en", "hi", "hinglish"].includes(String(body.language)) ? body.language : "en",
        } as any),
      );
    } else {
      const patch: Record<string, unknown> = {};
      if (body.lead_id && !c.lead_id) patch.lead_id = body.lead_id;
      if (body.first_name?.trim() && !c.first_name) patch.first_name = body.first_name.trim();
      if (Object.keys(patch).length) await customer.update(c.id, patch);
    }
    const cons =
      (await consent.findOne({ where: { customer_id: c.id } })) ??
      consent.create({ customer_id: c.id } as any);
    if (cons.opt_out_at)
      throw new ForbiddenException({ message: "The customer opted out", code: "opted_out" });
    cons.whatsapp_consent = true;
    cons.consent_source = body.consent_source.trim().slice(0, 120);
    await cons.save();
    const conv = await this.openConversation(c.id);
    if (ctx) await this.saveCallContext(conv, ctx, !!c.active_product);
    const name = c.first_name || body.first_name?.trim() || "there";
    const base = { customer_id: c.id, conversation_id: conv.id, context_saved: !!ctx };

    const inWindow = isWithin24h(conv.last_customer_message_at);
    const idle =
      !conv.pending_action &&
      [ConversationState.New, ConversationState.IntentMenu].includes(
        conv.state as ConversationState,
      );
    if (inWindow && !idle) return { ...base, status: "context_saved", reason: "chat_in_progress" };
    if (!inWindow && conv.state !== ConversationState.New)
      throw new ConflictException({
        message: "A chat with this customer is already going on",
        code: "chat_open",
        context_saved: !!ctx,
      });

    if (isQuietHours(new Date())) {
      const existing = await follow_up.findOne({
        where: { conversation_id: conv.id, kind: "lead_intro", follow_up_status: "scheduled" },
      });
      const when = nextAllowedAt(new Date());
      if (!existing)
        await this._Scheduler.create({
          customerId: c.id,
          conversationId: conv.id,
          kind: "lead_intro",
          scheduledFor: when,
          templateName: "lead_intro",
          params: [name],
          reason: "consented lead, asked during quiet hours",
          source: sourceOf(body.source ?? "voice_ai"),
        });
      return {
        ...base,
        status: "queued",
        scheduled_for: new Date(existing?.scheduled_for ?? when).toISOString(),
        template: "lead_intro",
      };
    }

    let wamid: string | null;
    if (inWindow) {
      // inside the 24-hour window: the same message and buttons as a normal message (no template needed)
      const l = lang(c.language);
      wamid = await this._Wa.send(
        c.id,
        {
          kind: "buttons",
          body: LEAD_INTRO_TEXT[l].replace("{name}", name),
          buttons: LEAD_ROWS.map((r) => ({ id: r.id, title: r.title[l] })),
        },
        "proactive",
      );
    } else {
      wamid = await this._Wa.send(
        c.id,
        {
          kind: "template",
          name: "lead_intro",
          languageCode: c.language === "hi" ? "hi" : "en",
          params: [name],
        },
        "proactive",
      );
    }
    await conversation.update(conv.id, { pending_action: "lead_intro" });
    return {
      ...base,
      status: "sent",
      wa_message_id: wamid,
      template: inWindow ? null : "lead_intro",
    };
  }

  /** The call's details on the conversation (encrypted) and on the need record, so the chat does not ask again */
  private async saveCallContext(conv: conversation, ctx: CallContext, hasActiveProduct: boolean) {
    conv.call_context = describeCallContext(ctx);
    conv.call_context_at = new Date();
    if (!hasActiveProduct && !conv.selected_product && ctx.selected_product) {
      conv.selected_product = ctx.selected_product;
      if (ctx.selected_product === "oxxy" && ctx.recommended_plan)
        conv.recommended_plan = ctx.recommended_plan;
    }
    await conversation.save(conv);
    const n =
      (await need.findOne({ where: { conversation_id: conv.id } })) ??
      need.create({ conversation_id: conv.id } as any);
    if (ctx.city && !n.city) n.city = ctx.city;
    if (ctx.locality && !n.locality) n.locality = ctx.locality;
    if (ctx.beneficiary && !n.beneficiary) n.beneficiary = ctx.beneficiary;
    if (ctx.specialisation && !n.specialisation) n.specialisation = ctx.specialisation;
    if (ctx.need && !n.healthcare_need) n.healthcare_need = ctx.need;
    await need.save(n);
  }

  // ---------------------------------------------------------------- set_opt_out

  /** Suppresses all WhatsApp automation at once: consent, state, scheduled follow-ups, CRM */
  async setOptOut(body: { customer_id?: string; wa_number?: string; source?: string }) {
    const c = await this.mustFindCustomer(body);
    const source = sourceOf(body.source);
    const at = new Date();
    const conv = await this._ConvRepo.findOpenByCustomer(c.id);
    const already = await consent.findOne({ where: { customer_id: c.id } });
    if (already?.opt_out_at) {
      return {
        customer_id: c.id,
        opted_out_at: already.opt_out_at,
        already_opted_out: true,
        cancelled_follow_ups: 0,
      };
    }
    const ob = await this._DataSource.transaction(async (mg) => {
      const cons =
        (await mg.findOne(consent, { where: { customer_id: c.id } })) ??
        mg.create(consent, { customer_id: c.id });
      cons.opt_out_at = at;
      cons.marketing_consent = false;
      await mg.save(cons);
      if (conv) {
        try {
          await this._ConvRepo.transition(conv.id, ConversationState.OptedOut, {
            reason: "set_opt_out",
            manager: mg,
          });
          await mg.update(conversation, conv.id, { outcome: "opted_out" });
        } catch (e) {
          if (!(e instanceof InvalidTransitionError)) throw e;
        }
      }
      // the CRM told us (customer.opted_out webhook): do not echo it back
      if (source === "crm") return null;
      return await this._Outbox.enqueue(mg, CrmAction.SetOptOut, c.id, {
        customer_id: c.id,
        opt_out_at: at.toISOString(),
      });
    });
    await this._Outbox.dispatch(ob);
    const cancelled = await this._Scheduler.cancelAll(c.id, "opt_out");
    if (conv) {
      await this.markLastResponse(conv.id, "opted_out");
      await this.logTrigger(c, conv, "R", `opt-out (${source})`, source);
    }
    return {
      customer_id: c.id,
      opted_out_at: at.toISOString(),
      already_opted_out: false,
      cancelled_follow_ups: cancelled,
    };
  }
}
