import { Permission } from "@Helper/Permissions";
import { caseRef, refPrefix } from "@Service/Oxxy/CallbackFlow";
import { TaskType } from "@Helper/Enum/TaskType";
import { GoogleMapsService } from "@Service/Maps/GoogleMaps.service";
import {
  Optional,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { audit_log } from "@Database/Table/Admin/audit_log";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { centre } from "@Database/Table/Oxxy/centre";
import { consent } from "@Database/Table/Oxxy/consent";
import { conversation } from "@Database/Table/Oxxy/conversation";
import { crm_outbox } from "@Database/Table/Crm/crm_outbox";
import { message } from "@Database/Table/Oxxy/message";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { trigger_event } from "@Database/Table/Oxxy/trigger_event";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { ConversationState } from "@Helper/Enum/ConversationState";
import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { ConversationRepository } from "@Service/Oxxy/ConversationRepository.service";
import { TRIGGER_CATALOG } from "@Service/Oxxy/TriggerEngine.service";
import { WhatsappClient } from "@Service/Oxxy/WhatsappClient.service";
import { SystemConfigService } from "@Service/Admin/SystemConfig.service";
import { CrmOutboxService } from "@Service/Crm/CrmOutbox.service";
import { CrmWebhookService } from "@Service/Crm/CrmWebhook.service";
import { task } from "@Database/Table/Oxxy/task";
import { activation } from "@Database/Table/Oxxy/activation";
import { CurrentUser } from "@Helper/Common.helper";
import { In, IsNull, MoreThanOrEqual } from "typeorm";
import { audit, changes, scrub } from "@Helper/AuditTrail";
import { user } from "@Database/Table/Admin/user";
import { RoleEnum } from "@Helper/Enum/RoleEnum";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { TaskPriority } from "@Helper/Enum/TaskPriority";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { urgentLabel } from "@Service/Ops/UrgentAlert.service";

const truthy = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  return ["true", "yes", "y", "1"].includes(s);
};

/**
 * One CSV / JSON row -> centre fields (Playbook 10.1: only verified private centres are suggested).
 * Text booleans are parsed ("false" / "no" used to count as verified). A row is verified only when it says
 * so; it then needs a verification_source and gets verified_at (today unless given).
 * specialisations: "cardiology|orthopaedics".
 */
export function importedCentre(r: Record<string, any>) {
  const verified = truthy(r.verified) === true;
  return {
    name: String(r.name).trim(),
    branch: r.branch ? String(r.branch).trim() : null,
    locality: r.locality ? String(r.locality).trim() : null,
    city: String(r.city).trim(),
    postcode: r.postcode ? String(r.postcode).trim() : null,
    address: r.address ? String(r.address).trim().slice(0, 300) : null,
    phone: r.phone ? String(r.phone).trim().slice(0, 30) : null,
    opening_hours: r.opening_hours ? String(r.opening_hours).trim().slice(0, 200) : null,
    latitude: Number(r.latitude) || 0,
    longitude: Number(r.longitude) || 0,
    centre_type: r.centre_type ? String(r.centre_type).trim() : "multispeciality",
    specialisations: Array.isArray(r.specialisations)
      ? r.specialisations
      : String(r.specialisations ?? "")
          .split("|")
          .map((x: string) => x.trim())
          .filter(Boolean),
    is_private: truthy(r.is_private) ?? true,
    verified,
    verification_source: r.verification_source
      ? String(r.verification_source).trim()
      : verified
        ? "csv import"
        : null,
    verified_at: verified
      ? r.verified_at
        ? String(r.verified_at).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
      : null,
    active: truthy(r.active) ?? true,
  };
}

// ---- Conversations inbox ----
export const MESSAGE_PAGE = 200;
const VIEW_STATES: Record<string, string[]> = {
  person: [ConversationState.Pause, ConversationState.Escalated],
  booking: [ConversationState.BookingCapture, ConversationState.BookingRecorded],
  opted: [ConversationState.OptedOut],
};

/** The customer's newest conversation (a restart or a new journey opens another; the inbox shows one row) */
const LATEST_SQL = `c.id = (SELECT x.id FROM conversation x WHERE x.customer_id = c.customer_id
                            ORDER BY x.created_on DESC, x.id DESC LIMIT 1)`;

/** Customer messages after the last reply (bot or team): the customer is waiting for an answer */
const WAITING_SQL = `EXISTS (SELECT 1 FROM message mi WHERE mi.conversation_id = c.id AND mi.direction = 'in'
  AND mi.created_on > COALESCE((SELECT MAX(o.created_on) FROM message o
                                WHERE o.conversation_id = c.id AND o.direction = 'out'), 'epoch'))`;
// the cutoff goes in as a parameter (a Date), written the same way the app writes last_customer_message_at
const windowSince = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const PERSON_STATES = [ConversationState.Pause, ConversationState.Escalated];

/** Inbox tabs that are not a plain state list: their WHERE part (me = the signed-in user) */
export function viewWhere(view: string | undefined, me: string | null): { sql: string; params: object } | null {
  if (view === "waiting") return { sql: `${WAITING_SQL} AND c.state <> 'opted_out'`, params: {} };
  if (view === "window")
    return { sql: "c.last_customer_message_at > :since", params: { since: windowSince() } };
  if (view === "mine")
    return {
      sql: "c.taken_over_by_id = :me AND c.state IN (:...personStates)",
      params: { me: me ?? "-", personStates: PERSON_STATES },
    };
  return null;
}

