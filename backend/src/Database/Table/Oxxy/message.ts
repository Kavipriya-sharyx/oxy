import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";
import { conversation } from "./conversation";

@Entity()
// at most one outbound reply per inbound message (backstop for the check in the pipeline)
@Index("uq_message_reply_to", ["reply_to_wa_message_id"], {
  unique: true,
  where: '"reply_to_wa_message_id" IS NOT NULL',
})
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

  @Column({ type: "text", nullable: true })
  reply_to_wa_message_id: string | null; // outbound only: the inbound wamid this answers

  @Column({ default: "text" }) // text | image | audio | location | interactive ...
  type: string;

  @Column({ type: "timestamp", nullable: true })
  wa_timestamp: Date | null; // time from the WhatsApp payload

  @Column({ default: "received" })
  message_status: string;
}
