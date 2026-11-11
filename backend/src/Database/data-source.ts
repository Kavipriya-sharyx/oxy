import { DataSource } from "typeorm";

// Standalone DataSource for the migration and seed CLI (not used by the Nest app).
// Reads backend/.env (Node 22+) and falls back to real environment variables.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file: use the real environment */
}

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  migrations: [__dirname + "/Migrations/*.{ts,js}"],
  migrationsTableName: "typeorm_migrations",
  logging: ["error", "migration"],
});
