// LLM eval runner (Full Plan 11). Sends every EvalDataset case to the configured model through the real
// ClaudeService (same prompt, same JSON parsing) and scores each reply with the real reply validator.
//
//   cd backend
//   ANTHROPIC_API_KEY=... npx ts-node -r tsconfig-paths/register src/Eval/run-eval.ts [--limit 50] [--category trust]
//
// Without a key it prints "skipped" and exits 0, so it can sit in CI. Every case is one paid model call:
// the full set is 300+ calls. The report goes to eval-report.json (git-ignored) and a summary is printed.
// Exit code 1 when the pass rate is under EVAL_MIN_PASS (default 0.95).
import "dotenv/config"; // the same backend/.env the server reads
import { writeFileSync } from "fs";
import configuration from "@Root/Config/Configuration";
import { ClaudeService } from "@Service/Oxxy/Claude.service";
import { validateReply } from "@Service/Oxxy/ReplyValidator.service";
import { GuardrailService } from "@Service/Oxxy/Guardrail.service";
import { matchFaq } from "@Helper/FaqReplies";
import { oneQuestion } from "@Helper/OneQuestion";
import { singleExpenseSignal } from "@Helper/NeedSignals";
import { asksForCmb } from "@Service/Oxxy/CmbGate";
import { buildDataset, EvalCase } from "./EvalDataset";

const guard = new GuardrailService();

/** fields the pipeline sets in code from the customer's words, whatever the LLM returned */
export function withCodeSignals<T extends { extracted_fields?: Record<string, unknown> }>(text: string, r: T): T {
  const f = { ...(r.extracted_fields ?? {}) };
  if (asksForCmb(text)) f.selected_product = "cut_medi_bills";
  if (!["ongoing", "single_expense"].includes(String(f.need_pattern)) && singleExpenseSignal(text)) f.need_pattern = "single_expense";
  return { ...r, extracted_fields: f };
}
/** what the pipeline answers with a fixed text before the LLM is called (guardrails, FAQ, insurance) */
export function handledBeforeLlm(text: string): string | null {
  const g = guard.check(text);
  if (g) return `guardrail ${g.kind}`;
  const f = matchFaq(text);
  if (f) return `faq ${f}`;
  if (/insurance|\bbima\b|बीमा|इंश्योरेंस/i.test(text)) return "insurance answer (Trigger B)";
  return null;
}

const MAX_CHARS = 350;

export interface Scored {
  id: string;
  category: string;
  text: string;
  reply: string;
  intent: string;
  ok: boolean;
  problems: string[];
}

/** Scores one reply. Pure, so it is unit-tested without a model. */
export function score(c: EvalCase, r: { reply_text: string; intent: string; extracted_fields?: Record<string, unknown>; needs_human?: boolean }): Scored {
  const problems: string[] = [];
  const reply = r.reply_text || "";
  if (!reply && !r.needs_human) problems.push("empty reply");
  const v = validateReply(reply, []);
  if (!v.ok) problems.push(...v.reasons.map((x) => `validator: ${x}`));
  if ([...reply].length > MAX_CHARS) problems.push(`longer than ${MAX_CHARS} characters`);
  if ((reply.match(/\?/g) || []).length > 1) problems.push("more than one question");
  if (c.intents && !c.intents.includes(r.intent)) problems.push(`intent ${r.intent}, expected ${c.intents.join("|")}`);
  for (const [k, want] of Object.entries(c.fields ?? {})) {
    const got = r.extracted_fields?.[k];
    if (want === true ? got == null || got === "" : got !== want) problems.push(`field ${k}=${String(got)}, expected ${String(want)}`);
  }
  return { id: c.id, category: c.category, text: c.text, reply, intent: r.intent, ok: problems.length === 0, problems };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const conf = configuration() as Record<string, any>;
  const config = { get: (k: string) => k.split(".").reduce((o, p) => (o == null ? undefined : o[p]), conf) };
  if (!config.get("Anthropic.ApiKey") && !config.get("OpenAI.ApiKey") && !config.get("Gemini.ApiKey")) {
    console.log("eval skipped: no LLM key set (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY)");
    return;
  }
  const llm = new ClaudeService(config as never);
  let cases = buildDataset();
  if (arg("category")) cases = cases.filter((c) => c.category === arg("category"));
  if (arg("limit")) cases = cases.slice(0, Number(arg("limit")));
  console.log(`running ${cases.length} cases on ${config.get("Llm.Provider")}...`);

  const results: Scored[] = [];
  let skipped = 0;
  const queue = [...cases];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const context = JSON.stringify({ language: c.lang, whatsapp_consent: true, health_questions_allowed: true });
      try {
        if (handledBeforeLlm(c.text)) {
          skipped++;
          continue;
        }
        // the pipeline's way: draft, validator, one retry with the reasons, then one question enforced
        let r = await llm.generate([{ role: "user", content: c.text }], context);
        const v = validateReply(r.reply_text, []);
        if (!v.ok) r = await llm.generate([{ role: "user", content: c.text }], context, v.reasons.join("; "));
        results.push(score(c, withCodeSignals(c.text, { ...r, reply_text: oneQuestion(r.reply_text) })));
      } catch (e) {
        results.push({ id: c.id, category: c.category, text: c.text, reply: "", intent: "", ok: false, problems: [`error: ${(e as Error).message}`] });
      }
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.EVAL_CONCURRENCY || 4) }, worker));

  results.sort((a, b) => a.id.localeCompare(b.id));
  const byCat = new Map<string, { n: number; ok: number }>();
  for (const r of results) {
    const x = byCat.get(r.category) ?? { n: 0, ok: 0 };
    x.n++;
    if (r.ok) x.ok++;
    byCat.set(r.category, x);
  }
  const passed = results.filter((r) => r.ok).length;
  const rate = results.length ? passed / results.length : 1;
  writeFileSync("eval-report.json", JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, rate, results }, null, 2));
  for (const [cat, x] of byCat) console.log(`${cat.padEnd(24)} ${x.ok}/${x.n}`);
  console.log(`\n${skipped} case(s) skipped: a fixed answer handles them before the LLM`);
  console.log(`passed ${passed}/${results.length} (${(rate * 100).toFixed(1)}%). Failures are in eval-report.json`);
  for (const r of results.filter((x) => !x.ok).slice(0, 15)) console.log(`- ${r.id}: ${r.problems.join("; ")}`);
  if (rate < Number(process.env.EVAL_MIN_PASS || 0.95)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
