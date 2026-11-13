import { MigrationInterface, QueryRunner } from "typeorm";

// Trigger dedupe is per decision journey (one conversation), not once per customer for life
// (Full Plan 6.1 trigger_events_dedupe, 12.6 "already sent in this decision journey").
export class TriggerEventPerJourney1794587659976 implements MigrationInterface {
  name = "TriggerEventPerJourney1794587659976";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_a91be845fc23b19ee2027a73eb"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_05d23f04bafd5d6a519108143b" ON "trigger_event" ("conversation_id", "trigger_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_05d23f04bafd5d6a519108143b"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a91be845fc23b19ee2027a73eb" ON "trigger_event" ("customer_id", "trigger_id") `,
    );
  }
}
