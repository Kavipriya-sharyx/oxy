import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker } from "bullmq";
import { EntityManager, In, LessThanOrEqual } from "typeorm";
import { crm_outbox } from "@Database/Table/Crm/crm_outbox";
import { customer } from "@Database/Table/Oxxy/customer";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { task } from "@Database/Table/Oxxy/task";
import { activation } from "@Database/Table/Oxxy/activation";
import { CrmAction } from "@Helper/Enum/CrmAction";
import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";
import { TaskType } from "@Helper/Enum/TaskType";
import { TaskPriority } from "@Helper/Enum/TaskPriority";
import { CrmClient } from "./CrmClient.service";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";
import { backoffMs, failureState } from "./CrmRetry";
import { ChangeFeedService, feedType } from "./ChangeFeed.service";

const QUEUE = "crm-outbox";

@Injectable()
export class CrmOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmOutboxService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly _Config: ConfigService,
    private readonly _Client: CrmClient,
    @Optional() private readonly _Feed?: ChangeFeedService,
  ) {}

  get enabled(): boolean {
    return this._Config.get("Crm.Enabled") === true;
  }

  // ---- 1. write: call this INSIDE the same transaction as the bot change ----
  async enqueue(
    manager: EntityManager,
    action: CrmAction,
    customerId: string | null,
    payload: Record<string, unknown>,
  ): Promise<crm_outbox | null> {
    // the pull feed (GET /Actions/Changes) gets every change, in the same transaction, push on or off
    await this._Feed?.record(manager, feedType(action, payload), customerId, payload);
    if (!this.enabled) return null; // CRM push off: no outbox row, bot behaves as before
    return await manager.save(
      manager.create(crm_outbox, { action, customer_id: customerId, payload }),
    );
  }

  /** A CRM call that is not part of a bigger change (an event, a field update): saved and sent. Never throws. */
  async emit(
    action: CrmAction,
    customerId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this._Feed?.record(null, feedType(action, payload), customerId, payload);
    if (!this.enabled) return;
    try {
      const row = await crm_outbox.save(
        crm_outbox.create({ action, customer_id: customerId, payload } as any),
      );
      await this.dispatch(row as unknown as crm_outbox);
    } catch (e) {
      this.logger.warn(`CRM ${action} not queued: ${(e as Error).message}`);
    }
  }

  /** Full Plan 3.2 lookup_customer. null when the CRM is off, does not know the number or does not answer. */
  async lookupCustomer(waNumber: string) {
    if (!this.enabled) return null;
    try {
      return await this._Client.lookup(waNumber);
    } catch (e) {
      this.logger.warn(`CRM lookup failed: ${(e as Error).message}`);
      return null;
    }
  }

  // ---- 2. after commit: hand the row to the queue. Never throws (the sweeper is the safety net) ----
  async dispatch(row: crm_outbox | null): Promise<void> {
    if (!row || !this.queue) return;
    try {
      await this.queue.add(
        "send",
        { id: row.id },
        { jobId: row.id, removeOnComplete: true, removeOnFail: true },
      );
    } catch (e) {
      this.logger.warn(`dispatch failed, sweeper will pick it up: ${(e as Error).message}`);
    }
  }

  // ---- 3. worker + sweeper ----
  async onModuleInit() {
    if (!this.enabled) return;
    const connection = redisConnection();
    const prefix = queuePrefix();
    this.queue = new Queue(QUEUE, { connection, prefix });
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name === "sweep") return await this.sweep();
        return await this.send(String(job.data.id));
      },
      { connection, prefix, concurrency: 5 },
    );
    this.worker.on("error", (e) => this.logger.error(`worker error: ${e.message}`));
    // Re-enqueue anything due (covers Redis loss / crashes / backoff time reached)
    await this.queue.upsertJobScheduler("crm-sweep", { every: 30_000 }, { name: "sweep" });
    this.logger.log("CRM outbox worker started");
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async sweep(): Promise<number> {
    const due = await crm_outbox.find({
      where: {
        sync_status: In([CrmSyncStatus.Pending, CrmSyncStatus.Failed]),
        next_attempt_at: LessThanOrEqual(new Date()),
      },
      order: { next_attempt_at: "ASC" },
      take: 50,
    });
    for (const r of due) await this.dispatch(r);
    return due.length;
  }

  async send(id: string): Promise<void> {
    const row = await crm_outbox.findOne({ where: { id } });
    if (!row || row.sync_status === CrmSyncStatus.Sent || row.sync_status === CrmSyncStatus.Dead)
      return;
    try {
      const crmId = await this._Client.send(row);
      row.sync_status = CrmSyncStatus.Sent;
      row.sent_at = new Date();
      row.crm_record_id = crmId;
      row.last_error = null;
      await row.save();
      await this.mirrorId(row, crmId);
    } catch (e) {
      const err = e as Error;
      row.attempts += 1;
      row.last_error = String(err.message).slice(0, 1000);
      const status: number | undefined = (e as any)?.response?.status;
      row.sync_status = failureState(
        row.attempts,
        Number(this._Config.get("Crm.MaxAttempts")),
        status,
      );
      row.next_attempt_at = new Date(Date.now() + backoffMs(row.attempts));
      await row.save();
      if (row.sync_status === CrmSyncStatus.Dead) {
        this.logger.error(`CRM outbox ${row.id} (${row.action}) is dead: ${row.last_error}`);
        await task.save(
          task.create({
            type: TaskType.HumanHandoff,
            priority: TaskPriority.High,
            customer_id: row.customer_id,
            summary: `CRM sync failed for good: ${row.action} (${row.id})`,
          } as any),
        );
      }
    }
  }

  // Store the id the CRM returned on our local mirror row
  private async mirrorId(row: crm_outbox, crmId: string | null) {
    if (!crmId) return;
    const p = row.payload;
    try {
      if (row.action === CrmAction.UpsertCustomer && p.customer_id)
        await customer.update(String(p.customer_id), { crm_customer_id: crmId });
      else if (row.action === CrmAction.CreateBookingRequest && p.booking_id)
        await booking_request.update(String(p.booking_id), { crm_booking_id: crmId });
      else if (row.action === CrmAction.CreateTask && p.task_id)
        await task.update(String(p.task_id), { crm_task_id: crmId });
      else if (row.action === CrmAction.CreateActivation && p.activation_id)
        await activation.update(String(p.activation_id), { crm_activation_id: crmId });
    } catch (e) {
      this.logger.warn(`could not store crm id for ${row.id}: ${(e as Error).message}`);
    }
  }

  // ---- 4. ops helpers ----
  async listDead() {
    return await crm_outbox.find({
      where: { sync_status: CrmSyncStatus.Dead },
      order: { created_on: "DESC" },
      take: 100,
    });
  }

  async retry(id: string) {
    const row = await crm_outbox.findOne({ where: { id } });
    if (!row) return null;
    row.sync_status = CrmSyncStatus.Pending;
    row.attempts = 0;
    row.next_attempt_at = new Date();
    await row.save();
    await this.dispatch(row);
    return row;
  }
}
