import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";

@Entity()
export class customer extends BaseTable {
  @Column({ unique: true })
  wa_number: string;

  @Column({ nullable: true })
  first_name: string;

  @Column({ default: "en" }) // en | hi | hinglish
  language: string;

  @Column({ type: "int", nullable: true })
  age: number;

  @Column({ nullable: true }) // ProductType
  active_product: string;

  @Column({ nullable: true }) // OxxyPlan
  active_plan: string;
}
