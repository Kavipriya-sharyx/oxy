import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedPlanActivationDetails1794740000000 implements MigrationInterface {
  name = "SeedPlanActivationDetails1794740000000";

  public async up(q: QueryRunner): Promise<void> {
    // 1. Cut Medi Bills (monthly & yearly)
    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/cut-medi-bills-monthly',
        "renewal_terms" = COALESCE("renewal_terms", 'Renews every month until you cancel. A notice is sent before each renewal charge.'),
        "activation_time" = COALESCE("activation_time", '5 to 10 working days'),
        "auto_renews" = true,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'cut_medi_bills' AND "billing" = 'monthly';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/cut-medi-bills-annual',
        "renewal_terms" = COALESCE("renewal_terms", 'One-time payment, valid for one year, no automatic renewal.'),
        "activation_time" = COALESCE("activation_time", '5 to 10 working days'),
        "auto_renews" = false,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'cut_medi_bills' AND "billing" = 'yearly';
    `);

    // 2. Oxxy Everyday
    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/everyday-monthly',
        "renewal_terms" = 'Renews every month until you cancel. A notice is sent before each renewal charge.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = true,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'everyday' AND "billing" = 'monthly';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/everyday-annual',
        "renewal_terms" = 'One-time payment, valid for one year, no automatic renewal.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = false,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'everyday' AND "billing" = 'yearly';
    `);

    // 3. Oxxy Vital
    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/vital-monthly',
        "renewal_terms" = 'Renews every month until you cancel. A notice is sent before each renewal charge.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = true,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'vital' AND "billing" = 'monthly';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/vital-annual',
        "renewal_terms" = 'One-time payment, valid for one year, no automatic renewal.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = false,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'vital' AND "billing" = 'yearly';
    `);

    // 4. Oxxy Thrive
    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/thrive-monthly',
        "renewal_terms" = 'Renews every month until you cancel. A notice is sent before each renewal charge.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = true,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'thrive' AND "billing" = 'monthly';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/thrive-annual',
        "renewal_terms" = 'One-time payment, valid for one year, no automatic renewal.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = false,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'thrive' AND "billing" = 'yearly';
    `);

    // 5. Oxxy Infinity
    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/infinity-monthly',
        "renewal_terms" = 'Renews every month until you cancel. A notice is sent before each renewal charge.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = true,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'infinity' AND "billing" = 'monthly';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET
        "activation_link" = 'https://www.oxxy.in/activate/infinity-annual',
        "renewal_terms" = 'One-time payment, valid for one year, no automatic renewal.',
        "activation_time" = '5 to 10 working days',
        "auto_renews" = false,
        "version" = "version" + 1,
        "updated_on" = now()
      WHERE "product" = 'oxxy' AND "plan" = 'infinity' AND "billing" = 'yearly';
    `);

    // 6. Record audit entries in plan_change
    await q.query(`
      INSERT INTO "plan_change" (
        "id", "status", "created_on", "catalog_id", "changes", "before", "reason",
        "change_status", "requested_by_id", "created_by_id", "decided_at", "applied_version"
      )
      SELECT
        uuid_generate_v4(),
        true,
        now(),
        p.id,
        json_build_object(
          'activation_link', p.activation_link,
          'renewal_terms', p.renewal_terms,
          'activation_time', p.activation_time,
          'auto_renews', p.auto_renews
        ),
        NULL,
        'Configured go-live activation details: official activation link, renewal terms, and activation time',
        'applied',
        '60edea02-c83e-4b38-b7b7-3b8199ad2b03',
        '60edea02-c83e-4b38-b7b7-3b8199ad2b03',
        now(),
        p.version
      FROM "plan_catalog" p
      WHERE p.status = true;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "plan_catalog"
      SET "activation_link" = NULL
      WHERE "activation_link" ILIKE '%oxxy.in/activate%';
    `);
  }
}

