import { MigrationInterface, QueryRunner } from "typeorm";

// The public website's pages, read every night, for questions the approved answers do not cover (client, 21 Nov:
// "answer random questions from the content on oxxy.in"). Service/Ops/WebsiteKnowledge.service.ts.
export class WebsitePages1794800000000 implements MigrationInterface {
  name = "WebsitePages1794800000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "website_page" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" boolean NOT NULL DEFAULT '1', ` +
        `"created_by_id" character varying, "created_on" TIMESTAMP NOT NULL DEFAULT now(), "updated_by_id" character varying, "updated_on" TIMESTAMP, ` +
        `"url" character varying(300) NOT NULL, "title" character varying(300), "content_hash" character varying(64), ` +
        `"passages" jsonb NOT NULL DEFAULT '[]', "fetched_at" TIMESTAMP, "changed_at" TIMESTAMP, "fetch_error" text, ` +
        `CONSTRAINT "PK_website_page" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE UNIQUE INDEX "IDX_website_page_url" ON "website_page" ("url")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_website_page_url"`);
    await q.query(`DROP TABLE "website_page"`);
  }
}
