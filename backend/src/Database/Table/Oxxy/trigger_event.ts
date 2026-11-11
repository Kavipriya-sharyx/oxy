import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { conversation } from "./conversation";

// One row per trigger fired to a customer. Unique (customer, trigger) = dedupe + analytics.
@Entity()
@Index(["customer_id", "trigger_id"], { unique: true })
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
}

