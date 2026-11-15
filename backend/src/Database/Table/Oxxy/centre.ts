import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseTable } from "../BaseTable";

@Entity()
export class centre extends BaseTable {
  @Column()
  name: string;

  @Column({ nullable: true })
  branch: string;

  @Column({ nullable: true })
  locality: string;

  @Column()
  city: string;

  @Column({ type: "double precision" })
  latitude: number;

  @Column({ type: "double precision" })
  longitude: number;

  @Column({ nullable: true })
  centre_type: string;

  @Column({ type: "simple-array", nullable: true })
  specialisations: string[];

  @Column({ default: true })
  is_private: boolean;

  @Column({ default: false })
  verified: boolean;

  @Column({ type: "date", nullable: true })
  verified_at: string;

  @Column({ default: true })
  active: boolean;

  @Column({ type: "text", nullable: true }) // who verified it (site visit, phone call, registry ...)
  verification_source: string | null;

  @Column({ type: "varchar", nullable: true })
  postcode: string | null;

  // street address as the team typed it; the point on the map is worked out from it (Google Geocoding)
  @Column({ type: "text", nullable: true })
  address: string | null;

  // how to reach the centre, and when it is open (free text, e.g. "Mon-Sat 9am-6pm")
  @Column({ type: "varchar", nullable: true })
  phone: string | null;

  @Column({ type: "text", nullable: true })
  opening_hours: string | null;
}
