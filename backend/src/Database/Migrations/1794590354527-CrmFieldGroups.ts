import { MigrationInterface, QueryRunner } from "typeorm";

// Playbook 17 field groups (identity, need, location, provider, routing, activation, engagement, content,
// trigger events) and the tables behind the 17.1 actions: follow_up, approved_asset, asset_send.
export class CrmFieldGroups1794590354527 implements MigrationInterface {
  name = "CrmFieldGroups1794590354527";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "follow_up" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "conversation_id" uuid, "kind" character varying NOT NULL, "scheduled_for" TIMESTAMP NOT NULL, "reason" text, "selected_product" character varying, "template_name" character varying, "follow_up_status" character varying NOT NULL DEFAULT 'scheduled', "skip_reason" text, "source" character varying, CONSTRAINT "PK_5c0a5f5b32937e47e0ab09d596c" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_5c0a5f5b32937e47e0ab09d596" ON "follow_up" ("id") `);
    await queryRunner.query(`CREATE INDEX "IDX_249b89b27d850cd21b147e1e65" ON "follow_up" ("customer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_5f2e6713671aa953672d7edfcb" ON "follow_up" ("follow_up_status", "scheduled_for") `);
    await queryRunner.query(`CREATE TABLE "approved_asset" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "code" character varying NOT NULL, "kind" character varying NOT NULL, "title" character varying NOT NULL, "url" text NOT NULL, "language" character varying NOT NULL DEFAULT 'en', "trigger_id" character varying, "template_name" character varying, "approved" boolean NOT NULL DEFAULT false, "approved_by_id" character varying, "valid_to" TIMESTAMP, CONSTRAINT "UQ_736f7a2f7214647402c28f4737c" UNIQUE ("code"), CONSTRAINT "PK_ddeb8daf993d1e069df85613a4c" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_ddeb8daf993d1e069df85613a4" ON "approved_asset" ("id") `);
    await queryRunner.query(`CREATE INDEX "IDX_61efbaa634782a348c03e194f1" ON "approved_asset" ("trigger_id") `);
    await queryRunner.query(`CREATE TABLE "asset_send" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "conversation_id" uuid, "asset_id" uuid NOT NULL, "kind" character varying NOT NULL, "wa_message_id" character varying, "source" character varying, CONSTRAINT "PK_8c2c2067a9d69cc7e4516bccf90" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_8c2c2067a9d69cc7e4516bccf9" ON "asset_send" ("id") `);
    await queryRunner.query(`CREATE INDEX "IDX_13c251de03b524ad86e82edb37" ON "asset_send" ("customer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_3b45c5ea81474416367d55af03" ON "asset_send" ("conversation_id", "asset_id") `);
    await queryRunner.query(`ALTER TABLE "customer" ADD "lead_id" text`);
    await queryRunner.query(`ALTER TABLE "customer" ADD "timezone" character varying NOT NULL DEFAULT 'Asia/Kolkata'`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "recommendation_reason" text`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "alternate_product_suppressed" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "value_check_passed" boolean`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "last_intent" character varying`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "objection" text`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "follow_up_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "escalation_reason" text`);
    await queryRunner.query(`ALTER TABLE "conversation" ADD "outcome" character varying`);
    await queryRunner.query(`ALTER TABLE "need" ADD "urgency" character varying`);
    await queryRunner.query(`ALTER TABLE "need" ADD "condition_if_voluntary" text`);
    await queryRunner.query(`ALTER TABLE "need" ADD "postcode" character varying`);
    await queryRunner.query(`ALTER TABLE "need" ADD "preferred_centre_id" uuid`);
    await queryRunner.query(`ALTER TABLE "need" ADD "suggested_centre_ids" json`);
    await queryRunner.query(`ALTER TABLE "need" ADD "pre_existing" boolean`);
    await queryRunner.query(`ALTER TABLE "trigger_event" ADD "conversation_source" character varying NOT NULL DEFAULT 'whatsapp_inbound'`);
    await queryRunner.query(`ALTER TABLE "trigger_event" ADD "next_state" character varying`);
    await queryRunner.query(`ALTER TABLE "trigger_event" ADD "conversion_attribution" character varying`);
    await queryRunner.query(`ALTER TABLE "centre" ADD "verification_source" text`);
    await queryRunner.query(`ALTER TABLE "centre" ADD "postcode" character varying`);
    await queryRunner.query(`ALTER TABLE "task" ADD "reason" text`);
    await queryRunner.query(`ALTER TABLE "task" ADD "callback_from" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "task" ADD "callback_to" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "task" ADD "outcome" text`);
    await queryRunner.query(`ALTER TABLE "activation" ADD "price" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "activation" ADD "gst_rate" numeric(5,4)`);
    await queryRunner.query(`ALTER TABLE "activation" ADD "renewal_terms_shown" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "activation" ADD "trigger_path" text`);
    await queryRunner.query(`ALTER TABLE "follow_up" ADD CONSTRAINT "FK_249b89b27d850cd21b147e1e652" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "follow_up" ADD CONSTRAINT "FK_49aee8864f5c9f6cae9643b3751" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "asset_send" ADD CONSTRAINT "FK_13c251de03b524ad86e82edb370" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "asset_send" ADD CONSTRAINT "FK_92633e502fc9bcb95f359b151b1" FOREIGN KEY ("asset_id") REFERENCES "approved_asset"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "asset_send" DROP CONSTRAINT "FK_92633e502fc9bcb95f359b151b1"`);
    await queryRunner.query(`ALTER TABLE "asset_send" DROP CONSTRAINT "FK_13c251de03b524ad86e82edb370"`);
    await queryRunner.query(`ALTER TABLE "follow_up" DROP CONSTRAINT "FK_49aee8864f5c9f6cae9643b3751"`);
    await queryRunner.query(`ALTER TABLE "follow_up" DROP CONSTRAINT "FK_249b89b27d850cd21b147e1e652"`);
    await queryRunner.query(`ALTER TABLE "activation" DROP COLUMN "trigger_path"`);
    await queryRunner.query(`ALTER TABLE "activation" DROP COLUMN "renewal_terms_shown"`);
    await queryRunner.query(`ALTER TABLE "activation" DROP COLUMN "gst_rate"`);
    await queryRunner.query(`ALTER TABLE "activation" DROP COLUMN "price"`);
    await queryRunner.query(`ALTER TABLE "task" DROP COLUMN "outcome"`);
    await queryRunner.query(`ALTER TABLE "task" DROP COLUMN "callback_to"`);
    await queryRunner.query(`ALTER TABLE "task" DROP COLUMN "callback_from"`);
    await queryRunner.query(`ALTER TABLE "task" DROP COLUMN "reason"`);
    await queryRunner.query(`ALTER TABLE "centre" DROP COLUMN "postcode"`);
    await queryRunner.query(`ALTER TABLE "centre" DROP COLUMN "verification_source"`);
    await queryRunner.query(`ALTER TABLE "trigger_event" DROP COLUMN "conversion_attribution"`);
    await queryRunner.query(`ALTER TABLE "trigger_event" DROP COLUMN "next_state"`);
    await queryRunner.query(`ALTER TABLE "trigger_event" DROP COLUMN "conversation_source"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "pre_existing"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "suggested_centre_ids"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "preferred_centre_id"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "postcode"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "condition_if_voluntary"`);
    await queryRunner.query(`ALTER TABLE "need" DROP COLUMN "urgency"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "outcome"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "escalation_reason"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "follow_up_at"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "objection"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "last_intent"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "value_check_passed"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "alternate_product_suppressed"`);
    await queryRunner.query(`ALTER TABLE "conversation" DROP COLUMN "recommendation_reason"`);
    await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "timezone"`);
    await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "lead_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3b45c5ea81474416367d55af03"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_13c251de03b524ad86e82edb37"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8c2c2067a9d69cc7e4516bccf9"`);
    await queryRunner.query(`DROP TABLE "asset_send"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_61efbaa634782a348c03e194f1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ddeb8daf993d1e069df85613a4"`);
    await queryRunner.query(`DROP TABLE "approved_asset"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5f2e6713671aa953672d7edfcb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_249b89b27d850cd21b147e1e65"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5c0a5f5b32937e47e0ab09d596"`);
    await queryRunner.query(`DROP TABLE "follow_up"`);
  }
}