const BOOKING_STEP: Record<string, string> = {
  offer: "Booking: yes / no to the centre",
  centre: "Booking: centre name",
  landmark: "Booking: area or landmark",
  specialisation: "Booking: specialisation",
  date: "Booking: preferred date",
  time: "Booking: preferred time",
};
const STEP_LABEL: Record<string, string> = {
  centre_pick: "Picking a centre from the list",
  centre_radius: "Travel distance",
  centre_location: "Location or area",
  follow_up_time: "Follow-up time",
  soft_activation: "Activation answer",
  lead_intro: "Reply to the first message",
  after_consent: "Health-data consent",
};
/** What the bot is waiting for, in words for the team (pending_action is an internal marker) */
export function pendingStepLabel(p: string | null | undefined): string | null {
  if (!p || p === "parked_ack") return null;
  if (p.startsWith("booking:")) {
    try {
      return BOOKING_STEP[JSON.parse(p.slice(8))?.step] ?? "Booking request";
    } catch {
      return "Booking request";
    }
  }
  if (p.startsWith("callback_time:")) return "Callback time choice";
  if (p.startsWith("cmb_gate:")) return "Cut Medi Bills eligibility check";
  if (p.startsWith("rebook_offer:")) return "Another centre after a cancellation";
  const key = p.split(":")[0];
  return STEP_LABEL[key] ?? key.replace(/_/g, " ");
}

/** 1..300 rows, 100 by default */
export const pageSize = (v?: string) => Math.min(300, Math.max(1, Math.floor(Number(v)) || 100));

