// Creates the bot's WhatsApp templates in Meta (WhatsApp Manager) from src/Helper/TemplateDefinitions.ts.
// Templates that already exist with the same name + language are skipped (Meta does not allow editing a
// pending one; change it in WhatsApp Manager). Reads WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID
// from backend/.env and never prints the token.
//
//   cd backend
//   npx ts-node -r tsconfig-paths/register --transpile-only scripts/submit-templates.ts [--dry-run]
//   ... scripts/submit-templates.ts --update=oxxy_learn_more,oxxy_book_appointment [--dry-run]   (edit existing)
import "dotenv/config";
import { readFileSync } from "fs";
import { basename, resolve } from "path";
import { metaTemplateBody, TEMPLATES } from "@Helper/TemplateDefinitions";

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const dry = process.argv.includes("--dry-run");
  if (!token || !waba) throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID must be set");
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(waba)}/message_templates`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  // --update=a,b: edit those templates that already exist (Meta: POST /{template id} with the new components;
  // an approved template goes back to review; Meta allows about one edit a day per template)
  const update = new Set(
    (process.argv.find((a) => a.startsWith("--update="))?.slice(9) ?? "").split(",").filter(Boolean),
  );
  const existing = new Set<string>();
  const ids = new Map<string, string>();
  for (let next: string | null = `${url}?fields=id,name,language&limit=100`; next; ) {
    const r = await fetch(next, { headers });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`listing failed: ${j?.error?.message ?? r.status}`);
    for (const t of j.data ?? []) {
      existing.add(`${t.name}|${t.language}`);
      ids.set(`${t.name}|${t.language}`, t.id);
    }
    next = j.paging?.next ?? null;
  }

  // A picture header needs an example image uploaded through Meta's Resumable Upload API, which needs the
  // Meta app id (Meta for Developers -> App settings -> Basic -> App ID): WHATSAPP_APP_ID.
  const appId = process.env.WHATSAPP_APP_ID || "";
  const handles = new Map<string, string>();
  async function headerHandle(file: string): Promise<string | null> {
    if (handles.has(file)) return handles.get(file)!;
    if (!appId) return null;
    const bytes = readFileSync(resolve(process.cwd(), file));
    const type = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    const start = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(appId)}/uploads?file_name=${encodeURIComponent(basename(file))}&file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`,
      { method: "POST", headers: { authorization: `Bearer ${token}` } },
    );
    const s: any = await start.json();
    if (!start.ok || !s.id) throw new Error(`image upload start failed: ${s?.error?.message ?? start.status}`);
    const up = await fetch(`https://graph.facebook.com/${version}/${s.id}`, {
      method: "POST",
      headers: { authorization: `OAuth ${token}`, file_offset: "0" },
      body: bytes,
    });
    const u: any = await up.json();
    if (!up.ok || !u.h) throw new Error(`image upload failed: ${u?.error?.message ?? up.status}`);
    handles.set(file, u.h);
    return u.h;
  }

  for (const t of TEMPLATES) {
    const key = `${t.name}|${t.language}`;
    if (update.size) {
      if (!update.has(t.name)) continue;
      const id = ids.get(key);
      if (!id) {
        console.log(`skip    ${t.name} (${t.language}): not in Meta, run without --update to create it`);
        continue;
      }
      if (t.headerImage && !appId) {
        console.log(`skip    ${t.name} (${t.language}): picture header needs WHATSAPP_APP_ID in backend/.env`);
        continue;
      }
      if (dry) {
        console.log(`would update ${t.name} (${t.language}, id ${id})`);
        continue;
      }
      const handle = t.headerImage ? await headerHandle(t.headerImage) : undefined;
      const { components } = metaTemplateBody(t, handle ?? undefined);
      const r = await fetch(`https://graph.facebook.com/${version}/${id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ components }),
      });
      const j: any = await r.json();
      if (r.ok) console.log(`updated ${t.name} (${t.language}): ${JSON.stringify(j)}`);
      else console.log(`FAILED  ${t.name} (${t.language}): ${j?.error?.error_user_msg || j?.error?.message} (code ${j?.error?.code})`);
      continue;
    }
    if (existing.has(key)) {
      console.log(`skip    ${t.name} (${t.language}): already in Meta`);
      continue;
    }
    if (t.headerImage && !appId) {
      console.log(`skip    ${t.name} (${t.language}): picture header needs WHATSAPP_APP_ID in backend/.env`);
      continue;
    }
    if (dry) {
      console.log(`would create ${t.name} (${t.language}, ${t.category})`);
      continue;
    }
    const handle = t.headerImage ? await headerHandle(t.headerImage) : undefined;
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(metaTemplateBody(t, handle ?? undefined)) });
    const j: any = await r.json();
    if (r.ok) console.log(`created ${t.name} (${t.language}): id ${j.id}, status ${j.status}, category ${j.category ?? t.category}`);
    else console.log(`FAILED  ${t.name} (${t.language}): ${j?.error?.error_user_msg || j?.error?.message} (code ${j?.error?.code})`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
