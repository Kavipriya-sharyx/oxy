import { Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// One page of the public Oxxy website (www.oxxy.in), read every night (Service/Ops/WebsiteKnowledge.service.ts).
// `passages` = the page's text in short pieces, cleaned: struck-out old prices and every price line removed (prices
// come only from plan_catalog). The bot uses the closest passages to answer questions the approved answers do not
// cover (client, 21 Nov). Public website text only, never anything about a customer.
@Entity()
export class website_page extends BaseTable {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 300 })
  url: string;

  @Column({ type: "varchar", length: 300, nullable: true })
  title: string | null;

  /** sha256 of the passages: a change shows on the console */
  @Column({ type: "varchar", length: 64, nullable: true })
  content_hash: string | null;

  @Column({ type: "jsonb", default: () => "'[]'" })
  passages: string[];

  @Column({ type: "timestamp", nullable: true })
  fetched_at: Date | null;

  /** when the text last changed (first read counts as a change) */
  @Column({ type: "timestamp", nullable: true })
  changed_at: Date | null;

  /** the last read failed (the previous passages are kept) */
  @Column({ type: "text", nullable: true })
  fetch_error: string | null;
}
