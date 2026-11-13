import { DataSource } from "typeorm";

// Standalone DataSource for the migration and seed CLI. The Nest app uses the same entities and
// migrations (app.module.ts), so there is ONE schema: the entities, created by the migrations.
// Reads backend/.env (Node 22+) and falls back to real environment variables.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file: use the real environment */
}

const slash = (p: string) => p.replace(/\\/g, "/");

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [slash(__dirname + "/Table/**/*.{ts,js}")],
  migrations: [slash(__dirname + "/Migrations/*.{ts,js}")],
  migrationsTableName: "typeorm_migrations",
  logging: ["error", "migration"],
});
