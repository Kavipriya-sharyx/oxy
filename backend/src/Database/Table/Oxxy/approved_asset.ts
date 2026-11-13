import { Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// Content the bot may send (Playbook 17.1 send_approved_asset, 18.1). Nothing else is ever sent as an
// asset: no model-written links, no unapproved media.
@Entity()
export class approved_asset extends BaseTable {
  @Column({ unique: true }) // e.g. "trust_pack_en", "insurance_vs_oxxy"
  code: string;

  @Column() // document | comparison | media | testimonial | policy | website | article
  kind: string;

  @Column()
  title: string;

  @Column({ type: "text" })
  url: string;

  @Column({ default: "en" }) // en | hi | hinglish
  language: string;

  @Column({ type: "varchar", nullable: true }) // trigger it belongs to, A-R
  @Index()
  trigger_id: string | null;

  @Column({ type: "varchar", nullable: true }) // approved WhatsApp template for sends outside 24 hours
  template_name: string | null;

  @Column({ default: false })
  approved: boolean;

  @Column({ type: "varchar", nullable: true })
  approved_by_id: string | null;

  @Column({ type: "timestamp", nullable: true }) // asset freshness: not sent after this
  valid_to: Date | null;
}
