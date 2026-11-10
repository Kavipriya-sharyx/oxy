import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";

@Entity()
export class plan_catalog extends BaseTable {
  @Column()
  product: string;

  @Column()
  plan: string;

  @Column()
  billing: string;

  @Column({ type: "int" })
  price: number;

  @Column({ type: "decimal", precision: 4, scale: 2, default: 0.18 })
  gst_rate: number;

  @Column({ default: false })
  auto_renews: boolean;

  @Column({ type: "text", nullable: true })
  renewal_terms: string;

  @Column({ type: "int", nullable: true })
  max_saving_pct: number;

  @Column({ type: "int", nullable: true })
  age_limit: number;

  @Column({ nullable: true })
  activation_time: string;

  @Column({ type: "text", nullable: true })
  activation_link: string;

  @Column({ type: "int", default: 1 })
  version: number;
}
