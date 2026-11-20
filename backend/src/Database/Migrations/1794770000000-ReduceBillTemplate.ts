import { MigrationInterface, QueryRunner } from "typeorm";

// Client sequence 1 (20 Nov): the "Reduce Your Medical Bill Now" card as a Meta template
// (Helper/TemplateDefinitions.ts), listed on the WhatsApp templates page so its Meta status is tracked.
export class ReduceBillTemplate1794770000000 implements MigrationInterface {
  name = "ReduceBillTemplate1794770000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', 'MARKETING', $2)
       ON CONFLICT DO NOTHING`,
      [
        "oxxy_reduce_bill",
        "First card (client sequence 1): picture + up to 40% discount, Calculate discount / Learn More / Activate Oxxy",
      ],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "wa_template" WHERE "name" = 'oxxy_reduce_bill'`);
  }
}
