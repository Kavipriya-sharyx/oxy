import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { centre } from "./centre";
import { conversation } from "./conversation";

// Booking / registration / treatment / bill status at the centre of the one upcoming expense.
// Feeds the Cut Medi Bills gate (plan 6.1, 8.2). The centre may not be in the directory yet, so
// centre_id is optional and the name the customer gave is kept.
@Entity()
@Index(["conversation_id"])
export class eligibility extends BaseTable {
  @ManyToOne(() => conversation, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "conversation_id" })
  conversation: conversation;

  @Column({ type: "uuid", nullable: true })
  conversation_id: string | null;

  @Column({ type: "text", nullable: true })
  centre_name: string | null;

  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @ManyToOne(() => centre, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "centre_id" })
  centre: centre;

  @Column({ type: "uuid", nullable: true })
  @Index()
  centre_id: string | null;

  @Column({ default: "none" })
  booking_state: string;

  @Column({ default: "none" })
  registration_state: string;

  @Column({ default: "none" })
  treatment_state: string;

  @Column({ default: "none" })
  bill_state: string;
}
