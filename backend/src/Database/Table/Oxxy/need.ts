import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { conversation } from "./conversation";
import { encrypted } from "./encrypted.transformer";

@Entity()
export class need extends BaseTable {
  @ManyToOne(() => conversation, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "conversation_id" })
  conversation: conversation;

  @Column({ type: "uuid" })
  @Index()
  conversation_id: string;

  @Column({ nullable: true })
  beneficiary: string;

  @Column({ type: "text", nullable: true, transformer: encrypted })
  healthcare_need: string;

  @Column({ type: "text", nullable: true, transformer: encrypted })
  specialisation: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  locality: string;

  @Column({ type: "int", nullable: true })
  travel_radius_km: number;

  @Column({ type: "date", nullable: true })
  service_date: string;

  @Column({ type: "int", nullable: true })
  expected_bill: number;

  @Column({ type: "varchar", nullable: true }) // ongoing | single_expense (routing, plan 12.3)
  need_pattern: string | null;

  @Column({ type: "int", nullable: true })
  annual_medical_spend: number;

  @Column({ type: "text", nullable: true, transformer: encrypted })
  insurance_status: string;

  // ---- Need / Location / Provider / Eligibility (Playbook 17) ----
  @Column({ type: "varchar", nullable: true }) // routine | soon | urgent
  urgency: string | null;

  @Column({ type: "text", nullable: true, transformer: encrypted }) // only if the customer shares it
  condition_if_voluntary: string | null;

  @Column({ type: "varchar", nullable: true })
  postcode: string | null;

  @Column({ type: "uuid", nullable: true })
  preferred_centre_id: string | null;

  @Column({ type: "json", nullable: true }) // centre ids shown to the customer, in order
  suggested_centre_ids: string[] | null;

  @Column({ type: "boolean", nullable: true })
  pre_existing: boolean | null;
}
