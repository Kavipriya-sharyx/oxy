import { MigrationInterface, QueryRunner } from "typeorm";

// Review of the 17-19 Nov work (20 Nov):
// 1. The centre search saved Google Maps places and LLM-named hospitals as verified, private directory centres
//    (no verified_at, no verification_source). Only a person may verify a centre (Playbook 10.1): those rows are
//    switched back to unverified, so the bot no longer suggests or books them until the team checks them on the
//    Centres page. Centres added in the console or by CSV always get verified_at, so they are not touched.
// 2. Migration SeedPlanActivationDetails set the Cut Medi Bills activation links to
//    https://www.oxxy.in/activate/cut-medi-bills-monthly / -annual, which answer 404 (checked 20 Nov). A broken
//    payment link must never be sent: the link is cleared when it is still that value, so the plan is "not ready"
//    (the team takes over) until the real link is entered on the Plans page.
const BROKEN_LINKS = [
  "https://www.oxxy.in/activate/cut-medi-bills-monthly",
  "https://www.oxxy.in/activate/cut-medi-bills-annual",
];
const AUTO_NOTE =
  "auto-added by the bot from Google Maps / AI (17-19 Nov), not checked by a person";

export class ReviewFixesCentresAndLinks1794760000000 implements MigrationInterface {
  name = "ReviewFixesCentresAndLinks1794760000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE "centre" SET "verified" = false, "verification_source" = $1
        WHERE "verified" = true AND "verified_at" IS NULL AND "verification_source" IS NULL`,
      [AUTO_NOTE],
    );
    await q.query(
      `UPDATE "plan_catalog" SET "activation_link" = NULL, "version" = "version" + 1, "updated_on" = now()
        WHERE "product" = 'cut_medi_bills' AND "activation_link" = ANY($1)`,
      [BROKEN_LINKS],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE "centre" SET "verified" = true, "verification_source" = NULL WHERE "verification_source" = $1`,
      [AUTO_NOTE],
    );
    await q.query(
      `UPDATE "plan_catalog" SET "activation_link" = CASE "billing" WHEN 'monthly' THEN $1 ELSE $2 END
        WHERE "product" = 'cut_medi_bills' AND "activation_link" IS NULL`,
      BROKEN_LINKS,
    );
  }
}
