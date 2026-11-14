// Writes docs/oxxy-api.postman_collection.json from src/Helper/PostmanCollection.ts (no keys in it).
// npx ts-node -r tsconfig-paths/register --transpile-only scripts/write-postman.ts
import { writeFileSync } from "fs";
import { join } from "path";
import { buildPostmanCollection } from "../src/Helper/PostmanCollection";

const out = join(__dirname, "..", "..", "docs", "oxxy-api.postman_collection.json");
writeFileSync(out, JSON.stringify(buildPostmanCollection(), null, 2) + "\n");
console.log(`wrote ${out}`);
