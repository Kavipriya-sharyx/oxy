import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { conversation } from "./conversation";
import { user } from "../Admin/user";

@Entity()
export class task extends BaseTable {
  @Column()
  type: string;

  @Column({ default: "open" })
  task_status: string;

  @Column({ default: "normal" })
  priority: string;

  @ManyToOne(() => customer, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid", nullable: true })
  @Index()
  customer_id: string;

  @ManyToOne(() => conversation, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "conversation_id" })
  conversation: conversation;

  @Column({ type: "uuid", nullable: true })
  @Index()
  conversation_id: string;

  @Column({ type: "text", nullable: true })
  summary: string;

  @ManyToOne(() => user, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "assigned_to_id" })
  assigned_to: user;

  @Column({ type: "uuid", nullable: true })
  @Index()
  assigned_to_id: string;

  @Column({ type: "timestamp", nullable: true })
  due_at: Date;

  @Column({ type: "text", nullable: true, unique: true })
  crm_task_id: string;

  // ---- Escalation (Playbook 17.1 create_escalation) ----
  @Column({ type: "text", nullable: true })
  reason: string | null;

  @Column({ type: "timestamp", nullable: true })
  callback_from: Date | null;

  @Column({ type: "timestamp", nullable: true })
  callback_to: Date | null;

  @Column({ type: "text", nullable: true })
  outcome: string | null;
}
