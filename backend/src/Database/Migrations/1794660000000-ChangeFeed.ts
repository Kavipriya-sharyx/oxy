import { MigrationInterface, QueryRunner } from "typeorm";

// The client's CRM does not take calls from the bot; it pulls. change_event is the ordered feed it reads
// (GET /Actions/Changes), and confirmed_by_name keeps who confirmed a booking through the API.
export class ChangeFeed1794660000000 implements MigrationInterface {
  name = "ChangeFeed1794660000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "change_event" (
      "seq" BIGSERIAL NOT NULL,
      "type" character varying NOT NULL,
      "customer_id" uuid,
      "payload" jsonb NOT NULL,
      "created_on" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_change_event_seq" PRIMARY KEY ("seq"))`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "change_event_created" ON "change_event" ("created_on")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_change_event_customer" ON "change_event" ("customer_id")`,
    );
    await q.query(
      `ALTER TABLE "booking_request" ADD COLUMN IF NOT EXISTS "confirmed_by_name" character varying`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "booking_request" DROP COLUMN IF EXISTS "confirmed_by_name"`);
    await q.query(`DROP TABLE IF EXISTS "change_event"`);
  }
}
