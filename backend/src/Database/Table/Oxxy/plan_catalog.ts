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

  // rate used for the "easy illustration" and the value check (Full Plan 1.1):
  // Everyday 20, Vital 25, Thrive 30, Infinity 30 (Infinity saves "up to 40", but illustrates at 30)
  @Column({ type: "int", nullable: true })
  illustration_pct: number;

  @Column({ type: "int", nullable: true })
  age_limit: number;

  @Column({ nullable: true })
  activation_time: string;

  @Column({ type: "text", nullable: true })
  activation_link: string;

  @Column({ type: "int", default: 1 })
  version: number;
}
