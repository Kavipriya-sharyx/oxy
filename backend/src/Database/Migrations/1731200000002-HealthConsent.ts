import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * DPDP health-data consent: proof of consent (timestamp + the wamid of the YES), refusal, and which
 * notice version was sent / agreed to / refused. Only adds nullable columns: existing rows are not changed.
 * An existing customer has no notice_version, so they are asked again under the current notice.
 *
 * Note: this migration lineage names the table "consents" (the entity is "consent", created by
 * DB_SYNC in dev). If your database came from DB_SYNC, the columns already exist.
 */
export class HealthConsent1731200000002 implements MigrationInterface {
  name = "HealthConsent1731200000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE consents ADD COLUMN IF NOT EXISTS notice_version          text;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS consent_timestamp       timestamptz;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS consent_source          text;   -- wamid of the YES message
ALTER TABLE consents ADD COLUMN IF NOT EXISTS health_refused_at       timestamptz;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS health_refused_version  text;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS notice_sent_at          timestamptz;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS notice_sent_version     text;
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE consents DROP COLUMN IF EXISTS notice_sent_version;
ALTER TABLE consents DROP COLUMN IF EXISTS notice_sent_at;
ALTER TABLE consents DROP COLUMN IF EXISTS health_refused_version;
ALTER TABLE consents DROP COLUMN IF EXISTS health_refused_at;
ALTER TABLE consents DROP COLUMN IF EXISTS consent_source;
ALTER TABLE consents DROP COLUMN IF EXISTS consent_timestamp;
`);
  }
}
