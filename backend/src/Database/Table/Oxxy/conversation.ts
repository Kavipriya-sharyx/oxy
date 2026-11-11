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

  @Column({ type: "timestamp", nullable: true })
  closed_at: Date;
}
