import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Changes feed for a CRM that pulls (GET /api/v1/Actions/Changes): every bot change the CRM should copy, in
// order. seq is the cursor: the CRM keeps the last seq it read and asks for the ones after it.
@Entity()
@Index("change_event_created", ["created_on"])
export class change_event extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  seq: string; // bigint comes back as a string

  @Column()
  type: string; // booking.created, booking.confirmed, task.created, customer.updated …

  @Column({ type: "uuid", nullable: true })
  @Index()
  customer_id: string | null;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown>;

  @Column({ type: "timestamp", default: () => "now()" })
  created_on: Date;
}
