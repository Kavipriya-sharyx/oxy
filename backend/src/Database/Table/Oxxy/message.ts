import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { conversation } from "./conversation";

@Entity()
export class message extends BaseTable {
  @ManyToOne(() => conversation, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "conversation_id" })
  conversation: conversation;

  @Column({ type: "uuid" })
  @Index()
  conversation_id: string;

  @Column() // in | out
  direction: string;

  @Column() // customer | bot | agent
  sender: string;

  @Column({ nullable: true, unique: true })
  wa_message_id: string;

  @Column({ type: "text", nullable: true })
  body: string;

  @Column({ nullable: true })
  template_name: string;

  @Column({ default: "received" })
  message_status: string;
}
