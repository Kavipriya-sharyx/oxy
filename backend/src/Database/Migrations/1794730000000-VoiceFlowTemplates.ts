import { MigrationInterface, QueryRunner } from "typeorm";

// Client, 17 Nov: the voice-aligned button flow. The cards of the client's current bot as Meta templates
// (Helper/TemplateDefinitions.ts), listed on the WhatsApp templates page so their Meta status is tracked.
const ROWS: [string, string, string][] = [
  ["oxxy_welcome", "MARKETING", "Welcome card (logo, client's welcome text): Get Started / Visit Our Website / Contact Us"],
  ["oxxy_verify_services", "MARKETING", "Trigger A: verify card with testimonials, news, website and policy links"],
  ["oxxy_savings_calculator", "MARKETING", "Trigger F: savings up to 30% of the yearly spend + website calculator"],
  ["oxxy_plan_recommendation", "MARKETING", "Trigger E: one plan, price + GST = payable, Activate / Add family / Expert"],
  ["oxxy_terms", "UTILITY", "Terms and conditions link before activation"],
];

export class VoiceFlowTemplates1794730000000 implements MigrationInterface {
  name = "VoiceFlowTemplates1794730000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const [name, category, purpose] of ROWS)
      await q.query(
        `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', $2, $3)
         ON CONFLICT DO NOTHING`,
        [name, category, purpose],
      );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "wa_template" WHERE "name" = ANY($1)`, [ROWS.map((r) => r[0])]);
  }
}
