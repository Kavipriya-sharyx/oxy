import { MigrationInterface, QueryRunner } from "typeorm";

// api_request_log: every call to the Oxxy API by the client's CRM / voice agent (Super Admin: Developer > API
// logs). message.error_reason: why WhatsApp did not deliver a message (shown in Conversations).
export class ApiRequestLog1794700000000 implements MigrationInterface {
  name = "ApiRequestLog1794700000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "api_request_log" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "created_on" TIMESTAMP NOT NULL DEFAULT now(),
      "method" character varying(10) NOT NULL,
      "path" character varying(300) NOT NULL,
      "endpoint" character varying(200) NOT NULL,
      "status_code" integer NOT NULL,
      "duration_ms" integer NOT NULL,
      "key_id" character varying,
      "key_label" character varying(160) NOT NULL,
      "ip" character varying(64),
      "user_agent" character varying(200),
      "error_message" text,
      "detail" jsonb,
      CONSTRAINT "PK_api_request_log_id" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "api_request_log_created" ON "api_request_log" ("created_on")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_api_request_log_endpoint" ON "api_request_log" ("endpoint")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_api_request_log_status" ON "api_request_log" ("status_code")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_api_request_log_key" ON "api_request_log" ("key_id")`,
    );
    await q.query(`ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "error_reason" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "message" DROP COLUMN IF EXISTS "error_reason"`);
    await q.query(`DROP TABLE IF EXISTS "api_request_log"`);
  }
}
