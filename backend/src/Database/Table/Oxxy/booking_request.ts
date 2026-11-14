import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { conversation } from "./conversation";
import { centre } from "./centre";
import { user } from "../Admin/user";

@Entity()
export class booking_request extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @ManyToOne(() => conversation, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "conversation_id" })
  conversation: conversation;

  @Column({ type: "uuid" })
  @Index()
  conversation_id: string;

  @ManyToOne(() => centre, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "centre_id" })
  centre: centre;

  @Column({ type: "uuid" })
  @Index()
  centre_id: string;

  @Column({ nullable: true })
  specialisation: string;

  @Column({ type: "date" })
  preferred_date: string;

  @Column({ nullable: true })
  preferred_time: string;

  @Column({ default: "pending_confirmation" })
  booking_status: string;

  @ManyToOne(() => user, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "confirmed_by_id" })
  confirmed_by: user;

  @Column({ type: "uuid", nullable: true })
  @Index()
  confirmed_by_id: string;

  @Column({ type: "text", nullable: true, unique: true })
  crm_booking_id: string;

  // who confirmed it when the client's CRM confirms through the Actions API (not a console user)
  @Column({ type: "varchar", nullable: true })
  confirmed_by_name: string | null;
}
