/**
 * @author VarunAnand
 */
import { BaseTable } from "../BaseTable";
import { Column, Entity } from "typeorm";
import { AuditLogIdentity } from "@Helper/AuditLog.decorators";

@Entity()
export class user_role extends BaseTable {
  @AuditLogIdentity()
  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  code: string;

  @Column({ nullable: true })
  landing_page: string;

  @Column({ type: "json", nullable: true })
  permission: any;
}
