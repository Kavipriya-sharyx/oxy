import { MigrationInterface, QueryRunner } from "typeorm";

// A contact phone and opening hours on each centre, shown in the console directory.
export class CentreContact1794690000000 implements MigrationInterface {
  name = "CentreContact1794690000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "centre" ADD "phone" character varying`);
    await q.query(`ALTER TABLE "centre" ADD "opening_hours" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "centre" DROP COLUMN "opening_hours"`);
    await q.query(`ALTER TABLE "centre" DROP COLUMN "phone"`);
  }
}
