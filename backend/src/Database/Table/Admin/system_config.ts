import { Column, Entity } from "typeorm";
import { BaseTable } from "../BaseTable";

@Entity()
export class system_config extends BaseTable {
  @Column({ unique: true })
  key: string;

  @Column({ type: "text", nullable: true })
  value: string | null;
}

