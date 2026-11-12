import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";

@Entity()
@Index("uq_consent_customer", ["customer_id"], { unique: true })
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

  @Column({ nullable: true })
  notice_version: string;

  @Column({ type: "timestamp", nullable: true })
  opt_out_at: Date;

  // ---- DPDP health-data consent (health_data_consent + notice_version above) ----
  // when the customer said YES, and the inbound wamid of that YES (the proof)
  @Column({ type: "timestamp", nullable: true })
  consent_timestamp: Date | null;

  @Column({ type: "text", nullable: true })
  consent_source: string | null;

  // the customer said NO to this notice version
  @Column({ type: "timestamp", nullable: true })
  health_refused_at: Date | null;

  @Column({ type: "text", nullable: true })
  health_refused_version: string | null;

  // the notice was sent (to read the next message as the answer); the version it was sent under
  @Column({ type: "timestamp", nullable: true })
  notice_sent_at: Date | null;

  @Column({ type: "text", nullable: true })
  notice_sent_version: string | null;

  @Column({ type: "date", nullable: true })
  retention_until: string;

  @Column({ type: "timestamp", nullable: true })
  privacy_request_at: Date | null;
}

