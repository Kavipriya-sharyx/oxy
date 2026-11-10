import { Column, Entity } from "typeorm";
import { BaseTable } from "@Database/Table/BaseTable";

@Entity()
export class audit_log extends BaseTable {
  @Column()
  performed_action: string;

  @Column()
  performed_by: string;

  @Column()
  performed_by_id: string;

  @Column()
  performed_module_name: string;

  @Column()
  performed_module_header_name: string;

  @Column()
  performed_module_id: string;

  @Column()
  performed_on: string;

  @Column()
  performed_type: string;

  @Column()
  performed_ipaddress: string;

  @Column({ type: "json" })
  performed_parameter: any;
}
