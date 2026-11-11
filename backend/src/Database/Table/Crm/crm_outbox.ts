import { BaseEntity, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { customer } from "../Oxxy/customer";

// Every CRM call. Written in the same transaction as the bot change, sent later by the worker.
// id is also sent as the Idempotency-Key header.
@Entity()
@Index("crm_outbox_due", ["next_attempt_at"], { where: `"sync_status" IN ('pending', 'failed')` })
export class crm_outbox extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  action: string;

  @ManyToOne(() => customer, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid", nullable: true })
  @Index()
  customer_id: string | null;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown>;

  @Column({ default: "pending" }) // CrmSyncStatus (not "status": BaseTable owns that name)
  sync_status: string;

  @Column({ type: "int", default: 0 })
  attempts: number;

  @Column({ type: "timestamp", default: () => "now()" })
  next_attempt_at: Date;

  @Column({ type: "text", nullable: true })
  last_error: string | null;

  @Column({ type: "text", nullable: true })
  crm_record_id: string | null;

  @Column({ type: "timestamp", default: () => "now()" })
  created_on: Date;

  @Column({ type: "timestamp", nullable: true })
  sent_at: Date | null;
}
