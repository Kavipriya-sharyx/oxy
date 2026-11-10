import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";

@Entity()
export class consent extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @Column({ default: false })
  whatsapp_consent: boolean;

  @Column({ default: false })
  health_data_consent: boolean;

  @Column({ default: false })
  marketing_consent: boolean;

  @Column({ type: "timestamp", nullable: true })
  opt_out_at: Date;
}
