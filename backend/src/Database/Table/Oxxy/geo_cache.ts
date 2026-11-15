import { Column, Entity, Index } from "typeorm";
import { BaseTable } from "../BaseTable";

// One row per area / address text that was looked up in Google Geocoding ("peelamedu coimbatore").
// Holds place names only, never anything about a customer. A text Google could not find is kept too
// (found = false) so it is not asked again.
@Entity()
export class geo_cache extends BaseTable {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 200 })
  query: string;

  @Column({ default: true })
  found: boolean;

  @Column({ type: "double precision", nullable: true })
  latitude: number | null;

  @Column({ type: "double precision", nullable: true })
  longitude: number | null;

  @Column({ type: "text", nullable: true })
  formatted: string | null;

  @Column({ type: "varchar", nullable: true })
  locality: string | null;

  @Column({ type: "varchar", nullable: true })
  city: string | null;

  @Column({ default: false })
  approximate: boolean;
}
