import { MigrationInterface, QueryRunner } from "typeorm";

// Learn More (20 Nov): the client's "Why Choose Oxxy Medical Discount Plans?" picture as a Meta template
// (Helper/TemplateDefinitions.ts), listed on the WhatsApp templates page so its Meta status is tracked.
export class LearnMoreTemplate1794790000000 implements MigrationInterface {
  name = "LearnMoreTemplate1794790000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', 'MARKETING', $2)
       ON CONFLICT DO NOTHING`,
      [
        "oxxy_learn_more",
        "Learn More: comparison picture (Oxxy vs regular health insurance), Calculate discount / Activate Oxxy / Main Menu",
      ],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "wa_template" WHERE "name" = 'oxxy_learn_more'`);
  }
}
