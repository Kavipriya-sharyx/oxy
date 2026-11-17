// Which approved Q&A answers (and engagement bridge) the bot hands the LLM for a customer message.
// No LLM call, no database, no WhatsApp: it only shows the knowledge-base match.
//
//   cd backend
//   npx ts-node -r tsconfig-paths/register --transpile-only scripts/kb-check.ts "Can I buy for my parents?"
//   npx ts-node -r tsconfig-paths/register --transpile-only scripts/kb-check.ts     (runs a sample set)
import { relevantAnswers, relevantBridge } from "@Helper/KnowledgeBase";

const SAMPLES = [
  "Can I buy for my parents?",
  "Does it support dialysis?",
  "Is Oxxy insurance?",
  "Can I get a refund?",
  "Which plan is best for cancer treatment?",
  "Does it work at Apollo?",
  "Can I upgrade later?",
  "I don't know",
  "too expensive",
  "ok",
];

const messages = process.argv.slice(2).length ? [process.argv.slice(2).join(" ")] : SAMPLES;
for (const text of messages) {
  console.log(`\n=== "${text}"`);
  const qa = relevantAnswers(text);
  if (!qa.length) console.log("  (no approved answer close enough: the LLM answers from its normal rules)");
  for (const e of qa) {
    console.log(`  ${e.id} [${e.mode}] ${e.q}`);
    console.log(`     answer: ${e.a}`);
    if (e.next) console.log(`     next:   ${e.next}`);
  }
  const b = relevantBridge(text);
  if (b) console.log(`  bridge ${b.id}: ${b.situation} -> e.g. "${b.lines[0]}"`);
}
