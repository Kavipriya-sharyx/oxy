import { MigrationInterface, QueryRunner } from "typeorm";

// Google Geocoding results (area / address text -> point), so the same area is looked up once.
// centre.address: the street address the team types; the point is worked out from it.
export class GeoCache1794680000000 implements MigrationInterface {
  name = "GeoCache1794680000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "geo_cache" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', ` +
        `"created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, ` +
        `"query" character varying(200) NOT NULL, "found" boolean NOT NULL DEFAULT true, "latitude" double precision, "longitude" double precision, ` +
        `"formatted" text, "locality" character varying, "city" character varying, "approximate" boolean NOT NULL DEFAULT false, ` +
        `CONSTRAINT "PK_geo_cache" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE UNIQUE INDEX "IDX_geo_cache_query" ON "geo_cache" ("query")`);
    await q.query(`ALTER TABLE "centre" ADD "address" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "centre" DROP COLUMN "address"`);
    await q.query(`DROP INDEX "IDX_geo_cache_query"`);
    await q.query(`DROP TABLE "geo_cache"`);
  }
}
