import { MigrationInterface, QueryRunner } from "typeorm";

// Go-live: no sample or placeholder data stays in the database.
//  - plan_catalog: example.com activation links and "[CONFIRM] ..." texts become empty (the bot then hands
//    that plan to the team instead of quoting it; the real values are entered in the console, Plans).
//  - approved_asset: the five example.com development items are removed (kept, unapproved, if ever sent).
//  - centre: the five "Sample ..." centres are removed (kept, inactive and unverified, if a booking,
//    an eligibility check or a need points at one).
// Only the known seeded rows are touched; nothing a person entered.
const SAMPLE_CENTRES = ["Sample Care Hospital", "Sample Diagnostics", "Sample Dental Clinic", "Sample Multispeciality", "Sample Eye Centre"];

export class RemoveSampleData1794630000000 implements MigrationInterface {
  name = "RemoveSampleData1794630000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "plan_catalog" SET "activation_link" = NULL WHERE "activation_link" ILIKE '%example.com%'`);
    await q.query(`UPDATE "plan_catalog" SET "renewal_terms" = NULL WHERE "renewal_terms" ILIKE '%[CONFIRM%'`);
    await q.query(`UPDATE "plan_catalog" SET "activation_time" = NULL WHERE "activation_time" ILIKE '%[CONFIRM%'`);

    await q.query(
      `UPDATE "approved_asset" SET "approved" = false, "approved_by_id" = NULL
       WHERE "url" ILIKE '%example.com%' AND "id" IN (SELECT "asset_id" FROM "asset_send")`,
    );
    await q.query(
      `DELETE FROM "approved_asset" WHERE "url" ILIKE '%example.com%' AND "id" NOT IN (SELECT "asset_id" FROM "asset_send")`,
    );

    const used = `(
      SELECT "centre_id" FROM "booking_request" WHERE "centre_id" IS NOT NULL
      UNION SELECT "centre_id" FROM "eligibility" WHERE "centre_id" IS NOT NULL
      UNION SELECT "preferred_centre_id" FROM "need" WHERE "preferred_centre_id" IS NOT NULL
    )`;
    await q.query(`UPDATE "centre" SET "active" = false, "verified" = false WHERE "name" = ANY($1) AND "id" IN ${used}`, [SAMPLE_CENTRES]);
    await q.query(`DELETE FROM "centre" WHERE "name" = ANY($1) AND "id" NOT IN ${used}`, [SAMPLE_CENTRES]);
  }

  public async down(): Promise<void> {
    // sample data is not brought back
  }
}
