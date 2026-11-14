import { Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// Keys for the Actions API (CRM, voice AI), made in the console's Developer page. Only the SHA-256 hash is
// stored; the key itself is shown once when it is made.
@Entity()
export class api_key extends BaseTable {
  @Column()
  name: string;

  // first characters of the key, e.g. "oxk_live_Ab3d", to tell keys apart in the list
  @Column()
  prefix: string;

  @Index({ unique: true })
  @Column({ select: false })
  key_hash: string;

  @Column({ type: "varchar", nullable: true })
  created_by_name: string | null;

  @Column({ type: "timestamp", default: () => "now()" })
  issued_at: Date;

  @Column({ type: "timestamp", nullable: true })
  expires_at: Date | null;

  @Column({ type: "timestamp", nullable: true })
  last_used_at: Date | null;

  @Column({ type: "timestamp", nullable: true })
  revoked_at: Date | null;
}
