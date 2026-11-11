/**
 * @author VarunAnand
 */
import { AuditLogIdentity, AuditLogTableRemoveColumns } from "@Helper/AuditLog.decorators";
import { Entity, Column, JoinColumn, ManyToOne, Index } from "typeorm";
import { BaseTable } from "../BaseTable";
import { user_role } from "./user_role";

@Entity()
export class user extends BaseTable {
  @ManyToOne(() => user_role, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_role_id" })
  user_role: user_role;

  @Column({ type: "uuid" })
  @Index()
  user_role_id: string;

  @Column({ type: "text", nullable: true })
  first_name: string;

  @Column({ type: "text", nullable: true })
  last_name: string;

  @AuditLogIdentity()
  @Column({ unique: true })
  email: string;

  @AuditLogTableRemoveColumns()
  @Column({ type: "text" })
  password: string;

  @Column({ nullable: true })
  mobile: string;

  @Column({ type: "bigint", nullable: true })
  reset_otp: number;

  @Column({ type: "text", nullable: true, unique: true })
  crm_user_id: string;
}
