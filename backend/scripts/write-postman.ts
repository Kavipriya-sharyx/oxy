// Writes the Postman collections to docs/ from src/Helper/PostmanCollection.ts (no keys in them):
// oxxy-api.postman_collection.json (CRM) and oxxy-voice-agent-api.postman_collection.json (voice agent).
// npx ts-node -r tsconfig-paths/register --transpile-only scripts/write-postman.ts
import { writeFileSync } from "fs";
import { join } from "path";
import { buildPostmanCollection, buildVoicePostmanCollection } from "../src/Helper/PostmanCollection";

const docs = join(__dirname, "..", "..", "docs");
for (const [file, col] of [
  ["oxxy-api.postman_collection.json", buildPostmanCollection()],
  ["oxxy-voice-agent-api.postman_collection.json", buildVoicePostmanCollection()],
] as const) {
  writeFileSync(join(docs, file), JSON.stringify(col, null, 2) + "\n");
  console.log(`wrote docs/${file}`);
}
