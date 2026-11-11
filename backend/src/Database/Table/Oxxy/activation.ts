import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { plan_catalog } from "./plan_catalog";

@Entity()
@Index("uq_activation_one_active", ["customer_id"], { unique: true, where: "\"activation_status\" = 'active'" })
export class activation extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @ManyToOne(() => plan_catalog, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "catalog_id" })
  catalog: plan_catalog;

  @Column({ type: "uuid" })
  @Index()
  catalog_id: string;

  @Column()
  product: string;

  @Column()
  plan: string;

  @Column()
  billing: string;

  @Column({ type: "timestamp", nullable: true })
  link_sent_at: Date;

  @Column({ type: "int", nullable: true })
  link_version: number;

  @Column({ default: "pending" })
  payment_status: string;

  @Column({ default: "pending" })
  activation_status: string;

  @Column({ type: "text", nullable: true, unique: true })
  crm_activation_id: string;
}
