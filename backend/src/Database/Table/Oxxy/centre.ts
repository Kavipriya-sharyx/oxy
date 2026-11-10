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

  @Column({ default: true })
  active: boolean;
}
