// Full Plan 11 / failure table: health check and on-call alerts. Every minute the checks run; a check that
// turns bad (database or Redis down, inbound messages stuck, CRM dead letters, failed CRM webhooks) posts
// ONE alert to ALERT_WEBHOOK_URL (Slack / Teams / Google Chat style JSON {"text": ...}), at most once per
// ALERT_THROTTLE_MIN minutes per check, and a "recovered" note when it is fine again. Without the URL the
// alert is only logged. Never on in tests. Alerts carry counts only: no message text, no phone number.
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { DataSource } from "typeorm";

export type CheckName = "database" | "redis" | "inbound_stuck" | "crm_dead" | "crm_webhook_failed";

export interface CheckResult {
  ok: boolean;
  /** milliseconds for database / redis, a count for the rest */
  value?: number;
  detail?: string;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  checked_at: string;
  checks: Record<CheckName, CheckResult>;
}

/** database and Redis down = down (no message can be processed); anything else bad = degraded */
export function overall(checks: Record<CheckName, CheckResult>): HealthReport["status"] {
  if (!checks.database.ok || !checks.redis.ok) return "down";
  return Object.values(checks).every((c) => c.ok) ? "ok" : "degraded";
}

const STUCK_MINUTES = 5;

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly lastAlert = new Map<CheckName, number>();
  private readonly bad = new Set<CheckName>();
  private lastDead = 0;

  constructor(
    private readonly _DataSource: DataSource,
    @Optional() @Inject("REDIS_CLIENT") private readonly _Redis?: { ping: () => Promise<string> },
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    const every = Math.max(15, Number(process.env.HEALTH_CHECK_SECONDS || 60)) * 1000;
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async timed(f: () => Promise<unknown>, timeoutMs = 3000): Promise<CheckResult> {
    const t0 = Date.now();
    try {
      await Promise.race([f(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
      return { ok: true, value: Date.now() - t0 };
    } catch (e) {
      return { ok: false, value: Date.now() - t0, detail: (e as Error).message.slice(0, 200) };
    }
  }

  private async count(sql: string): Promise<number> {
    const rows = await this._DataSource.query(sql);
    return Number(rows?.[0]?.n ?? 0);
  }

  async check(): Promise<HealthReport> {
    const database = await this.timed(() => this._DataSource.query("SELECT 1"));
    const redis = this._Redis
      ? await this.timed(() => this._Redis!.ping())
      : { ok: false, detail: "no Redis client" };
    const checks: Record<CheckName, CheckResult> = {
      database,
      redis,
      inbound_stuck: { ok: true, value: 0 },
      crm_dead: { ok: true, value: 0 },
      crm_webhook_failed: { ok: true, value: 0 },
    };
    if (database.ok) {
      try {
        // inbound messages with no reply and not marked handled (same rule as InboundQueue.findLostMessages:
        // the recovery sweep should have answered them by now). Opted-out customers are left out.
        const stuck = await this.count(
          `SELECT count(*) AS n FROM "message" m JOIN "conversation" c ON c."id" = m."conversation_id"
           WHERE m."direction" = 'in' AND m."message_status" = 'received' AND m."wa_message_id" IS NOT NULL
           AND m."created_on" < now() - interval '${STUCK_MINUTES} minutes' AND m."created_on" > now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM "message" o WHERE o."direction" = 'out' AND o."reply_to_wa_message_id" = m."wa_message_id")
           AND NOT EXISTS (SELECT 1 FROM "consent" k WHERE k."customer_id" = c."customer_id" AND k."opt_out_at" IS NOT NULL)`,
        );
        checks.inbound_stuck = { ok: stuck === 0, value: stuck };
        const dead = await this.count(`SELECT count(*) AS n FROM "crm_outbox" WHERE "sync_status" = 'dead'`);
        checks.crm_dead = { ok: dead <= this.lastDead, value: dead }; // only NEW dead letters alert
        const failed = await this.count(
          `SELECT count(*) AS n FROM "crm_webhook_event" WHERE "processed_at" IS NULL AND "error" IS NOT NULL
           AND "received_at" > now() - interval '1 day'`,
        );
        checks.crm_webhook_failed = { ok: failed === 0, value: failed };
      } catch (e) {
        this.logger.warn(`health counts failed: ${(e as Error).message}`);
      }
    }
    return { status: overall(checks), checked_at: new Date().toISOString(), checks };
  }

  /** one run of the checks, with alerts on changes */
  async tick(): Promise<HealthReport> {
    const r = await this.check();
    for (const [name, c] of Object.entries(r.checks) as [CheckName, CheckResult][]) {
      if (!c.ok) {
        this.bad.add(name);
        await this.alert(name, `Oxxy bot: ${describe(name, c)}`);
      } else if (this.bad.has(name) && name !== "crm_dead") {
        this.bad.delete(name);
        this.lastAlert.delete(name);
        await this.alert(name, `Oxxy bot: ${name} recovered`, true);
      } else this.bad.delete(name);
    }
    // new dead letters alert once; the count stays on the console's CRM sync screen
    if (typeof r.checks.crm_dead.value === "number") this.lastDead = r.checks.crm_dead.value;
    return r;
  }

  /** Posts to ALERT_WEBHOOK_URL, throttled per check. Never throws. */
  async alert(name: CheckName, text: string, force = false): Promise<boolean> {
    const now = Date.now();
    const gap = Math.max(1, Number(process.env.ALERT_THROTTLE_MIN || 30)) * 60_000;
    if (!force && now - (this.lastAlert.get(name) ?? 0) < gap) return false;
    this.lastAlert.set(name, now);
    this.logger.error(text);
    const url = (process.env.ALERT_WEBHOOK_URL || "").trim();
    if (!url || process.env.NODE_ENV === "test") return false;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (e) {
      this.logger.warn(`alert webhook failed: ${(e as Error).message}`);
      return false;
    }
  }
}

function describe(name: CheckName, c: CheckResult): string {
  switch (name) {
    case "database":
      return `database not reachable (${c.detail ?? "error"}). Inbound messages wait in the queue.`;
    case "redis":
      return `Redis not reachable (${c.detail ?? "error"}). Queues and locks are down.`;
    case "inbound_stuck":
      return `${c.value} inbound message(s) not answered for over ${STUCK_MINUTES} minutes.`;
    case "crm_dead":
      return `${c.value} CRM sync row(s) failed for good (dead letter). Retry them on the CRM sync screen.`;
    case "crm_webhook_failed":
      return `${c.value} CRM webhook event(s) failed in the last day. See the CRM webhook log.`;
  }
}
