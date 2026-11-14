import { MigrationInterface, QueryRunner } from "typeorm";

// Developer page: Actions API keys made in the console (hash only), next to the ACTIONS_API_KEY env key.
export class ApiKeys1794650000000 implements MigrationInterface {
  name = "ApiKeys1794650000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "api_key" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "status" boolean NOT NULL DEFAULT true,
      "created_by_id" character varying,
      "created_on" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_by_id" character varying,
      "updated_on" TIMESTAMP,
      "name" character varying NOT NULL,
      "prefix" character varying NOT NULL,
      "key_hash" character varying NOT NULL,
      "created_by_name" character varying,
      "issued_at" TIMESTAMP NOT NULL DEFAULT now(),
      "expires_at" TIMESTAMP,
      "last_used_at" TIMESTAMP,
      "revoked_at" TIMESTAMP,
      CONSTRAINT "PK_api_key_id" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_api_key_id" ON "api_key" ("id")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_api_key_hash" ON "api_key" ("key_hash")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "api_key"`);
  }
}
