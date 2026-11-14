import { BaseEntity } from "typeorm";
import dataSource from "../data-source";
import { OxxySeederService } from "./OxxySeeder.service";

/**
 * Standalone seed (run after the migrations): npm run seed
 * Uses the same data and rules as the seeder that runs at app start (OxxyData.ts):
 *  - plan_catalog: 4 Oxxy plans (monthly + yearly) and Cut Medi Bills (monthly + yearly)
 *  - no centres and no content: the real ones are entered in the console (Centres, Content)
 * Safe to run more than once. Links and Oxxy terms start empty: see the Go-live check in the console.
 */
async function main() {
  await dataSource.initialize();
  BaseEntity.useDataSource(dataSource);
  try {
    await new OxxySeederService().Run();
    const plans = await dataSource.query("SELECT count(*)::int AS n FROM plan_catalog");
    const centres = await dataSource.query("SELECT count(*)::int AS n FROM centre");
    console.log(`plan_catalog: ${plans[0].n} rows · centres: ${centres[0].n} rows`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
