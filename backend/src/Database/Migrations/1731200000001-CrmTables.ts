import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Full Plan section 6.2: CRM links and the outbox / webhook tables.
 * Runs right after InitialSchema.
 */
export class CrmTables1731200000001 implements MigrationInterface {
  name = "CrmTables1731200000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- Link bot rows to CRM records
ALTER TABLE ops_users         ADD COLUMN crm_user_id       text UNIQUE;  -- sales team, mirrored from the CRM
ALTER TABLE customers         ADD COLUMN crm_customer_id   text UNIQUE;
ALTER TABLE booking_requests  ADD COLUMN crm_booking_id    text UNIQUE;
ALTER TABLE activations       ADD COLUMN crm_activation_id text UNIQUE;
ALTER TABLE tasks             ADD COLUMN crm_task_id       text UNIQUE;

CREATE TYPE crm_sync_status AS ENUM ('pending', 'sent', 'failed', 'dead');

-- Every CRM call, written in the same transaction as the bot change, then sent by a BullMQ worker
CREATE TABLE crm_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- also the Idempotency-Key header
  action          text NOT NULL,           -- create_booking_request, create_task, set_opt_out, ...
  customer_id     uuid REFERENCES customers(id),
  payload         jsonb NOT NULL,
  status          crm_sync_status NOT NULL DEFAULT 'pending',
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  crm_record_id   text,                    -- id the CRM returned
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX crm_outbox_due ON crm_outbox (next_attempt_at) WHERE status IN ('pending', 'failed');

-- Every CRM webhook, stored before processing; event_id makes a resend harmless
CREATE TABLE crm_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error        text
);
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DROP TABLE IF EXISTS crm_webhook_events, crm_outbox CASCADE;
DROP TYPE IF EXISTS crm_sync_status;
ALTER TABLE tasks            DROP COLUMN IF EXISTS crm_task_id;
ALTER TABLE activations      DROP COLUMN IF EXISTS crm_activation_id;
ALTER TABLE booking_requests DROP COLUMN IF EXISTS crm_booking_id;
ALTER TABLE customers        DROP COLUMN IF EXISTS crm_customer_id;
ALTER TABLE ops_users        DROP COLUMN IF EXISTS crm_user_id;
`);
  }
}
