import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedApprovedAssets1794710000000 implements MigrationInterface {
  name = "SeedApprovedAssets1794710000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "approved_asset" (
        "id", "status", "created_on", "code", "kind", "title", "url", "language", "trigger_id", "template_name", "approved"
      ) VALUES
        (uuid_generate_v4(), true, now(), 'trust_stories_en', 'testimonial', 'Oxxy customer stories', 'https://www.oxxy.in/customer_stories', 'en', 'A', NULL, true),
        (uuid_generate_v4(), true, now(), 'trust_news_en', 'article', 'Oxxy in the news', 'https://www.oxxy.in/media_article', 'en', 'A', NULL, true),
        (uuid_generate_v4(), true, now(), 'proof_stories_en', 'testimonial', 'Oxxy customer stories', 'https://www.oxxy.in/customer_stories', 'en', 'L', NULL, true),
        (uuid_generate_v4(), true, now(), 'proof_news_en', 'article', 'Oxxy in the news', 'https://www.oxxy.in/media_article', 'en', 'L', NULL, true)
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
      WHERE "code" IN ('trust_stories_en', 'trust_news_en', 'proof_stories_en', 'proof_news_en');
    `);
  }
}
