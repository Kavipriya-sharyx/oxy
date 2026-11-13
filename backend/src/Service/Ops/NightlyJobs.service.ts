// The nightly schedule (BullMQ job schedulers, so several API instances still run each job once):
// 02:00 IST CRM reconciliation, 02:30 IST data retention.
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";
import { CrmReconciliationService } from "./CrmReconciliation.service";
import { RetentionService } from "./Retention.service";

const QUEUE = "nightly";

@Injectable()
export class NightlyJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NightlyJobsService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly _Reconcile: CrmReconciliationService,
    private readonly _Retention: RetentionService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === "test" || !process.env.REDIS_HOST) return;
    const connection = redisConnection();
    const prefix = queuePrefix();
    try {
      this.queue = new Queue(QUEUE, { connection, prefix });
      await this.queue.upsertJobScheduler("nightly-crm-reconciliation", { pattern: "0 2 * * *", tz: "Asia/Kolkata" }, { name: "crm_reconciliation" });
      await this.queue.upsertJobScheduler("nightly-data-retention", { pattern: "30 2 * * *", tz: "Asia/Kolkata" }, { name: "data_retention" });
      this.worker = new Worker(
        QUEUE,
        async (job) => {
          if (job.name === "crm_reconciliation") await this._Reconcile.run();
          else if (job.name === "data_retention") await this._Retention.run();
        },
        { connection, prefix, concurrency: 1 },
      );
      this.worker.on("error", (e) => this.logger.error(`nightly worker error: ${e.message}`));
    } catch (e) {
      this.logger.warn(`nightly jobs not scheduled: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
