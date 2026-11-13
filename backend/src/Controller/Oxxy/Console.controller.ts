import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Roles } from "@Helper/Roles.decorator";
import { RoleEnum } from "@Helper/Enum/RoleEnum";
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

@Controller({ path: "Console", version: "1" })
@ApiTags("Sales Console")
export class ConsoleController extends JWTAuthController {
  constructor(
    private readonly _ConvRepo: ConversationRepository,
    private readonly _Wa: WhatsappClient,
    private readonly _SystemConfig: SystemConfigService,
  ) {
    super();
  }

  @Get("Conversations")
  async Conversations() {
    const rows = await conversation
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.customer", "customer")
      .orderBy("c.last_customer_message_at", "DESC", "NULLS LAST")
      .limit(100)
      .getMany();
    return this.SendResponseData(rows);
  }

  @Get("Conversations/:Id/Messages")
  async Messages(@Param("Id") Id: string) {
    const rows = await message.find({
      where: { conversation_id: Id },
      order: { created_on: "ASC" } as any,
      take: 200,
    });
    return this.SendResponseData(rows);
  }

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Post("Conversations/:Id/TakeOver")
  async TakeOver(@Param("Id") Id: string) {
    const conv = await this._ConvRepo.findById(Id);
    if (!conv) throw new NotFoundException("Conversation not found");
    if (conv.state !== ConversationState.Pause && conv.state !== ConversationState.Escalated) {
      await this._ConvRepo.transition(Id, ConversationState.Pause, { reason: "agent take over" });
    }
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Post("Conversations/:Id/HandBack")
  async HandBack(@Param("Id") Id: string) {
    const conv = await this._ConvRepo.findById(Id);
    if (!conv) throw new NotFoundException("Conversation not found");
    if (conv.state === ConversationState.Pause) {
      await this._ConvRepo.resolveSafetyEvent(Id);
    } else if (conv.state === ConversationState.Escalated) {
      await this._ConvRepo.resolveEscalation(Id);
    }
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Post("Conversations/:Id/Reply")
  async Reply(@Param("Id") Id: string, @Body("body") body: string) {
    const text = (body ?? "").trim();
    if (!text) throw new BadRequestException("Message body is required");
    const conv = await this._ConvRepo.findById(Id);
    if (!conv) throw new NotFoundException("Conversation not found");
    await this._Wa.send(conv.customer_id, { kind: "text", body: text }, "reply");
    return this.SendResponse(ResponseEnum.Success, "Sent");
  }

  @Get("PlanCatalog")
  async PlanCatalog() {
    const rows = await plan_catalog.find({
      where: { status: true },
      order: { product: "ASC", price: "ASC" } as any,
    });
    return this.SendResponseData(rows);
  }

  @Get("Centres")
  async Centres() {
    const rows = await centre.find({
      where: { status: true },
      order: { city: "ASC", name: "ASC" } as any,
      take: 200,
    });
    return this.SendResponseData(rows);
  }

  @Roles(RoleEnum.SuperAdmin)
  @Get("AuditLogs")
  async AuditLogs(@Query("action") action?: string, @Query("table") table?: string) {
    const qb = audit_log.createQueryBuilder("a").orderBy("a.created_on", "DESC").take(100);
    if (action) qb.andWhere("a.action ILIKE :action", { action: `%${action}%` });
    if (table) qb.andWhere("a.table_name ILIKE :table", { table: `%${table}%` });
    return this.SendResponseData(await qb.getMany());
  }

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
      conversation.count({ where: [{ state: ConversationState.Pause }, { state: ConversationState.Escalated }] }),
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

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Get("Triggers")
  async Triggers() {
    const events = await trigger_event.find({
      relations: ["customer"],
      order: { id: "DESC" } as any,
      take: 100,
    });
    return this.SendResponseData({ catalog: TRIGGER_CATALOG, events });
  }

  @Roles(RoleEnum.SuperAdmin)
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

  @Roles(RoleEnum.SuperAdmin, RoleEnum.Admin)
  @Post("Centres/Import")
  async ImportCentres(@Body("rows") rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException("rows array is required");
    let created = 0;
    for (const r of rows) {
      if (!r?.name || !r?.city) continue;
      await centre.save(
        centre.create({
          name: String(r.name),
          branch: r.branch ? String(r.branch) : null,
          locality: r.locality ? String(r.locality) : null,
          city: String(r.city),
          latitude: Number(r.latitude ?? 0),
          longitude: Number(r.longitude ?? 0),
          centre_type: r.centre_type ? String(r.centre_type) : "multispeciality",
          specialisations: Array.isArray(r.specialisations)
            ? r.specialisations
            : String(r.specialisations ?? "")
                .split("|")
                .map((x: string) => x.trim())
                .filter(Boolean),
          verified: r.verified !== false,
          active: true,
        } as any),
      );
      created++;
    }
    return this.SendResponseData({ created });
  }

  @Roles(RoleEnum.SuperAdmin)
  @Get("Settings")
  GetSettings() {
    return this.SendResponseData(this._SystemConfig.getSettings());
  }

  @Roles(RoleEnum.SuperAdmin)
  @Put("Settings")
  async UpdateSettings(@Body("values") values: Record<string, string | boolean>) {
    if (!values || typeof values !== "object") {
      throw new BadRequestException("values object is required");
    }
    const res = await this._SystemConfig.updateSettings(values);
    return this.SendResponseData(res);
  }
}

