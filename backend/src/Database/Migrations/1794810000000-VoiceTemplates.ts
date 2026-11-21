import { MigrationInterface, QueryRunner } from "typeorm";

// The client's voice-call templates (21 Nov; Helper/TemplateDefinitions.ts, Service/Oxxy/VoiceTemplates.ts),
// listed on the WhatsApp templates page so their Meta status is tracked ("Sync from Meta" fills it in).
export class VoiceTemplates1794810000000 implements MigrationInterface {
  name = "VoiceTemplates1794810000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const [name, purpose] of [
      [
        "oxxy_verification_links",
        "Voice call: the customer asked for proof (testimonials, policies, news), sent during the call",
      ],
      [
        "plan_recommendation_status",
        "Voice call: the customer asked for the plan details; the recommended plan and why, sent during the call",
      ],
    ])
      await q.query(
        `INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', 'UTILITY', $2)
         ON CONFLICT DO NOTHING`,
        [name, purpose],
      );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM "wa_template" WHERE "name" IN ('oxxy_verification_links', 'plan_recommendation_status')`,
    );
  }
}
