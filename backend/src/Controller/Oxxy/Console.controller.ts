import { Permission } from "@Helper/Permissions";
import {
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
import { IsNull } from "typeorm";

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
  ) {
    super();
  }

  @Permission("conversations.read")
  @Get("Conversations")
  async Conversations(
    @Query("q") q?: string,
    @Query("view") view?: string,
    @Query("limit") limit?: string,
  ) {
    // Inbox list: search and tab filter run in the database, so a customer beyond the newest page is still found
    const qb = conversation.createQueryBuilder("c").leftJoinAndSelect("c.customer", "customer");
    const states = VIEW_STATES[view ?? ""];
    if (states) qb.andWhere("c.state IN (:...states)", { states });
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

  @Permission("conversations.read")
  @Get("Conversations/:Id/Messages")
  async Messages(@Param("Id") Id: string, @Query("before") before?: string) {
    // the NEWEST messages (oldest first on screen); "before" pages back to older ones
    const qb = message
      .createQueryBuilder("m")
      .addSelect("m.created_on")
      .where("m.conversation_id = :Id", { Id });
    const until = before ? new Date(before) : null;
    if (until && !isNaN(until.getTime())) qb.andWhere("m.created_on < :until", { until });
    const rows = await qb
      .orderBy("m.created_on", "DESC")
      .addOrderBy("m.id", "DESC")
      .take(MESSAGE_PAGE)
      .getMany();
    return this.SendResponseData(rows.reverse());
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
  @Permission("tasks.work")
  @Get("Tasks")
  async Tasks(@Query("view") view?: string) {
    const q = task
      .createQueryBuilder("t")
      .addSelect("t.created_on")
      .leftJoinAndSelect("t.customer", "customer")
      .leftJoinAndSelect("t.assigned_to", "assigned_to");
    if (view === "done") q.where("t.task_status = 'done'");
    else if (view !== "all") q.where("t.task_status <> 'done'");
    const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const rows = (await q.orderBy("t.created_on", "DESC").take(300).getMany()).sort(
      (a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9), // urgent first, newest first within each
    );
    return this.SendResponseData({ crmEnabled: this._Outbox.enabled, rows });
  }

  @Permission("tasks.work")
  @Put("Tasks/:Id")
  async UpdateTask(
    @Param("Id") Id: string,
    @Body("action") action: string,
    @CurrentUser() UserId: string,
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
    } else if (action === "done") {
      await this._CrmEvents.completeTaskFromConsole(Id); // also lifts PAUSE / ESCALATED on the chat
    } else throw new BadRequestException("action must be claim or done");
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  // ---- Activations: links sent and payments (Full Plan 12.5). Paid / failed comes from the CRM's
  // activation.paid / activation.failed webhooks; without the CRM an admin records it here. ----
  @Permission("activations.read")
  @Get("Activations")
  async Activations() {
    const rows = await activation
      .createQueryBuilder("a")
      .addSelect("a.created_on")
      .leftJoinAndSelect("a.customer", "customer")
      .leftJoinAndSelect("a.catalog", "catalog")
      .orderBy("a.created_on", "DESC")
      .take(300)
      .getMany();
    return this.SendResponseData({ crmEnabled: this._Outbox.enabled, rows });
  }

  @Permission("activations.record")
  @Put("Activations/:Id")
  async UpdateActivation(@Param("Id") Id: string, @Body("result") result: string) {
    if (this._Outbox.enabled)
      throw new BadRequestException(
        "Payments are verified in the CRM. Its webhook updates this list.",
      );
    if (result !== "paid" && result !== "failed")
      throw new BadRequestException("result must be paid or failed");
    const a = await activation.findOne({ where: { id: Id } });
    if (!a) throw new NotFoundException("Activation not found");
    await this._CrmEvents.markActivationFromConsole(Id, result === "paid");
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
  async Centres() {
    const rows = await centre.find({
      where: { status: true },
      order: { city: "ASC", name: "ASC" } as any,
      take: 200,
    });
    return this.SendResponseData(rows);
  }

  @Permission("audit.read")
  @Get("AuditLogs")
  async AuditLogs(@Query("action") action?: string, @Query("table") table?: string) {
    const qb = audit_log.createQueryBuilder("a").orderBy("a.created_on", "DESC").take(100);
    if (action) qb.andWhere("a.action ILIKE :action", { action: `%${action}%` });
    if (table) qb.andWhere("a.table_name ILIKE :table", { table: `%${table}%` });
    return this.SendResponseData(await qb.getMany());
  }

  @Permission("dashboard.view")
  @Get("Reports")
  async Reports() {
    const [
      totalConversations,
      pausedOrEscalated,
      optedOut,
      pendingBookings,
      confirmedBookings,
      deadOutbox,
      triggersFired,
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
    ]);
    return this.SendResponseData({
      totalConversations,
      pausedOrEscalated,
      optedOut,
      pendingBookings,
      confirmedBookings,
      deadOutbox,
      triggersFired,
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
  async CreateCentre(@Body() body: any) {
    const row = await centre.save(centre.create(this.centreFields(body) as any));
    return this.SendResponseData(row);
  }

  @Permission("centres.edit")
  @Put("Centres/:Id")
  async UpdateCentre(@Param("Id") Id: string, @Body() body: any) {
    const row = await centre.findOne({ where: { id: Id, status: true } });
    if (!row) throw new NotFoundException("Centre not found");
    Object.assign(row, this.centreFields(body));
    await row.save();
    return this.SendResponseData(row);
  }

  // soft delete: existing booking requests keep their centre
  @Permission("centres.edit")
  @Delete("Centres/:Id")
  async DeleteCentre(@Param("Id") Id: string) {
    const row = await centre.findOne({ where: { id: Id, status: true } });
    if (!row) throw new NotFoundException("Centre not found");
    row.status = false;
    row.active = false;
    await row.save();
    return this.SendResponse(ResponseEnum.Success, "Deleted");
  }

  @Permission("centres.edit")
  @Post("Centres/Import")
  async ImportCentres(@Body("rows") rows: any[]) {
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
      const fields = importedCentre(r);
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
    return this.SendResponseData({ created, updated, skipped });
  }

  @Permission("settings.manage")
  @Get("Settings")
  GetSettings() {
    return this.SendResponseData(this._SystemConfig.getSettings());
  }

  @Permission("settings.manage")
  @Put("Settings")
  async UpdateSettings(@Body("values") values: Record<string, string | boolean>) {
    if (!values || typeof values !== "object") {
      throw new BadRequestException("values object is required");
    }
    const res = await this._SystemConfig.updateSettings(values);
    return this.SendResponseData(res);
  }
}
