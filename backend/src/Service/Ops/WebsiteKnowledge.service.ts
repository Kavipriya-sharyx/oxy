// The public Oxxy website as knowledge (client, 21 Nov: "whenever a customer asks a random or unstructured
// question, answer using the information on oxxy.in"). Every night (NightlyJobs, 03:00 IST) and on demand from the
// console, the pages below are read, cleaned and cut into short passages (table website_page); the bot then gives
// the LLM the closest two passages for a question (Helper/KnowledgeBase websitePassages -> website_info).
// Not read live per question: that would add seconds to every answer and break when the site is slow.
// Cleaning: scripts / styles out, struck-out old prices out (class "...strike...", <del>, <s>), and every line that
// carries a price out too (prices come only from plan_catalog; the site shows Rs. 2,000 struck next to Rs. 999).
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import axios from "axios";
import * as crypto from "crypto";
import { website_page } from "@Database/Table/Oxxy/website_page";
import { setWebsitePassages } from "@Helper/KnowledgeBase";
import { JobOutcome, runJob } from "./JobRuns";

const SITE = "https://www.oxxy.in";
export const WEBSITE_PAGES = [
  `${SITE}/`,
  `${SITE}/oxxy-everyday`,
  `${SITE}/oxxy-vital`,
  `${SITE}/oxxy-thrive`,
  `${SITE}/oxxy-infinity`,
  `${SITE}/policies`,
  `${SITE}/about-oxxy`,
  `${SITE}/contact-us`,
];

/** The pages to read: OXXY_WEBSITE_PAGES (comma list, www.oxxy.in only) or the list above */
export function sitePages(): string[] {
  const own = (process.env.OXXY_WEBSITE_PAGES || "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith(`${SITE}/`));
  return own.length ? own : WEBSITE_PAGES;
}

const ENTITIES: Record<string, string> = {
  amp: "&", nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
  ndash: "-", mdash: "-", hellip: "...", rupee: "₹", middot: "·", bull: "•",
};
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** A line that carries a price (never taken from the site) or a "guaranteed saving" claim */
export function isPriceLine(line: string): boolean {
  const money = /(₹|\brs\.?|\binr)\s?[\d,]+/i.test(line);
  if (!money) return false;
  return /\/\s*(mo|month|yr|year)\b|per (month|year|annum)|\bprice\b|due today|\bmrp\b|\bsav(e|ing|ings)\b|guarantee|\bpay\b|\bpaid\b|gst|discount/i.test(
    line,
  );
}

// page furniture, not content (buttons, pop-ups, the email the site hides from robots)
const JUNK =
  /^(got it|activate now|follow us:?|register as:?|quick links|read more|view more.*|learn more|submit|close)$|does not support the video|email(&#160;|\s)protected|\[email/i;

/** The page's title and its readable lines (cleaned, no price lines) */
export function pageLines(html: string): { title: string | null; lines: string[] } {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim() || null;
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|head|iframe|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(del|s|strike)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // a struck-out old price ("plan-strike", "strike"): the element and its text
    .replace(/<(\w+)\b[^>]*\bclass="[^"]*strike[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // a line break inside an address or a time keeps it one line ("C 64 LGF<br>New Delhi")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|header|footer|ul|ol|table|summary|details|blockquote|dt|dd|label|button|a)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decode(s);
  const lines = s
    .split(/\n+/)
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.split(" ").length >= 2 && l.length <= 600 && !isPriceLine(l) && !JUNK.test(l));
  return { title, lines };
}

/** Lines -> passages of about 400 characters (whole lines) */
export function toPassages(lines: string[], max = 420): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    const line = /[.!?:]$/.test(l) ? l : `${l}.`;
    if (cur && cur.length + line.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur} ${line}` : line;
  }
  if (cur) out.push(cur);
  return out.slice(0, 80);
}

@Injectable()
export class WebsiteKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(WebsiteKnowledgeService.name);

  async onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    await this.load().catch((e) => this.logger.warn(`website passages not loaded: ${(e as Error).message}`));
  }

  /** The stored passages into memory (start-up and after each read) */
  async load(): Promise<number> {
    const rows = await website_page.find({ where: { status: true } as any });
    const n = setWebsitePassages(rows.map((r) => ({ url: r.url, passages: r.passages ?? [] })));
    this.logger.log(`website passages loaded: ${n} from ${rows.length} pages`);
    return n;
  }

  /** The nightly job (and the console's "Read now") */
  async run(triggeredBy: string | null = null) {
    return runJob("website_refresh", triggeredBy, () => this.refresh());
  }

  private async fetch(url: string): Promise<string> {
    const res = await axios.get<string>(url, {
      responseType: "text",
      timeout: 20_000,
      maxContentLength: 4_000_000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OxxyBot/1.0; +https://www.oxxy.in)" },
      validateStatus: (s) => s === 200,
    });
    return String(res.data ?? "");
  }

  async refresh(): Promise<JobOutcome> {
    const seen = new Set<string>(); // a line repeated on every page (menu, footer) is kept once, on the first page
    let read = 0;
    let changed = 0;
    let failed = 0;
    for (const url of sitePages()) {
      const row =
        (await website_page.findOne({ where: { url } as any })) ?? website_page.create({ url, passages: [] } as any);
      try {
        const { title, lines } = pageLines(await this.fetch(url));
        const own = lines.filter((l) => !seen.has(l));
        own.forEach((l) => seen.add(l));
        const passages = toPassages(own);
        if (!passages.length) throw new Error("no readable text on the page");
        const hash = crypto.createHash("sha256").update(passages.join("\n")).digest("hex");
        if (hash !== row.content_hash) {
          row.changed_at = new Date();
          changed++;
        }
        Object.assign(row, { title, passages, content_hash: hash, fetched_at: new Date(), fetch_error: null });
        read++;
      } catch (e) {
        // the previous text stays in use
        row.fetch_error = String((e as Error).message ?? e).slice(0, 300);
        failed++;
      }
      await row.save();
    }
    const passages = await this.load();
    return { status: "ok", summary: { pages: sitePages().length, read, changed, failed, passages } };
  }

  /** For the console: each page, when it was read, when it changed, how many passages */
  async pages() {
    const rows = await website_page.find({ order: { url: "ASC" } as any });
    return rows.map((r) => ({
      url: r.url,
      title: r.title,
      passages: (r.passages ?? []).length,
      fetched_at: r.fetched_at,
      changed_at: r.changed_at,
      fetch_error: r.fetch_error,
    }));
  }
}
