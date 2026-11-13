import { Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// WhatsApp message templates the bot sends outside the 24-hour window (Playbook 15.1, 18) and their status
// in Meta. A send of a template marked rejected / paused / disabled is refused before it reaches Meta.
@Entity()
@Index("IDX_wa_template_name_language", ["name", "language"], { unique: true })
export class wa_template extends BaseTable {
  @Column()
  name: string;

  @Column({ default: "en" })
  language: string;

  @Column({ type: "varchar", nullable: true }) // UTILITY | MARKETING | AUTHENTICATION
  category: string | null;

  @Column({ type: "text", nullable: true }) // what the bot uses it for
  purpose: string | null;

  @Column({ default: "draft" }) // draft | submitted | approved | rejected | paused | disabled
  meta_status: string;

  @Column({ type: "varchar", nullable: true })
  meta_id: string | null;

  @Column({ type: "timestamp", nullable: true })
  last_synced_at: Date | null;

  @Column({ type: "text", nullable: true })
  note: string | null;
}
