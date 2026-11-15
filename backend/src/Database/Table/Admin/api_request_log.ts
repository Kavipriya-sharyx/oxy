import { BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// One row per call to the Oxxy API (/api/v1/Actions/...) by the client's CRM or voice agent: who called (which
// key), what, the answer and how long it took. Super Admin reads it (Developer > API logs). No message text,
// health detail or full phone number is kept: only the field names sent and the last 4 digits.
@Entity()
@Index("api_request_log_created", ["created_on"])
export class api_request_log extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "timestamp", default: () => "now()" })
  created_on: Date;

  @Column({ type: "varchar", length: 10 })
  method: string;

  /** the path as called, ids included (no query string) */
  @Column({ type: "varchar", length: 300 })
  path: string;

  /** the endpoint, e.g. "POST /Actions/BookingRequests/:Id/Confirm" */
  @Index()
  @Column({ type: "varchar", length: 200 })
  endpoint: string;

  @Index()
  @Column({ type: "int" })
  status_code: number;

  @Column({ type: "int" })
  duration_ms: number;

  /** console key id; null = the server key (ACTIONS_API_KEY) or no valid key */
  @Index()
  @Column({ type: "varchar", nullable: true })
  key_id: string | null;

  /** "CRM production (oxk_ab12…)", "Server key (ACTIONS_API_KEY)", "No key", "Wrong key (oxk_zz99…)" */
  @Column({ type: "varchar", length: 160 })
  key_label: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  user_agent: string | null;

  /** the error message the caller got (4xx / 5xx) */
  @Column({ type: "text", nullable: true })
  error_message: string | null;

  /** safe summary: query, field names sent, source, wa_number last 4 digits */
  @Column({ type: "jsonb", nullable: true })
  detail: Record<string, unknown> | null;
}
