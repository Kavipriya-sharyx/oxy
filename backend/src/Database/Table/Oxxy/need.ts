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

  @Column({ type: "int", nullable: true })
  annual_medical_spend: number;

  @Column({ type: "text", nullable: true, transformer: encrypted })
  insurance_status: string;
}
