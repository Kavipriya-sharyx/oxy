import { MigrationInterface, QueryRunner } from "typeorm";

// Nightly jobs (CRM reconciliation, data retention), WhatsApp template status, two-person plan approval
// (Full Plan 3.4, 6.1, 8; Playbook 16.3).
const BASE =
  `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', ` +
  `"created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), ` +
  `"updated_by_id" character varying, "updated_on" TIMESTAMP`;

// The templates the bot already sends (CONTEXT.md). Status starts as draft until Meta approves them.
const TEMPLATES: [string, string, string][] = [
  ["booking_confirmed", "UTILITY", "The sales team confirmed the booking request (CRM booking.confirmed)"],
  ["booking_rescheduled", "UTILITY", "The booking moved to a new date or time (CRM booking.rescheduled)"],
  ["booking_cancelled", "UTILITY", "The booking was cancelled (CRM booking.cancelled)"],
  ["activation_confirmed", "UTILITY", "Payment verified, activation confirmed (CRM activation.paid)"],
  ["activation_reminder", "UTILITY", "Trigger Q: one reminder after the activation link, payment not completed"],
  ["agreed_follow_up", "UTILITY", "Trigger N: the follow-up the customer agreed to"],
  ["conversation_rescue_1", "MARKETING", "Playbook 15: first check-in after no reply"],
  ["conversation_rescue_2", "MARKETING", "Playbook 15: second and last check-in (pause message)"],
];

export class ConsoleOps1794610000000 implements MigrationInterface {
  name = "ConsoleOps1794610000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "job_run" (${BASE}, "kind" character varying NOT NULL, "job_status" character varying NOT NULL DEFAULT 'running', "started_at" TIMESTAMP NOT NULL, "finished_at" TIMESTAMP, "summary" json, "triggered_by_id" character varying, CONSTRAINT "PK_96fe0b041b8bc157dcec25bd8ef" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_96fe0b041b8bc157dcec25bd8e" ON "job_run" ("id")`);
    await q.query(`CREATE INDEX "IDX_job_run_kind_started" ON "job_run" ("kind", "started_at")`);

    await q.query(
      `CREATE TABLE "wa_template" (${BASE}, "name" character varying NOT NULL, "language" character varying NOT NULL DEFAULT 'en', "category" character varying, "purpose" text, "meta_status" character varying NOT NULL DEFAULT 'draft', "meta_id" character varying, "last_synced_at" TIMESTAMP, "note" text, CONSTRAINT "PK_9b42f17ad3c930be49fd5859d7c" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_9b42f17ad3c930be49fd5859d7" ON "wa_template" ("id")`);
    await q.query(`CREATE UNIQUE INDEX "IDX_wa_template_name_language" ON "wa_template" ("name", "language")`);
    for (const [name, category, purpose] of TEMPLATES) {
      await q.query(`INSERT INTO "wa_template" ("name", "language", "category", "purpose") VALUES ($1, 'en', $2, $3)`, [
        name,
        category,
        purpose,
      ]);
    }

    await q.query(
      `CREATE TABLE "plan_change" (${BASE}, "catalog_id" uuid NOT NULL, "changes" json NOT NULL, "before" json, "reason" text NOT NULL, "change_status" character varying NOT NULL DEFAULT 'pending', "requested_by_id" character varying NOT NULL, "decided_by_id" character varying, "decided_at" TIMESTAMP, "decision_note" text, "applied_version" integer, CONSTRAINT "PK_b7271d7954628f4ca0c20690db7" PRIMARY KEY ("id"), CONSTRAINT "CHK_plan_change_two_people" CHECK ("decided_by_id" IS NULL OR "change_status" = 'withdrawn' OR "decided_by_id" <> "requested_by_id"))`,
    );
    await q.query(`CREATE INDEX "IDX_b7271d7954628f4ca0c20690db" ON "plan_change" ("id")`);
    await q.query(`CREATE INDEX "IDX_plan_change_status" ON "plan_change" ("change_status")`);

    await q.query(`ALTER TABLE "consent" ADD "erased_at" TIMESTAMP`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "consent" DROP COLUMN "erased_at"`);
    await q.query(`DROP TABLE "plan_change"`);
    await q.query(`DROP TABLE "wa_template"`);
    await q.query(`DROP TABLE "job_run"`);
  }
}
