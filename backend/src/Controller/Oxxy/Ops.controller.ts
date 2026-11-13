import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { In } from "typeorm";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Permission } from "@Helper/Permissions";
import { CurrentUser } from "@Helper/Common.helper";
import { follow_up } from "@Database/Table/Oxxy/follow_up";
import { job_run } from "@Database/Table/Oxxy/job_run";
import { task } from "@Database/Table/Oxxy/task";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { TaskType } from "@Helper/Enum/TaskType";
import { CrmReconciliationService } from "@Service/Ops/CrmReconciliation.service";
import { RetentionService, retentionDays } from "@Service/Ops/Retention.service";
import { PlanChangeService } from "@Service/Ops/PlanChange.service";
import { TemplatesService } from "@Service/Ops/Templates.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: string) => {
  if (!UUID.test(v || "")) throw new BadRequestException("Invalid id");
  return v;
};

// Console screens for operations: follow-ups, WhatsApp templates, two-person plan changes, and the
// nightly jobs (CRM reconciliation, data retention).
@Controller({ path: "Console", version: "1" })
@ApiTags("Sales Console")
export class OpsController extends JWTAuthController {
  constructor(
    private readonly _Reconcile: CrmReconciliationService,
    private readonly _Retention: RetentionService,
    private readonly _Plans: PlanChangeService,
    private readonly _Templates: TemplatesService,
  ) {
    super();
  }

  // ---- Follow-ups (agreed follow-ups, rescues, Trigger Q, booking updates) ----
  @Permission("conversations.read")
  @Get("FollowUps")
  async FollowUps(@Query("status") status?: string) {
    const st = ["scheduled", "sent", "cancelled", "skipped"].includes(String(status)) ? String(status) : "scheduled";
    const rows = await follow_up
      .createQueryBuilder("f")
      .addSelect("f.created_on")
      .leftJoin("f.customer", "c")
      .addSelect(["c.id", "c.first_name", "c.wa_number"])
      .where("f.follow_up_status = :st", { st })
      .orderBy("f.scheduled_for", st === "scheduled" ? "ASC" : "DESC")
      .take(200)
      .getMany();
    return this.SendResponseData(rows);
  }

  @Permission("conversations.reply")
  @Post("FollowUps/:Id/Cancel")
  async CancelFollowUp(@Param("Id") Id: string, @CurrentUser() UserId: string) {
    const row = await follow_up.findOne({ where: { id: id(Id) } });
    if (!row) throw new NotFoundException("Follow-up not found");
    if (row.follow_up_status !== "scheduled") throw new BadRequestException(`It is already ${row.follow_up_status}`);
    // the BullMQ alarm still fires, finds the row cancelled and does nothing
    await follow_up.update(row.id, {
      follow_up_status: "cancelled",
      skip_reason: "cancelled_by_team",
      updated_by_id: UserId,
      updated_on: new Date(),
    } as any);
    return this.SendResponseData({ id: row.id, follow_up_status: "cancelled" });
  }

  // ---- WhatsApp templates ----
  @Permission("triggers.read")
  @Get("Templates")
  async Templates() {
    return this.SendResponseData(await this._Templates.list());
  }

  @Permission("settings.manage")
  @Put("Templates/:Id")
  async UpdateTemplate(@Param("Id") Id: string, @Body() body: { meta_status?: string; note?: string }, @CurrentUser() UserId: string) {
    return this.SendResponseData(await this._Templates.update(id(Id), body ?? {}, UserId));
  }

  @Permission("settings.manage")
  @Post("Templates/Sync")
  async SyncTemplates() {
    return this.SendResponseData(await this._Templates.syncFromMeta());
  }

  // ---- Plan catalogue: two-person rule ----
  @Permission("plans.read")
  @Get("PlanChanges")
  async PlanChanges() {
    return this.SendResponseData(await this._Plans.list());
  }

  @Permission("plans.edit")
  @Post("PlanChanges")
  async ProposePlanChange(
    @Body() body: { catalog_id?: string; changes?: Record<string, unknown>; reason?: string },
    @CurrentUser() UserId: string,
  ) {
    return this.SendResponseData(
      await this._Plans.propose(id(String(body?.catalog_id ?? "")), body?.changes ?? {}, String(body?.reason ?? ""), UserId),
    );
  }

  @Permission("plans.approve")
  @Post("PlanChanges/:Id/Approve")
  async ApprovePlanChange(@Param("Id") Id: string, @Body("note") note: string, @CurrentUser() UserId: string) {
    return this.SendResponseData(await this._Plans.approve(id(Id), UserId, note));
  }

  @Permission("plans.approve")
  @Post("PlanChanges/:Id/Reject")
  async RejectPlanChange(@Param("Id") Id: string, @Body("note") note: string, @CurrentUser() UserId: string) {
    return this.SendResponseData(await this._Plans.reject(id(Id), UserId, note));
  }

  @Permission("plans.edit")
  @Post("PlanChanges/:Id/Withdraw")
  async WithdrawPlanChange(@Param("Id") Id: string, @CurrentUser() UserId: string) {
    return this.SendResponseData(await this._Plans.withdraw(id(Id), UserId));
  }

  // ---- Nightly jobs ----
  private async lastRuns(kind: string) {
    return await job_run.find({ where: { kind }, order: { started_at: "DESC" } as any, take: 10 });
  }

  @Permission("crm.manage")
  @Get("Jobs/Reconciliation")
  async Reconciliation() {
    return this.SendResponseData(await this.lastRuns("crm_reconciliation"));
  }

  @Permission("crm.manage")
  @Post("Jobs/Reconciliation/Run")
  async RunReconciliation(@CurrentUser() UserId: string) {
    return this.SendResponseData(await this._Reconcile.run(UserId));
  }

  @Permission("privacy.handle")
  @Get("Jobs/Retention")
  async Retention() {
    return this.SendResponseData({ days: retentionDays(), runs: await this.lastRuns("data_retention") });
  }

  @Permission("privacy.handle")
  @Post("Jobs/Retention/Run")
  async RunRetention(@CurrentUser() UserId: string) {
    return this.SendResponseData(await this._Retention.run(UserId));
  }

  /** A handled deletion request: removes the data now (never while a case is open) and closes the task */
  @Permission("privacy.handle")
  @Post("PrivacyRequests/:CustomerId/Erase")
  async Erase(@Param("CustomerId") CustomerId: string, @CurrentUser() UserId: string) {
    const res = await this._Retention.erase(id(CustomerId));
    if (res.erased !== true) {
      const why: Record<string, string> = {
        customer_not_found: "Customer not found",
        active_product: "The customer has an active product: keep the record (servicing)",
        open_booking: "A booking request is still open: close it first",
        open_activation: "An activation link is still unpaid: close it first",
        open_task: "Another task is still open for this customer: close it first",
      };
      throw new BadRequestException(why[res.reason] ?? res.reason);
    }
    await task.update(
      { customer_id: CustomerId, type: TaskType.PrivacyRequest, task_status: In([TaskStatus.Open, TaskStatus.InProgress]) },
      { task_status: TaskStatus.Done, outcome: "data erased", updated_by_id: UserId, updated_on: new Date() } as any,
    );
    return this.SendResponseData({ erased: true });
  }
}
