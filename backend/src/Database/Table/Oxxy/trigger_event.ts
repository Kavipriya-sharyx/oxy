import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { conversation } from "./conversation";

// One row per trigger fired (analytics + dedupe). Dedupe is per decision journey (= conversation),
// not for life, so the index is not unique (plan 6.1: trigger_events_dedupe).
@Entity()
@Index(["conversation_id", "trigger_id"])
export class trigger_event extends BaseTable {
  @Column()
  trigger_id: string;

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
  conversation_id: string;

  @Column({ type: "text", nullable: true })
  reason: string;

  @Column({ type: "json", nullable: true })
  assets: unknown;

  @Column({ nullable: true })
  cta: string;

  @Column({ type: "text", nullable: true })
  response: string;

  @Column({ type: "text", nullable: true })
  suppression_reason: string;

  @Column({ type: "varchar", default: "whatsapp_inbound" }) // voice_ai | whatsapp_inbound | whatsapp_outbound | human_agent
  conversation_source: string;

  @Column({ type: "varchar", nullable: true })
  next_state: string | null;

  @Column({ type: "varchar", nullable: true }) // last_touch | assisted (set when a payment is verified)
  conversion_attribution: string | null;
}