/** Search text -> a lower-case term and, for a phone number, its digits (3 or more) */
export function inboxSearch(q?: string): { term: string; digits: string } | null {
  const term = String(q ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  if (!term) return null;
  const digits = term.replace(/\D/g, "");
  return { term, digits: digits.length >= 3 ? digits : "" };
}

/** Last message preview, how many customer messages wait for an answer, and an open booking (opted-out replies) */
export async function withInboxSummary(rows: conversation[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [last, waiting, bookings] = await Promise.all([
    conversation.query(
      `SELECT DISTINCT ON (conversation_id) conversation_id, direction, sender, body, template_name, type, created_on
         FROM message WHERE conversation_id = ANY($1) ORDER BY conversation_id, created_on DESC, id DESC`,
      [ids],
    ),
    conversation.query(
      `SELECT m.conversation_id, COUNT(*)::int AS n FROM message m
        WHERE m.conversation_id = ANY($1) AND m.direction = 'in'
          AND m.created_on > COALESCE((SELECT MAX(o.created_on) FROM message o
                                       WHERE o.conversation_id = m.conversation_id AND o.direction = 'out'), 'epoch')
        GROUP BY m.conversation_id`,
      [ids],
    ),
    conversation.query(
      `SELECT DISTINCT customer_id FROM booking_request WHERE customer_id = ANY($1) AND booking_status = $2`,
      [rows.map((r) => r.customer_id), BookingStatus.PendingConfirmation],
    ),
  ]);
  // who has the chat (a person took it over)
  const takers = [...new Set(rows.map((r) => r.taken_over_by_id).filter(Boolean))] as string[];
  const people: any[] = takers.length
    ? await conversation.query(`SELECT id::text AS id, first_name, email FROM "user" WHERE id::text = ANY($1)`, [takers])
    : [];
  const nameBy = new Map<string, string>(people.map((p: any) => [p.id, p.first_name || p.email]));
  const lastBy = new Map<string, any>(last.map((m: any) => [m.conversation_id, m]));
  const waitBy = new Map<string, number>(waiting.map((w: any) => [w.conversation_id, Number(w.n)]));
  const booked = new Set<string>(bookings.map((b: any) => b.customer_id));
  return rows.map((r) => {
    const m = lastBy.get(r.id);
    return {
      ...r,
      last_message: m
        ? {
            direction: m.direction,
            sender: m.sender,
            text: previewOf(m),
            created_on: m.created_on,
          }
        : null,
      waiting: waitBy.get(r.id) ?? 0,
      open_booking: booked.has(r.customer_id),
      pending_step: pendingStepLabel(r.pending_action),
      handled_by:
        r.taken_over_by_id && PERSON_STATES.includes(r.state as ConversationState)
          ? (nameBy.get(r.taken_over_by_id) ?? "A team member")
          : null,
    };
  });
}

/** One line for the inbox list */
export function previewOf(m: {
  body?: string | null;
  template_name?: string | null;
  type?: string | null;
}): string {
  const text = (m.body ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  if (m.template_name) return `Template: ${m.template_name}`;
  return m.type && m.type !== "text" ? `[${m.type}]` : "";
}

@Controller({ path: "Console", version: "1" })
@ApiTags("Sales Console")
export class ConsoleController extends JWTAuthController {
  constructor(
    private readonly _ConvRepo: ConversationRepository,
    private readonly _Wa: WhatsappClient,
    private readonly _SystemConfig: SystemConfigService,
    private readonly _Outbox: CrmOutboxService,
    private readonly _CrmEvents: CrmWebhookService,
    @Optional() private readonly _Maps?: GoogleMapsService,
  ) {
    super();
  }

  // A centre saved without a point (latitude / longitude empty or 0) gets one from its address on the map
  // (Google Geocoding). With no key or no match the row stays as typed.
  private async fillPoint(r: any): Promise<any> {
    if (!r || (Number(r.latitude) && Number(r.longitude))) return r;
    const text = [r.address, r.name, r.branch, r.locality, r.city, r.postcode].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
    const geo = text ? await this._Maps?.geocode(text) : null;
    return geo ? { ...r, latitude: geo.latitude, longitude: geo.longitude } : r;
  }

  // "Find on map" in the centre form: the point for an address, shown to the user before saving
  @Permission("centres.edit")
  @Post("Centres/Geocode")
  async GeocodeCentre(@Body("address") address: string) {
    const text = String(address ?? "").trim();
    if (text.length < 3) throw new BadRequestException("Type the address or the centre name and city first");
    if (!this._Maps?.enabled) throw new BadRequestException("Google Maps is not set up (Configuration -> Maps)");
    const geo = await this._Maps.geocode(text);
    if (!geo && this._Maps.lastProblem)
      throw new BadRequestException(
        `Google Maps refused the request (${this._Maps.lastProblem}). Check the key with "Test the saved server key" in Configuration, Maps.`,
      );
    if (!geo) throw new NotFoundException("Google Maps could not find this address. Add the area and city, or type the point by hand.");
    return this.SendResponseData(geo);
  }

  // "Test the Google Maps key": one real call per API (Geocoding, Routes, Places) with the saved key
  @Permission("settings.manage")
  @Post("Maps/Test")
  async TestMaps() {
    if (!this._Maps) throw new BadRequestException("Google Maps is not available");
    return this.SendResponseData(await this._Maps.selfTest());
  }

  // The directory on a map, and the places customers asked for where no verified centre exists yet
  @Permission("centres.read")
  @Get("Centres/Map")
  async CentresMap() {
    const rows = await centre.find({ where: { status: true }, order: { city: "ASC", name: "ASC" } as any, take: 2000 });
    const tasks = await task
      .createQueryBuilder("t")
      .where("t.type = :type AND t.summary LIKE 'No verified centre for %'", { type: TaskType.DirectoryVerification })
      .orderBy("t.created_on", "DESC")
      .take(300)
      .getMany();
    const count = new Map<string, number>();
    for (const t of tasks) {
      const place = String(t.summary).replace(/^No verified centre for /, "").split(":")[0].trim();
      if (place) count.set(place, (count.get(place) ?? 0) + 1);
    }
    const gaps: { place: string; requests: number; latitude: number | null; longitude: number | null }[] = [];
    for (const [place, requests] of [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      const geo = (await this._Maps?.geocode(place)) ?? null; // cached after the chat looked it up
      gaps.push({ place, requests, latitude: geo?.latitude ?? null, longitude: geo?.longitude ?? null });
    }
    return this.SendResponseData({
      maps_enabled: !!this._Maps?.enabled,
      browser_key: this._Maps?.browserKey || null,
      centres: rows.map((c) => ({
        id: c.id,
        name: c.name,
        branch: c.branch,
        locality: c.locality,
        city: c.city,
        centre_type: c.centre_type,
        latitude: Number(c.latitude) || null,
        longitude: Number(c.longitude) || null,
        verified: c.verified,
        active: c.active,
      })),
      gaps,
    });
  }

  @Permission("conversations.read")
  @Get("Conversations")
  async Conversations(
    @Query("q") q?: string,
    @Query("view") view?: string,
    @Query("limit") limit?: string,
    @Req() req?: any,
  ) {
    // Inbox list: search and tab filter run in the database, so a customer beyond the newest page is still found
    const qb = conversation.createQueryBuilder("c").leftJoinAndSelect("c.customer", "customer");
    qb.andWhere(LATEST_SQL); // one row per customer: the current chat (older ones show in its thread)
    const states = VIEW_STATES[view ?? ""];
    if (states) qb.andWhere("c.state IN (:...states)", { states });
    const extra = viewWhere(view, req?.user?.user_id ?? null);
    if (extra) qb.andWhere(extra.sql, extra.params);
    const search = inboxSearch(q);
    if (search) {
      const parts = ["LOWER(customer.first_name) LIKE :term", "c.state LIKE :term"];
      if (search.digits) parts.push("customer.wa_number LIKE :digits");
      qb.andWhere(`(${parts.join(" OR ")})`, {
        term: `%${search.term}%`,
        digits: `%${search.digits}%`,
      });
    }
    const rows = await qb
      .orderBy("c.last_customer_message_at", "DESC", "NULLS LAST")
      .addOrderBy("c.id", "ASC")
      .take(pageSize(limit))
      .getMany();
    return this.SendResponseData(await withInboxSummary(rows));
  }

  // The number on each inbox tab (one query)
  @Permission("conversations.read")
  @Get("Conversations/Counts")
  async ConversationCounts(@Req() req: any) {
    const me = req?.user?.user_id ?? "-";
    const [r] = await conversation.query(
      `SELECT COUNT(*)::int AS all,
              COUNT(*) FILTER (WHERE ${WAITING_SQL} AND c.state <> 'opted_out')::int AS waiting,
              COUNT(*) FILTER (WHERE c.state = ANY($1))::int AS person,
              COUNT(*) FILTER (WHERE c.state = ANY($1) AND c.taken_over_by_id = $2)::int AS mine,
              COUNT(*) FILTER (WHERE c.state = ANY($3))::int AS booking,
              COUNT(*) FILTER (WHERE c.last_customer_message_at > $4)::int AS "window",
              COUNT(*) FILTER (WHERE c.state = 'opted_out')::int AS opted
         FROM conversation c WHERE ${LATEST_SQL}`,
      [PERSON_STATES, me, VIEW_STATES.booking, windowSince()],
    );
    return this.SendResponseData(r ?? {});
  }

  @Permission("conversations.read")
  @Get("Conversations/:Id/Messages")
  async Messages(@Param("Id") Id: string, @Query("before") before?: string) {
    // the NEWEST messages (oldest first on screen); "before" pages back to older ones
    // the customer's whole history, every chat (a restart or a new journey adds a "new chat" line on screen)
    const qb = message
      .createQueryBuilder("m")
      .addSelect("m.created_on")
      .where(
        `m.conversation_id IN (SELECT y.id FROM conversation y WHERE y.customer_id =
           (SELECT z.customer_id FROM conversation z WHERE z.id = :Id))`,
        { Id },
      );
    const until = before ? new Date(before) : null;
    if (until && !isNaN(until.getTime())) qb.andWhere("m.created_on < :until", { until });
    const rows = await qb
      .orderBy("m.created_on", "DESC")
      .addOrderBy("m.id", "DESC")
      .take(MESSAGE_PAGE)
      .getMany();
    return this.SendResponseData(rows.reverse());
  }

  // "Restart chat": the bot starts again from the welcome, as for a new customer (demos, a muddled chat).
  // The old messages stay in the thread above a "new chat" line.
  @Permission("conversations.reply")
  @Post("Conversations/:Id/Restart")
  async Restart(
    @Param("Id") Id: string,
    @Body() body: { forget_earlier?: boolean; ask_consent_again?: boolean },
  ) {
    const fresh = await this._ConvRepo.restart(Id, {
      forgetEarlier: body?.forget_earlier !== false,
      askConsentAgain: body?.ask_consent_again === true,
    });
    return this.SendResponseData({ conversation_id: fresh.id });
  }

  // the sales team (User role) chats with customers too (Full Plan 12.9)
  @Permission("conversations.reply")
  @Post("Conversations/:Id/TakeOver")
  async TakeOver(@Param("Id") Id: string, @Req() req: any) {
    const conv = await this._ConvRepo.findById(Id);
    if (!conv) throw new NotFoundException("Conversation not found");
    // a person has the chat: ESCALATED. PAUSE stays the safety state (emergency / privacy), so a takeover
    // is not counted as an emergency in the trigger suppression and the KPIs
    if (conv.state !== ConversationState.Pause && conv.state !== ConversationState.Escalated) {
      await this._ConvRepo.transition(Id, ConversationState.Escalated, {
        reason: "agent take over",
      });
    }
    await conversation.update(Id, {
      taken_over_by_id: req.user?.user_id ?? null,
      taken_over_at: new Date(),
    });
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  // the sales team (User role) chats with customers too (Full Plan 12.9).
  // `note` (optional) is what the bot should know when it takes over again; it reaches the next prompts.
  @Permission("conversations.reply")
  @Post("Conversations/:Id/HandBack")
  async HandBack(@Param("Id") Id: string, @Body("note") note: string | undefined, @Req() req: any) {
    const conv = await this._ConvRepo.findById(Id);
    if (!conv) throw new NotFoundException("Conversation not found");
    const clean = typeof note === "string" ? note.trim().slice(0, 1000) : "";
    await conversation.update(Id, {
      handed_back_by_id: req.user?.user_id ?? null,
      handed_back_at: new Date(),
      handback_note: clean || null,
    });
    if (conv.state === ConversationState.Pause) {
      await this._ConvRepo.resolveSafetyEvent(Id);
    } else if (conv.state === ConversationState.Escalated) {
      await this._ConvRepo.resolveEscalation(Id);
    }
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  // the sales team (User role) chats with customers too (Full Plan 12.9)
  @Permission("conversations.reply")
  @Post("Conversations/:Id/Reply")
  async Reply(@Param("Id") Id: string, @Body("body") body: string, @Req() req: any) {
    const text = (body ?? "").trim();
    if (!text) throw new BadRequestException("Message body is required");
    const conv = await this._ConvRepo.findById(Id);
    if (!conv) throw new NotFoundException("Conversation not found");
    // STOP wins, even during a takeover: only an open booking may still be discussed
    const cons = await consent.findOne({ where: { customer_id: conv.customer_id } });
    if (cons?.opt_out_at) {
      const open = await booking_request.findOne({
        where: { customer_id: conv.customer_id, booking_status: BookingStatus.PendingConfirmation },
      });
      if (!open) throw new BadRequestException("The customer opted out. Messages are blocked.");
    }
    // logged as the agent's message (plan 12.9), not as the bot
    await this._Wa.send(conv.customer_id, { kind: "text", body: text }, "reply", undefined, {
      sender: "agent",
      actorId: req.user?.user_id,
    });
    return this.SendResponse(ResponseEnum.Success, "Sent");
  }

  // ---- Escalations: tasks for people (Full Plan 12.9). With the CRM on they are worked in the CRM and
  // closed by its task.completed webhook; without it, a person closes them here. ----
  // Full Plan 12.7: urgent cases (emergency, self-harm, urgent complaint / payment) still open, for the console's
  // banner, sound and desktop notification. The full number is shown inside the console only.
  @Permission("tasks.work")
  @Get("UrgentAlerts")
  async UrgentAlerts() {
    const rows = await task
      .createQueryBuilder("t")
      .addSelect("t.created_on")
      .leftJoinAndSelect("t.customer", "customer")
      .leftJoinAndSelect("t.assigned_to", "assigned_to")
      .where("t.priority = :p", { p: TaskPriority.Urgent })
      .andWhere("t.task_status <> :done", { done: TaskStatus.Done })
      .orderBy("t.created_on", "DESC")
      .take(20)
      .getMany();
    return this.SendResponseData(
      rows.map((t: any) => ({
        task_id: t.id,
        type: t.type,
        label: urgentLabel(t.type),
        status: t.task_status,
        handled_by: t.assigned_to ? t.assigned_to.first_name || t.assigned_to.email : null,
        conversation_id: t.conversation_id ?? null,
        customer: t.customer
          ? { first_name: t.customer.first_name ?? null, wa_number: t.customer.wa_number }
          : null,
        created_at: t.created_on,
      })),
    );
  }

  @Permission("tasks.work")
  @Get("Tasks")
  async Tasks(
    @CurrentUser() UserId: string,
    @Query("view") view?: string,
    @Query("q") q?: string,
    @Query("type") type?: string,
    @Query("priority") priority?: string,
    @Query("mine") mine?: string,
  ) {
    const qb = task
      .createQueryBuilder("t")
      .addSelect("t.created_on")
      .leftJoinAndSelect("t.customer", "customer")
      .leftJoinAndSelect("t.assigned_to", "assigned_to");
    if (view === "done") qb.andWhere("t.task_status = 'done'");
    else if (view !== "all") qb.andWhere("t.task_status <> 'done'");
    if (type) qb.andWhere("t.type = :type", { type: type.slice(0, 60) });
    if (priority) qb.andWhere("t.priority = :priority", { priority: priority.slice(0, 20) });
    if (mine === "1") qb.andWhere("t.assigned_to_id = :me", { me: UserId });
    const term = (q ?? "").trim().slice(0, 60);
    const ref = refPrefix(term); // the callback reference the customer has, e.g. CB-498A3BD2
    if (ref) qb.andWhere("REPLACE(t.id::text, '-', '') LIKE :ref", { ref: `${ref}%` });
    else if (term)
      qb.andWhere(
        "(customer.wa_number ILIKE :term OR customer.first_name ILIKE :term OR t.summary ILIKE :term OR t.type ILIKE :term)",
        { term: `%${term}%` },
      );
    const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    // urgent first; inside a priority the task waiting longest comes first (open view), newest first otherwise
    const oldestFirst = view !== "done" && view !== "all";
    const rows = (
      await qb.orderBy("t.created_on", oldestFirst ? "ASC" : "DESC").take(300).getMany()
    ).sort((a, b) =>
      view === "done" || view === "all" ? 0 : (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9),
    );
    // counters over ALL open tasks, not just the rows above
    const [t] = await task.query(
      `SELECT count(*)::int AS open,
              count(*) FILTER (WHERE priority = 'urgent')::int AS urgent,
              count(*) FILTER (WHERE assigned_to_id IS NULL)::int AS unassigned,
              count(*) FILTER (WHERE task_status = 'in_progress')::int AS in_progress,
              count(*) FILTER (WHERE assigned_to_id = $1)::int AS mine
         FROM task WHERE task_status <> 'done'`,
      [UserId],
    );
    return this.SendResponseData({
      crmEnabled: this._Outbox.enabled,
      rows: rows.map((r) => ({ ...r, case_ref: caseRef(r.id) })),
      summary: t,
    });
  }

  @Permission("tasks.work")
  @Put("Tasks/:Id")
  async UpdateTask(
    @Param("Id") Id: string,
    @Body("action") action: string,
    @CurrentUser() UserId: string,
    @Body("outcome") outcome?: string,
  ) {
    if (this._Outbox.enabled)
      throw new BadRequestException("Tasks are worked in the CRM. Its webhook closes them here.");
    const t = await task.findOne({ where: { id: Id } });
    if (!t) throw new NotFoundException("Task not found");
    if (action === "claim") {
      t.assigned_to_id = UserId;
      t.task_status = "in_progress";
      t.updated_on = new Date();
      await t.save();
      await audit({ action: "Claim", table: "task", recordId: Id, userId: UserId, details: { type: t.type } });
    } else if (action === "done") {
      await this._CrmEvents.completeTaskFromConsole(Id, String(outcome ?? "").trim().slice(0, 500) || undefined); // also lifts PAUSE / ESCALATED on the chat
      await audit({
        action: "Done",
        table: "task",
        recordId: Id,
        userId: UserId,
        details: { type: t.type, outcome: String(outcome ?? "").trim().slice(0, 500) || null },
      });
    } else throw new BadRequestException("action must be claim or done");
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  // ---- Activations: links sent and payments (Full Plan 12.5). Paid / failed comes from the CRM's
  // activation.paid / activation.failed webhooks; without the CRM an admin records it here. ----
  @Permission("activations.read")
  @Get("Activations")
  async Activations(@Query("status") status?: string, @Query("q") q?: string) {
    const qb = activation
      .createQueryBuilder("a")
      .addSelect("a.created_on")
      .leftJoinAndSelect("a.customer", "customer")
      .leftJoinAndSelect("a.catalog", "catalog");
    if (status && ["pending", "paid", "failed", "cancelled"].includes(status))
      qb.andWhere("a.payment_status = :status", { status });
    const term = (q ?? "").trim().slice(0, 60);
    if (term)
      qb.andWhere(
        "(customer.wa_number ILIKE :term OR customer.first_name ILIKE :term OR a.plan ILIKE :term OR a.product ILIKE :term)",
        { term: `%${term}%` },
      );
    const rows = await qb.orderBy("a.created_on", "DESC").take(300).getMany();
    // totals over ALL activations (not just the rows above), so the tiles stay right past 300 rows.
    // The price and GST rate saved when the link was sent win over today's catalogue price.
    const [t] = await activation.query(
      `SELECT count(*) FILTER (WHERE a.activation_status = 'active')::int AS active,
              count(*) FILTER (WHERE a.payment_status = 'pending')::int AS unpaid,
              count(*) FILTER (WHERE a.payment_status = 'failed')::int AS failed,
              count(*)::int AS total,
              COALESCE(sum(COALESCE(a.price, c.price)) FILTER (WHERE a.payment_status = 'paid'), 0)::float AS collected_net,
              COALESCE(sum(COALESCE(a.price, c.price) * (1 + COALESCE(a.gst_rate, c.gst_rate, 0)))
                FILTER (WHERE a.payment_status = 'paid'), 0)::float AS collected_gross
         FROM activation a LEFT JOIN plan_catalog c ON c.id = a.catalog_id`,
    );
    return this.SendResponseData({ crmEnabled: this._Outbox.enabled, rows, summary: t });
  }

  @Permission("activations.record")
  @Put("Activations/:Id")
  async UpdateActivation(
    @Param("Id") Id: string,
    @Body("result") result: string,
    @CurrentUser() UserId: string,
  ) {
    if (this._Outbox.enabled)
      throw new BadRequestException(
        "Payments are verified in the CRM. Its webhook updates this list.",
      );
    if (result !== "paid" && result !== "failed")
      throw new BadRequestException("result must be paid or failed");
    const a = await activation.findOne({ where: { id: Id } });
    if (!a) throw new NotFoundException("Activation not found");
    await this._CrmEvents.markActivationFromConsole(Id, result === "paid");
    await audit({
      action: result === "paid" ? "Payment recorded: paid" : "Payment recorded: failed",
      table: "activation",
      recordId: Id,
      userId: UserId,
      details: { product: a.product, plan: a.plan, billing: a.billing },
    });
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  @Permission("plans.read")
  @Get("PlanCatalog")
  async PlanCatalog() {
    const rows = await plan_catalog.find({
      where: { status: true },
      order: { product: "ASC", price: "ASC" } as any,
    });
    return this.SendResponseData(rows);
  }

  @Permission("centres.read")
  @Get("Centres")
  async Centres(
    @Query("q") q?: string,
    @Query("city") city?: string,
    @Query("type") type?: string,
    @Query("spec") spec?: string,
    @Query("state") state?: string,
    @Query("page") page?: string,
  ) {
    const PAGE = 50;
    const skip = Math.max(0, Math.min(2000, parseInt(String(page ?? "0"), 10) || 0)) * PAGE;
    const qb = centre.createQueryBuilder("c").where("c.status = true");
    if (city) qb.andWhere("c.city = :city", { city: city.slice(0, 80) });
    if (type) qb.andWhere("c.centre_type = :type", { type: type.slice(0, 40) });
    if (spec) qb.andWhere("c.specialisations ILIKE :spec", { spec: `%${spec.slice(0, 40)}%` });
    // a centre is "live" (suggested by the bot) only when active AND verified AND private
    if (state === "live") qb.andWhere("c.active AND c.verified AND c.is_private");
    else if (state === "hidden") qb.andWhere("NOT (c.active AND c.verified AND c.is_private)");
    else if (state === "stale")
      qb.andWhere("c.verified_at IS NULL OR c.verified_at < (CURRENT_DATE - 180)");
    else if (state === "nopoint") qb.andWhere("c.latitude = 0 AND c.longitude = 0");
    const term = (q ?? "").trim().slice(0, 60);
    if (term)
      qb.andWhere(
        "(c.name ILIKE :term OR c.branch ILIKE :term OR c.locality ILIKE :term OR c.city ILIKE :term OR c.phone ILIKE :term)",
        { term: `%${term}%` },
      );
    const [rows, total] = await qb
      .orderBy("c.city", "ASC")
      .addOrderBy("c.name", "ASC")
      .skip(skip)
      .take(PAGE)
      .getManyAndCount();
    // counters and the filter lists over ALL centres, whatever the filter or page
    const [t] = await centre.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE active AND verified AND is_private)::int AS live,
              count(*) FILTER (WHERE NOT (active AND verified AND is_private))::int AS hidden,
              count(*) FILTER (WHERE verified_at IS NULL OR verified_at < (CURRENT_DATE - 180))::int AS stale,
              count(*) FILTER (WHERE latitude = 0 AND longitude = 0)::int AS no_point
         FROM centre WHERE status = true`,
    );
    const cities = await centre.query(
      `SELECT DISTINCT city FROM centre WHERE status = true AND city IS NOT NULL ORDER BY city`,
    );
    return this.SendResponseData({
      rows,
      total,
      page_size: PAGE,
      summary: t,
      cities: cities.map((x: { city: string }) => x.city),
    });
  }

  /** Every centre (not paged) in the CSV import's own column set, for Export and edit-in-Excel */
  @Permission("centres.read")
  @Get("Centres/Export")
  async ExportCentres() {
    const rows = await centre.find({
      where: { status: true },
      order: { city: "ASC", name: "ASC" } as any,
      take: 10000,
    });
    return this.SendResponseData(rows);
  }

  /** Hide, show, verify or delete many centres at once (ids from the console's selection) */
  @Permission("centres.edit")
  @Post("Centres/Bulk")
  async BulkCentres(
    @Body("ids") ids: string[],
    @Body("action") action: string,
    @CurrentUser() UserId: string,
  ) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500)
      throw new BadRequestException("Choose between 1 and 500 centres");
    if (!ids.every((i) => UUID.test(String(i)))) throw new BadRequestException("Invalid centre id");
    if (!["hide", "show", "verify", "delete"].includes(action))
      throw new BadRequestException("action must be hide, show, verify or delete");
    const where = { id: In(ids), status: true } as any;
    let patch: Record<string, unknown>;
    if (action === "hide") patch = { active: false };
    else if (action === "show") patch = { active: true };
    else if (action === "verify")
      patch = { verified: true, verified_at: new Date().toISOString().slice(0, 10) };
    else patch = { status: false, active: false }; // soft delete: bookings keep their centre
    const res = await centre.update(where, patch as any);
    await audit({
      action: "Bulk " + action,
      table: "centre",
      recordId: `${ids.length} centres`,
      userId: UserId,
      details: { ids, updated: res.affected ?? 0 },
    });
    return this.SendResponseData({ updated: res.affected ?? 0 });
  }

  @Permission("audit.read")
  @Get("AuditLogs")
  async AuditLogs(
    @Query("action") action?: string,
    @Query("table") table?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
  ) {
    const PAGE = 50;
    const skip = Math.max(0, Math.min(2000, parseInt(String(page ?? "0"), 10) || 0)) * PAGE;
    const qb = audit_log.createQueryBuilder("a");
    if (action) qb.andWhere("a.performed_action ILIKE :action", { action: `%${action.slice(0, 40)}%` });
    if (table) qb.andWhere("a.performed_module_name ILIKE :table", { table: `%${table.slice(0, 40)}%` });
    const term = (q ?? "").trim().slice(0, 60);
    if (term)
      qb.andWhere("(a.performed_by ILIKE :term OR a.performed_module_id ILIKE :term)", { term: `%${term}%` });
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (from && day.test(from)) qb.andWhere("a.created_on >= CAST(:from AS date)", { from });
    if (to && day.test(to)) qb.andWhere("a.created_on < (CAST(:to AS date) + 1)", { to });
    const [rows, total] = await qb
      .orderBy("a.created_on", "DESC")
      .skip(skip)
      .take(PAGE)
      .getManyAndCount();
    const tables = await audit_log.query(
      `SELECT DISTINCT performed_module_name AS t FROM audit_log ORDER BY 1`,
    );
    return this.SendResponseData({
      rows: rows.map((r) => ({
        id: r.id,
        created_on: r.created_on,
        action: r.performed_action,
        table_name: r.performed_module_name,
        record_id: r.performed_module_id,
        user_id: r.performed_by_id === "system" ? null : r.performed_by_id,
        user_name: r.performed_by,
        details: scrub(r.performed_parameter),
      })),
      total,
      page_size: PAGE,
      tables: tables.map((x: { t: string }) => x.t),
    });
  }

  /**
   * Reports page, for a chosen period (default: the last 30 days): activity per day, bookings per centre,
   * and how the team is doing. The per-person table is for Admin and Super Admin only.
   */
  @Permission("dashboard.view")
  @Get("ReportDetail")
  async ReportDetail(
    @CurrentUser() UserId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const end = ok(to) ? to! : istDay(new Date());
    let start = ok(from) ? from! : istDay(new Date(Date.now() - 29 * 86_400_000));
    // at most 92 days of daily rows
    if (Date.parse(end) - Date.parse(start) > 91 * 86_400_000)
      start = istDay(new Date(Date.parse(end) - 91 * 86_400_000));
    if (start > end) throw new BadRequestException("From must not be after To");
    const p = [start, end];
    const inRange = (col: string) => `${col} >= $1::date AND ${col} < ($2::date + 1)`;

    const daily = await conversation.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS date,
              (SELECT count(*) FROM conversation x WHERE x.created_on::date = d::date)::int AS conversations,
              (SELECT count(*) FROM booking_request x WHERE x.created_on::date = d::date)::int AS bookings,
              (SELECT count(*) FROM activation x WHERE x.created_on::date = d::date)::int AS activations
         FROM generate_series($1::date, $2::date, interval '1 day') d
        ORDER BY d`,
      p,
    );
    const centres = await conversation.query(
      `SELECT c.name, c.branch, c.city, count(*)::int AS bookings,
              count(*) FILTER (WHERE b.booking_status = 'confirmed')::int AS confirmed,
              round((avg(extract(epoch FROM (b.updated_on - b.created_on)) / 3600)
                FILTER (WHERE b.booking_status = 'confirmed' AND b.updated_on IS NOT NULL))::numeric, 1)::float AS avg_confirm_hours
         FROM booking_request b JOIN centre c ON c.id = b.centre_id
        WHERE ${inRange("b.created_on")}
        GROUP BY c.id ORDER BY bookings DESC, c.name LIMIT 15`,
      p,
    );
    const me = await user.findOne({ where: { id: UserId }, relations: { user_role: true } } as any);
    const roleName = (me as any)?.user_role?.name;
    const isAdmin = roleName === RoleEnum.Admin || roleName === RoleEnum.SuperAdmin;
    const people = isAdmin
      ? await conversation.query(
          `SELECT COALESCE(NULLIF(trim(concat(u.first_name, ' ', u.last_name)), ''), u.email) AS name,
                  count(*)::int AS claimed,
                  count(*) FILTER (WHERE t.task_status = 'done')::int AS closed,
                  round((avg(extract(epoch FROM (t.updated_on - t.created_on)) / 3600)
                    FILTER (WHERE t.task_status = 'done' AND t.updated_on IS NOT NULL))::numeric, 1)::float AS avg_hours
             FROM task t JOIN "user" u ON u.id = t.assigned_to_id
            WHERE ${inRange("t.created_on")}
            GROUP BY u.id ORDER BY closed DESC, name LIMIT 20`,
          p,
        )
      : null;
    return this.SendResponseData({ range: { from: start, to: end }, daily, centres, people });
  }

  /** Daily counts for the dashboard's 7-day chart (India-time days, oldest first) */
  @Permission("dashboard.view")
  @Get("Trend")
  async Trend() {
    const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(istDay(new Date(Date.now() - i * 86_400_000)));
    const ist = new Date(Date.now() + 5.5 * 3600_000);
    const since = new Date(
      Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - 6) - 5.5 * 3600_000,
    );
    const count = async (table: string) => {
      const rows: { created_on: Date }[] = await conversation.query(
        `SELECT created_on FROM ${table} WHERE created_on >= $1`,
        [since],
      );
      const by: Record<string, number> = {};
      for (const r of rows) {
        const k = istDay(new Date(r.created_on));
        by[k] = (by[k] ?? 0) + 1;
      }
      return by;
    };
    const [c, b, a] = await Promise.all([
      count("conversation"),
      count("booking_request"),
      count("activation"),
    ]);
    return this.SendResponseData(
      days.map((date) => ({
        date,
        conversations: c[date] ?? 0,
        bookings: b[date] ?? 0,
        activations: a[date] ?? 0,
      })),
    );
  }

  @Permission("dashboard.view")
  @Get("Reports")
  async Reports() {
    // "today" means today in India time (UTC+5:30), whatever the server's clock zone is
    const ist = new Date(Date.now() + 5.5 * 3600_000);
    const startOfIstDay = new Date(
      Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000,
    );
    const [
      totalConversations,
      pausedOrEscalated,
      optedOut,
      pendingBookings,
      confirmedBookings,
      deadOutbox,
      triggersFired,
      conversationsToday,
      bookingsToday,
      activationsToday,
    ] = await Promise.all([
      conversation.count(),
      conversation.count({
        where: [{ state: ConversationState.Pause }, { state: ConversationState.Escalated }],
      }),
      conversation.count({ where: { state: ConversationState.OptedOut } }),
      booking_request.count({ where: { booking_status: BookingStatus.PendingConfirmation } }),
      booking_request.count({ where: { booking_status: BookingStatus.Confirmed } }),
      crm_outbox.count({ where: { sync_status: CrmSyncStatus.Dead } }),
      trigger_event.count(),
      conversation.count({ where: { created_on: MoreThanOrEqual(startOfIstDay) } }),
      booking_request.count({ where: { created_on: MoreThanOrEqual(startOfIstDay) } }),
      activation.count({ where: { created_on: MoreThanOrEqual(startOfIstDay) } }),
    ]);
    return this.SendResponseData({
      totalConversations,
      pausedOrEscalated,
      optedOut,
      pendingBookings,
      confirmedBookings,
      deadOutbox,
      triggersFired,
      conversationsToday,
      bookingsToday,
      activationsToday,
    });
  }

  @Permission("triggers.read")
  @Get("Triggers")
  async Triggers() {
    const events = await trigger_event.find({
      relations: ["customer"],
      order: { id: "DESC" } as any,
      take: 100,
    });
    return this.SendResponseData({ catalog: TRIGGER_CATALOG, events });
  }

  @Permission("privacy.handle")
  @Get("PrivacyRequests")
  async PrivacyRequests() {
    const rows = await consent
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.customer", "customer")
      .where("c.privacy_request_at IS NOT NULL")
      .orderBy("c.privacy_request_at", "DESC")
      .limit(100)
      .getMany();
    return this.SendResponseData(rows);
  }

  // ---- centre directory: add / edit / remove (Full Plan 12.4: only verified, private, active centres are suggested) ----
  private centreFields(r: any) {
    const name = String(r?.name ?? "").trim();
    const city = String(r?.city ?? "").trim();
    if (!name || !city) throw new BadRequestException("Name and city are required");
    const lat = Number(r.latitude),
      lon = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      throw new BadRequestException("Latitude and longitude must be valid numbers");
    if (r.is_private === false && r.active !== false)
      throw new BadRequestException(
        "Government (non-private) centres are never suggested. Untick active.",
      );
    const specs = Array.isArray(r.specialisations)
      ? r.specialisations
      : String(r.specialisations ?? "").split(/[|,]/);
    return {
      name,
      city,
      branch: r.branch ? String(r.branch).trim() : null,
      locality: r.locality ? String(r.locality).trim() : null,
      address: r.address ? String(r.address).trim().slice(0, 300) : null,
      phone: r.phone ? String(r.phone).trim().slice(0, 30) : null,
      opening_hours: r.opening_hours ? String(r.opening_hours).trim().slice(0, 200) : null,
      latitude: lat,
      longitude: lon,
      centre_type: r.centre_type ? String(r.centre_type) : "clinic",
      specialisations: specs.map((x: string) => String(x).trim().toLowerCase()).filter(Boolean),
      is_private: r.is_private !== false,
      verified: r.verified !== false,
      verified_at:
        r.verified !== false ? r.verified_at || new Date().toISOString().slice(0, 10) : null,
      active: r.active !== false,
    };
  }

  @Permission("centres.edit")
  @Post("Centres")
  async CreateCentre(@Body() body: any, @CurrentUser() UserId: string) {
    const fields = this.centreFields(await this.fillPoint(body));
    // the CSV import updates a centre with the same name + branch + city; the form refuses the duplicate
    const dup = await centre.findOne({
      where: { name: fields.name, branch: fields.branch ?? (IsNull() as any), city: fields.city, status: true } as any,
    });
    if (dup)
      throw new BadRequestException(
        "A centre with this name, branch and city already exists. Edit that one instead.",
      );
    const row = await centre.save(centre.create(fields as any));
    await audit({ action: "Insert", table: "centre", recordId: row.id, userId: UserId, details: fields });
    return this.SendResponseData(row);
  }

  @Permission("centres.edit")
  @Put("Centres/:Id")
  async UpdateCentre(@Param("Id") Id: string, @Body() body: any, @CurrentUser() UserId: string) {
    const row = await centre.findOne({ where: { id: Id, status: true } });
    if (!row) throw new NotFoundException("Centre not found");
    const before = { ...row } as Record<string, any>;
    const fields = this.centreFields(await this.fillPoint(body));
    Object.assign(row, fields);
    await row.save();
    await audit({
      action: "Update",
      table: "centre",
      recordId: row.id,
      userId: UserId,
      details: { name: row.name, changed: changes(before, fields) },
    });
    return this.SendResponseData(row);
  }

  // soft delete: existing booking requests keep their centre
  @Permission("centres.edit")
  @Delete("Centres/:Id")
  async DeleteCentre(@Param("Id") Id: string, @CurrentUser() UserId: string) {
    const row = await centre.findOne({ where: { id: Id, status: true } });
    if (!row) throw new NotFoundException("Centre not found");
    row.status = false;
    row.active = false;
    await row.save();
    await audit({
      action: "Delete",
      table: "centre",
      recordId: row.id,
      userId: UserId,
      details: { name: row.name, branch: row.branch, city: row.city },
    });
    return this.SendResponse(ResponseEnum.Success, "Deleted");
  }

  @Permission("centres.edit")
  @Post("Centres/Import")
  async ImportCentres(@Body("rows") rows: any[], @CurrentUser() UserId: string) {
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException("rows array is required");
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const r of rows) {
      if (!r?.name || !r?.city) {
        skipped++;
        continue;
      }
      const fields = importedCentre(await this.fillPoint(r));
      // same name + branch + city = the same centre: update it instead of a duplicate
      const existing = await centre.findOne({
        where: {
          name: fields.name,
          branch: fields.branch ?? (IsNull() as any),
          city: fields.city,
          status: true,
        } as any,
      });
      if (existing) {
        Object.assign(existing, fields);
        await existing.save();
        updated++;
      } else {
        await centre.save(centre.create(fields as any));
        created++;
      }
    }
    await audit({
      action: "Import",
      table: "centre",
      recordId: "csv import",
      userId: UserId,
      details: { rows: rows.length, created, updated, skipped },
    });
    return this.SendResponseData({ created, updated, skipped });
  }

  @Permission("settings.manage")
  @Get("Settings")
  GetSettings() {
    return this.SendResponseData(this._SystemConfig.getSettings());
  }

  @Permission("settings.manage")
  @Put("Settings")
  async UpdateSettings(
    @Body("values") values: Record<string, string | boolean>,
    @CurrentUser() UserId: string,
  ) {
    if (!values || typeof values !== "object") {
      throw new BadRequestException("values object is required");
    }
    const res = await this._SystemConfig.updateSettings(values);
    // only the names of the settings that were saved, never their values (they can hold keys and tokens)
    await audit({
      action: "Update",
      table: "settings",
      recordId: "system settings",
      userId: UserId,
      details: { saved: Object.keys(values) },
    });
    return this.SendResponseData(res);
  }
}
