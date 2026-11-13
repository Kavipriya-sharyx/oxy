import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1794582977989 implements MigrationInterface {
  name = "Baseline1794582977989";

  // ONE schema: the entities (src/Database/Table). This migration creates them on an empty database.
  // A database that was made earlier with DB_SYNC=true already has the tables: then only the new
  // columns and the rules below are added. The rules are the hard rules of Full Development Plan 1.1.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    if (!(await queryRunner.hasTable("customer"))) {
      await this.createTables(queryRunner);
    } else {
      await queryRunner.query(
        `ALTER TABLE "plan_catalog" ADD COLUMN IF NOT EXISTS "illustration_pct" integer`,
      );
      await queryRunner.query(
        `ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "pending_action" character varying`,
      );
    }
    await this.addRules(queryRunner);
  }

  private async addRules(queryRunner: QueryRunner): Promise<void> {
    // booking date: today + 3 days up to the same date + 6 months, in Asia/Kolkata (month-end safe)
    await queryRunner.query(`
            CREATE OR REPLACE FUNCTION oxxy_check_booking_window() RETURNS trigger AS $$
            DECLARE today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
            BEGIN
              IF NEW.preferred_date < today + 3 OR NEW.preferred_date > (today + interval '6 months')::date THEN
                RAISE EXCEPTION 'preferred_date % is outside the booking window (% to %)',
                  NEW.preferred_date, today + 3, (today + interval '6 months')::date;
              END IF;
              RETURN NEW;
            END $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "booking_window" ON "booking_request"`);
    await queryRunner.query(
      `CREATE TRIGGER "booking_window" BEFORE INSERT ON "booking_request" FOR EACH ROW EXECUTE FUNCTION oxxy_check_booking_window()`,
    );
    // a booking is confirmed only by a person: a console user, or the sales team in the CRM
    await queryRunner.query(
      `ALTER TABLE "booking_request" DROP CONSTRAINT IF EXISTS "chk_booking_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" ADD CONSTRAINT "chk_booking_confirmed_by" CHECK ("booking_status" <> 'confirmed' OR "confirmed_by_id" IS NOT NULL OR "crm_booking_id" IS NOT NULL) NOT VALID`,
    );
    // one pending or active product per customer
    await queryRunner.query(`
            DO $$ BEGIN
              CREATE UNIQUE INDEX IF NOT EXISTS "uq_activation_one_open" ON "activation" ("customer_id")
                WHERE "activation_status" IN ('pending', 'link_sent', 'active');
            EXCEPTION WHEN unique_violation THEN
              RAISE NOTICE 'uq_activation_one_open not created: a customer already has two open products. Fix the data, then re-run.';
            END $$`);
    await queryRunner.query(
      `ALTER TABLE "plan_catalog" DROP CONSTRAINT IF EXISTS "chk_plan_price_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_catalog" ADD CONSTRAINT "chk_plan_price_positive" CHECK ("price" > 0) NOT VALID`,
    );
  }

  private async createTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customer" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "wa_number" character varying NOT NULL, "first_name" character varying, "language" character varying NOT NULL DEFAULT 'en', "age" integer, "active_product" character varying, "active_plan" character varying, "crm_customer_id" text, CONSTRAINT "UQ_420350583dce8fd5ec02c221bd5" UNIQUE ("wa_number"), CONSTRAINT "UQ_0ed850749190486eb92d5d2ed13" UNIQUE ("crm_customer_id"), CONSTRAINT "PK_a7a13f4cacb744524e44dfdad32" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_a7a13f4cacb744524e44dfdad3" ON "customer" ("id") `);
    await queryRunner.query(
      `CREATE TABLE "conversation" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "state" character varying NOT NULL DEFAULT 'new', "selected_product" character varying, "recommended_plan" character varying, "last_question" text, "last_customer_message_at" TIMESTAMP, "resume_state" character varying, "rescue_count" integer NOT NULL DEFAULT '0', "pending_action" character varying, "closed_at" TIMESTAMP, CONSTRAINT "PK_864528ec4274360a40f66c29845" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_864528ec4274360a40f66c2984" ON "conversation" ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8cb887e01c7aa9c10555da04af" ON "conversation" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_conversation_one_open" ON "conversation" ("customer_id") WHERE "closed_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_role" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "name" character varying NOT NULL, "code" character varying NOT NULL, "landing_page" character varying, "permission" json, CONSTRAINT "UQ_31f96f2013b7ac833d7682bf021" UNIQUE ("name"), CONSTRAINT "UQ_00c232124015d4998bdc6036310" UNIQUE ("code"), CONSTRAINT "PK_fb2e442d14add3cefbdf33c4561" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_fb2e442d14add3cefbdf33c456" ON "user_role" ("id") `);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "user_role_id" uuid NOT NULL, "first_name" text, "last_name" text, "email" character varying NOT NULL, "password" text NOT NULL, "mobile" character varying, "reset_otp" bigint, "crm_user_id" text, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "UQ_df1e28e11e9e35bfc529d5b4493" UNIQUE ("crm_user_id"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_cace4a159ff9f2512dd4237376" ON "user" ("id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_078f27c5e6a46cb1ab1b9fd463" ON "user" ("user_role_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "task" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "type" character varying NOT NULL, "task_status" character varying NOT NULL DEFAULT 'open', "priority" character varying NOT NULL DEFAULT 'normal', "customer_id" uuid, "conversation_id" uuid, "summary" text, "assigned_to_id" uuid, "due_at" TIMESTAMP, "crm_task_id" text, CONSTRAINT "UQ_adffbe4cb7a024e21b0dbe235bc" UNIQUE ("crm_task_id"), CONSTRAINT "PK_fb213f79ee45060ba925ecd576e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_fb213f79ee45060ba925ecd576" ON "task" ("id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_8f7047d35e0d94bc77df411a8c" ON "task" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fef96f8e8df1d8b00951e5855f" ON "task" ("conversation_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56caed544250017dfb635ac437" ON "task" ("assigned_to_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "message" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "conversation_id" uuid NOT NULL, "direction" character varying NOT NULL, "sender" character varying NOT NULL, "wa_message_id" character varying, "body" text, "template_name" character varying, "reply_to_wa_message_id" text, "type" character varying NOT NULL DEFAULT 'text', "wa_timestamp" TIMESTAMP, "message_status" character varying NOT NULL DEFAULT 'received', CONSTRAINT "UQ_2c8c1c716f28960af53ffa73c25" UNIQUE ("wa_message_id"), CONSTRAINT "PK_ba01f0a3e0123651915008bc578" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ba01f0a3e0123651915008bc57" ON "message" ("id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_7fe3e887d78498d9c9813375ce" ON "message" ("conversation_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_message_reply_to" ON "message" ("reply_to_wa_message_id") WHERE "reply_to_wa_message_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "trigger_event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "trigger_id" character varying NOT NULL, "customer_id" uuid NOT NULL, "conversation_id" uuid, "reason" text, "assets" json, "cta" character varying, "response" text, "suppression_reason" text, CONSTRAINT "PK_79bbc8c2af95776e801c7eaab11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_79bbc8c2af95776e801c7eaab1" ON "trigger_event" ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a99160799f2c6e8fcb56f956a9" ON "trigger_event" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a91be845fc23b19ee2027a73eb" ON "trigger_event" ("customer_id", "trigger_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_catalog" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "product" character varying NOT NULL, "plan" character varying NOT NULL, "billing" character varying NOT NULL, "price" integer NOT NULL, "gst_rate" numeric(4,2) NOT NULL DEFAULT '0.18', "auto_renews" boolean NOT NULL DEFAULT false, "renewal_terms" text, "max_saving_pct" integer, "illustration_pct" integer, "age_limit" integer, "activation_time" character varying, "activation_link" text, "version" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_c812ee062af4e78be76d984f828" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c812ee062af4e78be76d984f82" ON "plan_catalog" ("id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "centre" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "name" character varying NOT NULL, "branch" character varying, "locality" character varying, "city" character varying NOT NULL, "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "centre_type" character varying, "specialisations" text, "is_private" boolean NOT NULL DEFAULT true, "verified" boolean NOT NULL DEFAULT false, "verified_at" date, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_935b270f171eab8dc96443baeb3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_935b270f171eab8dc96443baeb" ON "centre" ("id") `);
    await queryRunner.query(
      `CREATE TABLE "eligibility" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "centre_id" uuid NOT NULL, "booking_state" character varying NOT NULL DEFAULT 'none', "registration_state" character varying NOT NULL DEFAULT 'none', "treatment_state" character varying NOT NULL DEFAULT 'none', "bill_state" character varying NOT NULL DEFAULT 'none', CONSTRAINT "PK_4e5d9c870807420abab30a05106" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e5d9c870807420abab30a0510" ON "eligibility" ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_575a249c26d9174ff2d89ee1fc" ON "eligibility" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_44c5274dec16937e64889bd5b3" ON "eligibility" ("centre_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3f131e3ea95e95c17af672ed42" ON "eligibility" ("customer_id", "centre_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "need" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "conversation_id" uuid NOT NULL, "beneficiary" character varying, "healthcare_need" text, "specialisation" text, "city" character varying, "locality" character varying, "travel_radius_km" integer, "service_date" date, "expected_bill" integer, "annual_medical_spend" integer, "insurance_status" text, CONSTRAINT "PK_218b14514f334ee6f39954f86ba" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_218b14514f334ee6f39954f86b" ON "need" ("id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_68503f7dd66b61b1d81a1ce892" ON "need" ("conversation_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "consent" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "whatsapp_consent" boolean NOT NULL DEFAULT false, "health_data_consent" boolean NOT NULL DEFAULT false, "marketing_consent" boolean NOT NULL DEFAULT false, "notice_version" character varying, "opt_out_at" TIMESTAMP, "consent_timestamp" TIMESTAMP, "consent_source" text, "health_refused_at" TIMESTAMP, "health_refused_version" text, "notice_sent_at" TIMESTAMP, "notice_sent_version" text, "retention_until" date, "privacy_request_at" TIMESTAMP, CONSTRAINT "PK_9115e8d6b082d4fc46d56134d29" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_9115e8d6b082d4fc46d56134d2" ON "consent" ("id") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_651019918a1e67dfdff40ffccf" ON "consent" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_consent_customer" ON "consent" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "booking_request" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "conversation_id" uuid NOT NULL, "centre_id" uuid NOT NULL, "specialisation" character varying, "preferred_date" date NOT NULL, "preferred_time" character varying, "booking_status" character varying NOT NULL DEFAULT 'pending_confirmation', "confirmed_by_id" uuid, "crm_booking_id" text, CONSTRAINT "UQ_a19a472bd1ec1a953b35879c35c" UNIQUE ("crm_booking_id"), CONSTRAINT "PK_aa4e0da4a49be8782cd00bf5a99" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aa4e0da4a49be8782cd00bf5a9" ON "booking_request" ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5aa03ad352c5f490dbdcc7eb4d" ON "booking_request" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b6b48c5f3a0e4110dfe532f13b" ON "booking_request" ("conversation_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c8ba5c54bc52d6b5a93e4e08d" ON "booking_request" ("centre_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_787fdcfbf77f360ea742062a1c" ON "booking_request" ("confirmed_by_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "crm_webhook_event" ("event_id" text NOT NULL, "event_type" text NOT NULL, "payload" jsonb NOT NULL, "received_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, "error" text, CONSTRAINT "PK_c383ab4c349a5890147d5bef0c7" PRIMARY KEY ("event_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "activation" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "customer_id" uuid NOT NULL, "catalog_id" uuid NOT NULL, "product" character varying NOT NULL, "plan" character varying NOT NULL, "billing" character varying NOT NULL, "link_sent_at" TIMESTAMP, "link_version" integer, "payment_status" character varying NOT NULL DEFAULT 'pending', "activation_status" character varying NOT NULL DEFAULT 'pending', "crm_activation_id" text, CONSTRAINT "UQ_cecb5fd0cedc87b33bb59f8ba34" UNIQUE ("crm_activation_id"), CONSTRAINT "PK_bb655734797dc39eddfa0fcca92" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb655734797dc39eddfa0fcca9" ON "activation" ("id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c0a34a013370cd142c827d7f21" ON "activation" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83708022c0c6e3f70d33325fd2" ON "activation" ("catalog_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_activation_one_active" ON "activation" ("customer_id") WHERE "activation_status" = 'active'`,
    );
    await queryRunner.query(
      `CREATE TABLE "crm_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action" character varying NOT NULL, "customer_id" uuid, "payload" jsonb NOT NULL, "sync_status" character varying NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP NOT NULL DEFAULT now(), "last_error" text, "crm_record_id" text, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "sent_at" TIMESTAMP, CONSTRAINT "PK_cfa20c2c7406a364720be1ad8e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a1ded647f1576c1a4b4434c95a" ON "crm_outbox" ("customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "crm_outbox_due" ON "crm_outbox" ("next_attempt_at") WHERE "sync_status" IN ('pending', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "system_config" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "key" character varying NOT NULL, "value" text, CONSTRAINT "UQ_eedd3cd0f227c7fb5eff2204e93" UNIQUE ("key"), CONSTRAINT "PK_db4e70ac0d27e588176e9bb44a0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_db4e70ac0d27e588176e9bb44a" ON "system_config" ("id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "error_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "url" character varying NOT NULL, "ipaddress" character varying NOT NULL, "message" text NOT NULL, "created_by_name" character varying, CONSTRAINT "PK_0284e7aa7afe77ea1ce1621c252" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_0284e7aa7afe77ea1ce1621c25" ON "error_log" ("id") `);
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', "created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, "performed_action" character varying NOT NULL, "performed_by" character varying NOT NULL, "performed_by_id" character varying NOT NULL, "performed_module_name" character varying NOT NULL, "performed_module_header_name" character varying NOT NULL, "performed_module_id" character varying NOT NULL, "performed_on" character varying NOT NULL, "performed_type" character varying NOT NULL, "performed_ipaddress" character varying NOT NULL, "performed_parameter" json NOT NULL, CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_07fefa57f7f5ab8fc3f52b3ed0" ON "audit_log" ("id") `);
    await queryRunner.query(
      `ALTER TABLE "conversation" ADD CONSTRAINT "FK_8cb887e01c7aa9c10555da04aff" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_078f27c5e6a46cb1ab1b9fd463b" FOREIGN KEY ("user_role_id") REFERENCES "user_role"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task" ADD CONSTRAINT "FK_8f7047d35e0d94bc77df411a8c6" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task" ADD CONSTRAINT "FK_fef96f8e8df1d8b00951e5855f2" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task" ADD CONSTRAINT "FK_56caed544250017dfb635ac4374" FOREIGN KEY ("assigned_to_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" ADD CONSTRAINT "FK_7fe3e887d78498d9c9813375ce2" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trigger_event" ADD CONSTRAINT "FK_a99160799f2c6e8fcb56f956a95" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trigger_event" ADD CONSTRAINT "FK_7fec32f6f77e9c02c67e7b20cb9" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eligibility" ADD CONSTRAINT "FK_575a249c26d9174ff2d89ee1fc0" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eligibility" ADD CONSTRAINT "FK_44c5274dec16937e64889bd5b3c" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "need" ADD CONSTRAINT "FK_68503f7dd66b61b1d81a1ce8925" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent" ADD CONSTRAINT "FK_651019918a1e67dfdff40ffccf2" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" ADD CONSTRAINT "FK_5aa03ad352c5f490dbdcc7eb4db" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" ADD CONSTRAINT "FK_b6b48c5f3a0e4110dfe532f13b9" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" ADD CONSTRAINT "FK_0c8ba5c54bc52d6b5a93e4e08db" FOREIGN KEY ("centre_id") REFERENCES "centre"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" ADD CONSTRAINT "FK_787fdcfbf77f360ea742062a1c3" FOREIGN KEY ("confirmed_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activation" ADD CONSTRAINT "FK_c0a34a013370cd142c827d7f21f" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activation" ADD CONSTRAINT "FK_83708022c0c6e3f70d33325fd24" FOREIGN KEY ("catalog_id") REFERENCES "plan_catalog"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "crm_outbox" ADD CONSTRAINT "FK_a1ded647f1576c1a4b4434c95a1" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "booking_window" ON "booking_request"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS oxxy_check_booking_window()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_activation_one_open"`);
    await queryRunner.query(
      `ALTER TABLE "crm_outbox" DROP CONSTRAINT "FK_a1ded647f1576c1a4b4434c95a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activation" DROP CONSTRAINT "FK_83708022c0c6e3f70d33325fd24"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activation" DROP CONSTRAINT "FK_c0a34a013370cd142c827d7f21f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" DROP CONSTRAINT "FK_787fdcfbf77f360ea742062a1c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" DROP CONSTRAINT "FK_0c8ba5c54bc52d6b5a93e4e08db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" DROP CONSTRAINT "FK_b6b48c5f3a0e4110dfe532f13b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_request" DROP CONSTRAINT "FK_5aa03ad352c5f490dbdcc7eb4db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consent" DROP CONSTRAINT "FK_651019918a1e67dfdff40ffccf2"`,
    );
    await queryRunner.query(`ALTER TABLE "need" DROP CONSTRAINT "FK_68503f7dd66b61b1d81a1ce8925"`);
    await queryRunner.query(
      `ALTER TABLE "eligibility" DROP CONSTRAINT "FK_44c5274dec16937e64889bd5b3c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eligibility" DROP CONSTRAINT "FK_575a249c26d9174ff2d89ee1fc0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trigger_event" DROP CONSTRAINT "FK_7fec32f6f77e9c02c67e7b20cb9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trigger_event" DROP CONSTRAINT "FK_a99160799f2c6e8fcb56f956a95"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" DROP CONSTRAINT "FK_7fe3e887d78498d9c9813375ce2"`,
    );
    await queryRunner.query(`ALTER TABLE "task" DROP CONSTRAINT "FK_56caed544250017dfb635ac4374"`);
    await queryRunner.query(`ALTER TABLE "task" DROP CONSTRAINT "FK_fef96f8e8df1d8b00951e5855f2"`);
    await queryRunner.query(`ALTER TABLE "task" DROP CONSTRAINT "FK_8f7047d35e0d94bc77df411a8c6"`);
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "FK_078f27c5e6a46cb1ab1b9fd463b"`);
    await queryRunner.query(
      `ALTER TABLE "conversation" DROP CONSTRAINT "FK_8cb887e01c7aa9c10555da04aff"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_07fefa57f7f5ab8fc3f52b3ed0"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0284e7aa7afe77ea1ce1621c25"`);
    await queryRunner.query(`DROP TABLE "error_log"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_db4e70ac0d27e588176e9bb44a"`);
    await queryRunner.query(`DROP TABLE "system_config"`);
    await queryRunner.query(`DROP INDEX "public"."crm_outbox_due"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a1ded647f1576c1a4b4434c95a"`);
    await queryRunner.query(`DROP TABLE "crm_outbox"`);
    await queryRunner.query(`DROP INDEX "public"."uq_activation_one_active"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_83708022c0c6e3f70d33325fd2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c0a34a013370cd142c827d7f21"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bb655734797dc39eddfa0fcca9"`);
    await queryRunner.query(`DROP TABLE "activation"`);
    await queryRunner.query(`DROP TABLE "crm_webhook_event"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_787fdcfbf77f360ea742062a1c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0c8ba5c54bc52d6b5a93e4e08d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b6b48c5f3a0e4110dfe532f13b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5aa03ad352c5f490dbdcc7eb4d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_aa4e0da4a49be8782cd00bf5a9"`);
    await queryRunner.query(`DROP TABLE "booking_request"`);
    await queryRunner.query(`DROP INDEX "public"."uq_consent_customer"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_651019918a1e67dfdff40ffccf"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9115e8d6b082d4fc46d56134d2"`);
    await queryRunner.query(`DROP TABLE "consent"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_68503f7dd66b61b1d81a1ce892"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_218b14514f334ee6f39954f86b"`);
    await queryRunner.query(`DROP TABLE "need"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3f131e3ea95e95c17af672ed42"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_44c5274dec16937e64889bd5b3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_575a249c26d9174ff2d89ee1fc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4e5d9c870807420abab30a0510"`);
    await queryRunner.query(`DROP TABLE "eligibility"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_935b270f171eab8dc96443baeb"`);
    await queryRunner.query(`DROP TABLE "centre"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c812ee062af4e78be76d984f82"`);
    await queryRunner.query(`DROP TABLE "plan_catalog"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a91be845fc23b19ee2027a73eb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a99160799f2c6e8fcb56f956a9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_79bbc8c2af95776e801c7eaab1"`);
    await queryRunner.query(`DROP TABLE "trigger_event"`);
    await queryRunner.query(`DROP INDEX "public"."uq_message_reply_to"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7fe3e887d78498d9c9813375ce"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ba01f0a3e0123651915008bc57"`);
    await queryRunner.query(`DROP TABLE "message"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_56caed544250017dfb635ac437"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fef96f8e8df1d8b00951e5855f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8f7047d35e0d94bc77df411a8c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fb213f79ee45060ba925ecd576"`);
    await queryRunner.query(`DROP TABLE "task"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_078f27c5e6a46cb1ab1b9fd463"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cace4a159ff9f2512dd4237376"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fb2e442d14add3cefbdf33c456"`);
    await queryRunner.query(`DROP TABLE "user_role"`);
    await queryRunner.query(`DROP INDEX "public"."uq_conversation_one_open"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8cb887e01c7aa9c10555da04af"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_864528ec4274360a40f66c2984"`);
    await queryRunner.query(`DROP TABLE "conversation"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7a13f4cacb744524e44dfdad3"`);
    await queryRunner.query(`DROP TABLE "customer"`);
  }
}
