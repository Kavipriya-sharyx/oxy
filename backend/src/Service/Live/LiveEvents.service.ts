// Live updates for the console (Full Plan 2 / 7: "Redis pub/sub so the React console gets live updates from
// every API instance"). An event says only WHAT changed (a topic and ids), never customer data: the console
// re-reads the data through the normal, permission-checked REST endpoints.
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DataSource, EntitySubscriberInterface, InsertEvent, RemoveEvent, UpdateEvent } from "typeorm";
import IORedis from "ioredis";
import { Observable, Subject } from "rxjs";
import { queuePrefix, redisConnection } from "@Root/Config/Redis";

export type LiveTopic =
  | "message"
  | "conversation"
  | "task"
  | "booking"
  | "activation"
  | "crm"
  | "follow_up"
  | "plan"
  | "template"
  | "job";

export interface LiveEvent {
  topic: LiveTopic;
  conversation_id?: string | null;
}

// table -> topic (only the tables a console screen shows)
export const TABLE_TOPICS: Record<string, LiveTopic> = {
  message: "message",
  conversation: "conversation",
  task: "task",
  booking_request: "booking",
  activation: "activation",
  crm_outbox: "crm",
  crm_webhook_event: "crm",
  follow_up: "follow_up",
  plan_catalog: "plan",
  plan_change: "plan",
  wa_template: "template",
  job_run: "job",
};

/** The event for one changed row, or null when no screen shows that table */
export function eventFor(table: string, entity: Record<string, unknown> | undefined | null): LiveEvent | null {
  const topic = TABLE_TOPICS[table];
  if (!topic) return null;
  const conv =
    (entity?.conversation_id as string | undefined) ?? (table === "conversation" ? (entity?.id as string | undefined) : undefined);
  return { topic, conversation_id: typeof conv === "string" ? conv : null };
}

const FLUSH_MS = 250; // many rows in one turn -> one event per topic / conversation

@Injectable()
export class LiveEventsService implements OnModuleInit, OnModuleDestroy, EntitySubscriberInterface {
  private readonly logger = new Logger(LiveEventsService.name);
  private readonly local = new Subject<LiveEvent>();
  private pub: IORedis | null = null;
  private sub: IORedis | null = null;
  private pending = new Map<string, LiveEvent>();
  private timer: NodeJS.Timeout | null = null;
  private readonly channel = `${queuePrefix()}:live`;

  constructor(private readonly _DataSource: DataSource) {
    // every insert / update / delete through TypeORM becomes an event (no call sites to forget)
    if (!this._DataSource.subscribers.includes(this)) this._DataSource.subscribers.push(this);
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === "test" || !process.env.REDIS_HOST) return;
    try {
      this.pub = new IORedis(redisConnection());
      this.sub = new IORedis(redisConnection());
      await this.sub.subscribe(this.channel);
      this.sub.on("message", (_ch, raw) => {
        try {
          this.local.next(JSON.parse(raw) as LiveEvent);
        } catch {
          /* not ours */
        }
      });
      this.pub.on("error", (e) => this.logger.warn(`live publish: ${e.message}`));
      this.sub.on("error", (e) => this.logger.warn(`live subscribe: ${e.message}`));
    } catch (e) {
      this.logger.warn(`live updates stay on this instance only: ${(e as Error).message}`);
      this.pub = this.sub = null;
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    await this.sub?.quit().catch(() => undefined);
    await this.pub?.quit().catch(() => undefined);
  }

  /** The stream the SSE endpoint sends to each signed-in console */
  stream(): Observable<LiveEvent> {
    return this.local.asObservable();
  }

  publish(e: LiveEvent | null) {
    if (!e) return;
    this.pending.set(`${e.topic}:${e.conversation_id ?? ""}`, e);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush() {
    this.timer = null;
    const events = [...this.pending.values()];
    this.pending.clear();
    for (const e of events) {
      if (this.pub && this.pub.status === "ready") {
        // every instance (this one too) gets it from the subscription
        this.pub.publish(this.channel, JSON.stringify(e)).catch(() => this.local.next(e));
      } else this.local.next(e);
    }
  }

  // ---- TypeORM subscriber (all entities) ----
  afterInsert(event: InsertEvent<any>) {
    this.publish(eventFor(event.metadata.tableName, event.entity));
  }
  afterUpdate(event: UpdateEvent<any>) {
    this.publish(eventFor(event.metadata.tableName, (event.entity ?? event.databaseEntity) as any));
  }
  afterRemove(event: RemoveEvent<any>) {
    this.publish(eventFor(event.metadata.tableName, (event.entity ?? event.databaseEntity) as any));
  }
}
