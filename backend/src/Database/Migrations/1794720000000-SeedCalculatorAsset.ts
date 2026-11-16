import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedCalculatorAsset1794720000000 implements MigrationInterface {
  name = "SeedCalculatorAsset1794720000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "approved_asset" (
        "id", "status", "created_on", "code", "kind", "title", "url", "language", "trigger_id", "template_name", "approved"
      ) VALUES
        (uuid_generate_v4(), true, now(), 'calculator_en', 'website', 'See how much you can save', 'https://www.oxxy.in/plan_calculator', 'en', 'C', NULL, true)
      ON CONFLICT ("code") DO UPDATE SET
        "kind" = EXCLUDED."kind",
        "title" = EXCLUDED."title",
        "url" = EXCLUDED."url",
        "language" = EXCLUDED."language",
        "trigger_id" = EXCLUDED."trigger_id",
        "template_name" = EXCLUDED."template_name",
        "approved" = EXCLUDED."approved",
        "updated_on" = now();
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM "approved_asset"
      WHERE "code" = 'calculator_en';
    `);
  }
}

