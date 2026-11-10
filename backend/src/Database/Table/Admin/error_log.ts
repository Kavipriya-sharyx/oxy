/**
 * @author VarunAnand
 */
import { Column, Entity } from "typeorm";
import { BaseTable } from "../BaseTable";

@Entity()
export class error_log extends BaseTable {
  @Column()
  url: string;

  @Column()
  ipaddress: string;

  @Column({ type: "text" })
  message: string;

  @Column({ nullable: true })
  created_by_name: string;
}
