import { MigrationInterface, QueryRunner } from "typeorm";

// The voice AI shares the call's details when it starts the WhatsApp chat (StartConversation context).
export class CallContext1794670000000 implements MigrationInterface {
  name = "CallContext1794670000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "call_context" text`);
    await q.query(
      `ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "call_context_at" TIMESTAMP`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "conversation" DROP COLUMN IF EXISTS "call_context_at"`);
    await q.query(`ALTER TABLE "conversation" DROP COLUMN IF EXISTS "call_context"`);
  }
}
