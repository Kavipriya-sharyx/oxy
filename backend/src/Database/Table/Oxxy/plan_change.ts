import { Check, Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// A proposed change to one plan_catalog row (Full Plan 6.1 / 8: "changes need a second approver").
// It is applied only when a DIFFERENT user approves it; the row is the record of who asked and who approved.
@Entity()
@Index("IDX_plan_change_status", ["change_status"])
@Check("CHK_plan_change_two_people", `"decided_by_id" IS NULL OR "change_status" = 'withdrawn' OR "decided_by_id" <> "requested_by_id"`)
export class plan_change extends BaseTable {
  @Column({ type: "uuid" })
  catalog_id: string;

  @Column({ type: "json" }) // { price?: 1999, gst_rate?: 0.18, ... } - only the fields that change
  changes: Record<string, unknown>;

  @Column({ type: "json", nullable: true }) // the same fields before the change (for the review screen)
  before: Record<string, unknown> | null;

  @Column({ type: "text" })
  reason: string;

  @Column({ default: "pending" }) // pending | approved | rejected | withdrawn
  change_status: string;

  @Column({ type: "varchar" })
  requested_by_id: string;

  @Column({ type: "varchar", nullable: true })
  decided_by_id: string | null;

  @Column({ type: "timestamp", nullable: true })
  decided_at: Date | null;

  @Column({ type: "text", nullable: true })
  decision_note: string | null;

  @Column({ type: "int", nullable: true }) // plan_catalog.version after the change
  applied_version: number | null;
}
