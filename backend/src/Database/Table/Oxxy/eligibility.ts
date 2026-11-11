import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { centre } from "./centre";

// Booking / registration / treatment / bill status per centre. Feeds the Cut Medi Bills gate.
@Entity()
@Index(["customer_id", "centre_id"], { unique: true })
export class eligibility extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @ManyToOne(() => centre, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "centre_id" })
  centre: centre;

  @Column({ type: "uuid" })
  @Index()
  centre_id: string;

  @Column({ default: "none" })
  booking_state: string;

  @Column({ default: "none" })
  registration_state: string;

  @Column({ default: "none" })
  treatment_state: string;

  @Column({ default: "none" })
  bill_state: string;
}
