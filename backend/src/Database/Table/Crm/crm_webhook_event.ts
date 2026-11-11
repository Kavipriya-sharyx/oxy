import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";

// Every CRM webhook, stored before processing. event_id as primary key makes a resend harmless.
@Entity()
export class crm_webhook_event extends BaseEntity {
  @PrimaryColumn({ type: "text" })
  event_id: string;

  @Column({ type: "text" })
  event_type: string;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown>;

  @Column({ type: "timestamp", default: () => "now()" })
  received_at: Date;

  @Column({ type: "timestamp", nullable: true })
  processed_at: Date | null;

  @Column({ type: "text", nullable: true })
  error: string | null;
}
