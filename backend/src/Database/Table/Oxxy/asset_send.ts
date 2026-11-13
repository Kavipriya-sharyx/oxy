import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { customer } from "./customer";
import { approved_asset } from "./approved_asset";

// Every approved asset sent (Playbook 17 Content group: documents, links, comparisons, media).
@Entity()
@Index(["conversation_id", "asset_id"])
export class asset_send extends BaseTable {
  @ManyToOne(() => customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id" })
  customer: customer;

  @Column({ type: "uuid" })
  @Index()
  customer_id: string;

  @Column({ type: "uuid", nullable: true })
  conversation_id: string | null;

  @ManyToOne(() => approved_asset, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "asset_id" })
  asset: approved_asset;

  @Column({ type: "uuid" })
  asset_id: string;

  @Column()
  kind: string;

  @Column({ type: "varchar", nullable: true })
  wa_message_id: string | null;

  @Column({ type: "varchar", nullable: true })
  source: string | null;
}
