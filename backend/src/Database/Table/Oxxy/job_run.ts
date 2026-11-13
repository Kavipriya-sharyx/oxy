import { Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// One run of a nightly job (CRM reconciliation, data retention). `summary` holds counts and ids only:
// never names, numbers or health details.
@Entity()
@Index("IDX_job_run_kind_started", ["kind", "started_at"])
export class job_run extends BaseTable {
  @Column() // crm_reconciliation | data_retention
  kind: string;

  @Column({ default: "running" }) // running | ok | failed | skipped
  job_status: string;

  @Column({ type: "timestamp" })
  started_at: Date;

  @Column({ type: "timestamp", nullable: true })
  finished_at: Date | null;

  @Column({ type: "json", nullable: true })
  summary: unknown;

  @Column({ type: "varchar", nullable: true }) // null = the nightly schedule; else the console user
  triggered_by_id: string | null;
}
