import { MigrationInterface, QueryRunner } from "typeorm";

// Human takeover (Full Plan 12.9): who took the chat over, who handed it back, and the hand-back note
// the bot reads on the next turns.
export class TakeoverHandback1794600000000 implements MigrationInterface {
  name = "TakeoverHandback1794600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversation" ADD "taken_over_by_id" character varying`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "taken_over_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "handed_back_by_id" character varying`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "handed_back_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "handback_note" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "handback_note"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "handed_back_at"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "handed_back_by_id"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "taken_over_at"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "taken_over_by_id"`);
  }
}
