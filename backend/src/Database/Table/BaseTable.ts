import { AuditLogRemoveColumn } from "@Helper/AuditLog.decorators";
import { Column, BaseEntity, Index, PrimaryGeneratedColumn } from "typeorm";

export class BaseTable extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  @Index()
  id: string;

  @Column({ type: "boolean", default: 1 })
  status: boolean;

  @AuditLogRemoveColumn()
  @Column({ nullable: true, select: false })
  created_by_id: string;

  @AuditLogRemoveColumn()
  @Column({ type: "timestamp", default: () => "now()", select: false })
  created_on: Date;

  @AuditLogRemoveColumn()
  @Column({ nullable: true, select: false })
  updated_by_id?: string;

  @AuditLogRemoveColumn()
  @Column({ type: "timestamp", nullable: true, select: false })
  updated_on?: Date;
}
