import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";

@Entity()
@Index("uq_conversation_one_open", ["customer_id"], { unique: true, where: '"closed_at" IS NULL' })
export class conversation extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @Column({ default: "new" }) // ConversationState
  state: string;

  @Column({ nullable: true })
  selected_product: string;

  @Column({ nullable: true })
  recommended_plan: string;

  @Column({ type: "text", nullable: true })
  last_question: string;

  @Column({ type: "timestamp", nullable: true })
  last_customer_message_at: Date;

  @Column({ type: "varchar", nullable: true }) // state to return to after PAUSE / ESCALATED / FOLLOW_UP
  resume_state: string | null;

  @Column({ type: "int", default: 0 })
  rescue_count: number;

  // a yes/no the bot is waiting for, e.g. "send_activation_link" after the price disclosure
  @Column({ type: "varchar", nullable: true })
  pending_action: string | null;

  @Column({ type: "timestamp", nullable: true })
  closed_at: Date;

  // ---- Routing (Playbook 17) ----
  @Column({ type: "text", nullable: true })
  recommendation_reason: string | null;

  @Column({ type: "boolean", default: false })
  alternate_product_suppressed: boolean;

  @Column({ type: "boolean", nullable: true })
  value_check_passed: boolean | null;

  // ---- Engagement (Playbook 17) ----
  @Column({ type: "varchar", nullable: true })
  last_intent: string | null;

  @Column({ type: "text", nullable: true })
  objection: string | null;

  @Column({ type: "timestamp", nullable: true })
  follow_up_at: Date | null;

  @Column({ type: "text", nullable: true })
  escalation_reason: string | null;

  @Column({ type: "varchar", nullable: true }) // booked | activated | declined | closed | opted_out ...
  outcome: string | null;

  // Human takeover (Full Plan 12.9): who took the chat from the bot, and the note left for the bot on hand-back
  @Column({ type: "varchar", nullable: true })
  taken_over_by_id: string | null;

  @Column({ type: "timestamp", nullable: true })
  taken_over_at: Date | null;

  @Column({ type: "varchar", nullable: true })
  handed_back_by_id: string | null;

  @Column({ type: "timestamp", nullable: true })
  handed_back_at: Date | null;

  @Column({ type: "text", nullable: true }) // shown to Claude as team_note on the next turns
  handback_note: string | null;
}
