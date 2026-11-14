import { MigrationInterface, QueryRunner } from "typeorm";

// Playbook 4.1: the consented outbound lead's first message is an approved template with three quick-reply
// buttons (Yes, please / Just send details / Not now) and the footer "Reply STOP to opt out".
export class LeadIntroTemplate1794620000000 implements MigrationInterface {
  name = "LeadIntroTemplate1794620000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', 'MARKETING', $2)
       ON CONFLICT DO NOTHING`,
      ["lead_intro", "Playbook 4.1: first message to a consented outbound lead (3 quick-reply buttons)"],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "wa_template" WHERE "name" = 'lead_intro'`);
  }
}
