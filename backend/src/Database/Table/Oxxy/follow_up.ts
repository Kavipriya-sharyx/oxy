import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { conversation } from "./conversation";

// A scheduled message (Full Plan 6.1 follow_ups, Playbook 17.1 create_follow_up). The BullMQ job is
// only the alarm clock: this row is the record, and consent / quiet hours are checked again at send time.
@Entity()
@Index(["follow_up_status", "scheduled_for"])
export class follow_up extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @ManyToOne(() => conversation, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "conversation_id" })
  conversation: conversation;

  @Column({ type: "uuid", nullable: true })
  conversation_id: string | null;

  @Column() // agreed_follow_up | rescue | trigger_q | booking_update
  kind: string;

  @Column({ type: "timestamp" })
  scheduled_for: Date;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  @Column({ type: "varchar", nullable: true })
  selected_product: string | null;

  @Column({ type: "varchar", nullable: true })
  template_name: string | null;

  @Column({ default: "scheduled" }) // scheduled | sent | cancelled | skipped
  follow_up_status: string;

  @Column({ type: "text", nullable: true }) // opt_out, quiet_hours, frequency_cap, product_active ...
  skip_reason: string | null;

  @Column({ type: "varchar", nullable: true }) // voice_ai | whatsapp_inbound | human_agent | crm
  source: string | null;
}
