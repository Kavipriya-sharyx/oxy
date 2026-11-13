// Nightly CRM check (Full Plan 3.4): "a job compares open bookings, tasks and activations on both sides and
// lists any mismatch". Nothing is changed automatically: the list is for a person on the CRM sync screen.
// The CRM side comes from GET {CRM_BASE_URL}/reconciliation/open [CONFIRM the contract with the CRM team]:
//   { bookings: [{ external_id, id, status }], tasks: [...], activations: [...] }
// where external_id is the bot's id (sent in every create call) and id is the CRM's own id.
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { In } from "typeorm";
import { booking_request } from "@Database/Table/Oxxy/booking_request";
import { task } from "@Database/Table/Oxxy/task";
import { activation } from "@Database/Table/Oxxy/activation";
import { crm_outbox } from "@Database/Table/Crm/crm_outbox";
import { BookingStatus } from "@Helper/Enum/BookingStatus";
import { TaskStatus } from "@Helper/Enum/TaskStatus";
import { ActivationStatus } from "@Helper/Enum/ActivationStatus";
import { CrmSyncStatus } from "@Helper/Enum/CrmSyncStatus";
import { JobOutcome, runJob } from "./JobRuns";

export type RecordKind = "booking" | "task" | "activation";

export interface OpenRecord {
  id: string; // the bot's id
  crm_id: string | null;
  status: string;
}

export interface CrmOpenRecord {
  external_id?: string | null;
  bot_id?: string | null;
  id?: string | null;
  status?: string | null;
}

export interface Mismatch {
  kind: RecordKind;
  issue: "missing_in_crm" | "missing_in_bot" | "status_differs";
  bot_id: string | null;
  crm_id: string | null;
  bot_status: string | null;
  crm_status: string | null;
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Pure compare of one kind: matched by the bot id (external_id), else by the CRM id */
export function compareOpen(kind: RecordKind, bot: OpenRecord[], crm: CrmOpenRecord[]): Mismatch[] {
  const out: Mismatch[] = [];
  const used = new Set<number>();
  for (const b of bot) {
    const i = crm.findIndex(
      (c, j) => !used.has(j) && ((c.external_id ?? c.bot_id) === b.id || (!!b.crm_id && c.id === b.crm_id)),
    );
    if (i < 0) {
      out.push({ kind, issue: "missing_in_crm", bot_id: b.id, crm_id: b.crm_id, bot_status: b.status, crm_status: null });
      continue;
    }
    used.add(i);
    if (norm(crm[i].status) !== norm(b.status))
      out.push({
        kind,
        issue: "status_differs",
        bot_id: b.id,
        crm_id: crm[i].id ?? b.crm_id,
        bot_status: b.status,
        crm_status: crm[i].status ?? null,
      });
  }
  crm.forEach((c, j) => {
    if (!used.has(j))
      out.push({
        kind,
        issue: "missing_in_bot",
        bot_id: c.external_id ?? c.bot_id ?? null,
        crm_id: c.id ?? null,
        bot_status: null,
        crm_status: c.status ?? null,
      });
  });
  return out;
}

@Injectable()
export class CrmReconciliationService {
  constructor(private readonly _Config: ConfigService) {}

  private enabled(): boolean {
    const v = this._Config.get<unknown>("Crm.Enabled");
    return v === true || v === "true";
  }

  /** The bot's open records (the same ids the CRM got in its create calls) */
  async botOpen(): Promise<Record<RecordKind, OpenRecord[]>> {
    const bookings = await booking_request.find({
      where: { booking_status: In([BookingStatus.PendingConfirmation, BookingStatus.Confirmed]) },
      select: ["id", "crm_booking_id", "booking_status"] as any,
    });
    const tasks = await task.find({
      where: { task_status: In([TaskStatus.Open, TaskStatus.InProgress]) },
      select: ["id", "crm_task_id", "task_status"] as any,
    });
    const acts = await activation.find({
      where: { activation_status: In([ActivationStatus.Pending, ActivationStatus.LinkSent]) },
      select: ["id", "crm_activation_id", "activation_status"] as any,
    });
    return {
      booking: bookings.map((b) => ({ id: b.id, crm_id: b.crm_booking_id ?? null, status: b.booking_status })),
      // only tasks the CRM knows about (local-only mirrors have no CRM id and were never sent)
      task: tasks.filter((t) => !!t.crm_task_id).map((t) => ({ id: t.id, crm_id: t.crm_task_id, status: t.task_status })),
      activation: acts.map((a) => ({ id: a.id, crm_id: a.crm_activation_id ?? null, status: a.activation_status })),
    };
  }

  async crmOpen(): Promise<Record<RecordKind, CrmOpenRecord[]>> {
    const res = await axios.get(`${this._Config.get("Crm.BaseUrl")}/reconciliation/open`, {
      headers: { Authorization: `Bearer ${this._Config.get("Crm.ApiKey")}` },
      timeout: 15_000,
    });
    const d = res.data ?? {};
    const list = (x: unknown) => (Array.isArray(x) ? (x as CrmOpenRecord[]) : []);
    return { booking: list(d.bookings), task: list(d.tasks), activation: list(d.activations) };
  }

  /** Outbox health that needs no CRM call: dead rows, and rows waiting for more than an hour */
  async outboxHealth(): Promise<{ dead: number; stuck: number }> {
    const dead = await crm_outbox.count({ where: { sync_status: CrmSyncStatus.Dead } });
    const stuck = await crm_outbox
      .createQueryBuilder("o")
      .where("o.sync_status IN (:...s)", { s: [CrmSyncStatus.Pending, CrmSyncStatus.Failed] })
      // compared in SQL: created_on has no time zone (CONTEXT.md gotcha)
      .andWhere("o.created_on < now() - interval '1 hour'")
      .getCount();
    return { dead, stuck };
  }

  async check(): Promise<JobOutcome> {
    if (!this.enabled()) return { status: "skipped", summary: { reason: "CRM sync is off (CRM_ENABLED)" } };
    const [bot, crm, outbox] = await Promise.all([this.botOpen(), this.crmOpen(), this.outboxHealth()]);
    const mismatches = (["booking", "task", "activation"] as RecordKind[]).flatMap((k) => compareOpen(k, bot[k], crm[k]));
    return {
      status: "ok",
      summary: {
        bot_open: { bookings: bot.booking.length, tasks: bot.task.length, activations: bot.activation.length },
        crm_open: { bookings: crm.booking.length, tasks: crm.task.length, activations: crm.activation.length },
        outbox,
        mismatch_count: mismatches.length,
        mismatches: mismatches.slice(0, 500), // ids and statuses only
      },
    };
  }

  run(triggeredBy: string | null = null) {
    return runJob("crm_reconciliation", triggeredBy, () => this.check());
  }
}
