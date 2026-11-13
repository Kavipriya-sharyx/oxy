import { MigrationInterface, QueryRunner } from "typeorm";

// Cut Medi Bills gate (Full Plan 6.1, 8.2, 12.3): eligibility is checked per conversation for the centre
// of the one upcoming expense, which may not be in the directory yet. need.need_pattern feeds routing.
export class CutMediBillsGate1794588457213 implements MigrationInterface {
  name = "CutMediBillsGate1794588457213";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "need" ADD "need_pattern" character varying`);
    await queryRunner.query(`ALTER TABLE "eligibility" ADD "conversation_id" uuid`);
    await queryRunner.query(`ALTER TABLE "eligibility" ADD "centre_name" text`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_3f131e3ea95e95c17af672ed42"`);
    await queryRunner.query(`ALTER TABLE "eligibility" ALTER COLUMN "centre_id" DROP NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_d5718c8e307c4b763688858242" ON "eligibility" ("conversation_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "eligibility" ADD CONSTRAINT "FK_d5718c8e307c4b763688858242d" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "eligibility" DROP CONSTRAINT "FK_d5718c8e307c4b763688858242d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d5718c8e307c4b763688858242"`);
    await queryRunner.query(`DELETE FROM "eligibility" WHERE "centre_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "eligibility" ALTER COLUMN "centre_id" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3f131e3ea95e95c17af672ed42" ON "eligibility" ("centre_id", "customer_id") `,
    );
    await queryRunner.query(`ALTER TABLE "eligibility" DROP COLUMN "centre_name"`);
    await queryRunner.query(`ALTER TABLE "eligibility" DROP COLUMN "conversation_id"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "need_pattern"`);
  }
}
