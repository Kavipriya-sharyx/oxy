import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateOfficialPlanActivationLinks1794750000000 implements MigrationInterface {
  name = "UpdateOfficialPlanActivationLinks1794750000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "plan_catalog"
      SET "activation_link" = 'https://www.oxxy.in/healthplan?plan_name=oxxy_everyday',
          "updated_on" = now(),
          "version" = "version" + 1
      WHERE "product" = 'oxxy' AND "plan" = 'everyday';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET "activation_link" = 'https://www.oxxy.in/healthplan?plan_name=oxxy_vital',
          "updated_on" = now(),
          "version" = "version" + 1
      WHERE "product" = 'oxxy' AND "plan" = 'vital';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET "activation_link" = 'https://www.oxxy.in/healthplan?plan_name=oxxy_thrive',
          "updated_on" = now(),
          "version" = "version" + 1
      WHERE "product" = 'oxxy' AND "plan" = 'thrive';
    `);

    await q.query(`
      UPDATE "plan_catalog"
      SET "activation_link" = 'https://www.oxxy.in/healthplan?plan_name=oxxy_infinity',
          "updated_on" = now(),
          "version" = "version" + 1
      WHERE "product" = 'oxxy' AND "plan" = 'infinity';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "plan_catalog" SET "activation_link" = 'https://www.oxxy.in/activate/everyday-annual' WHERE "product" = 'oxxy' AND "plan" = 'everyday';
      UPDATE "plan_catalog" SET "activation_link" = 'https://www.oxxy.in/activate/vital-annual' WHERE "product" = 'oxxy' AND "plan" = 'vital';
      UPDATE "plan_catalog" SET "activation_link" = 'https://www.oxxy.in/activate/thrive-annual' WHERE "product" = 'oxxy' AND "plan" = 'thrive';
      UPDATE "plan_catalog" SET "activation_link" = 'https://www.oxxy.in/activate/infinity-annual' WHERE "product" = 'oxxy' AND "plan" = 'infinity';
    `);
  }
}

