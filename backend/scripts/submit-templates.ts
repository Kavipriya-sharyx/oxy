// Creates the bot's WhatsApp templates in Meta (WhatsApp Manager) from src/Helper/TemplateDefinitions.ts.
// Templates that already exist with the same name + language are skipped (Meta does not allow editing a
// pending one; change it in WhatsApp Manager). Reads WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID
// from backend/.env and never prints the token.
//
//   cd backend
//   npx ts-node -r tsconfig-paths/register --transpile-only scripts/submit-templates.ts [--dry-run]
import "dotenv/config";
import { metaTemplateBody, TEMPLATES } from "@Helper/TemplateDefinitions";

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const dry = process.argv.includes("--dry-run");
  if (!token || !waba) throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID must be set");
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(waba)}/message_templates`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const existing = new Set<string>();
  for (let next: string | null = `${url}?fields=name,language&limit=100`; next; ) {
    const r = await fetch(next, { headers });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`listing failed: ${j?.error?.message ?? r.status}`);
    for (const t of j.data ?? []) existing.add(`${t.name}|${t.language}`);
    next = j.paging?.next ?? null;
  }

  for (const t of TEMPLATES) {
    if (existing.has(`${t.name}|${t.language}`)) {
      console.log(`skip    ${t.name} (${t.language}): already in Meta`);
      continue;
    }
    if (dry) {
      console.log(`would create ${t.name} (${t.language}, ${t.category})`);
      continue;
    }
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(metaTemplateBody(t)) });
    const j: any = await r.json();
    if (r.ok) console.log(`created ${t.name} (${t.language}): id ${j.id}, status ${j.status}, category ${j.category ?? t.category}`);
    else console.log(`FAILED  ${t.name} (${t.language}): ${j?.error?.error_user_msg || j?.error?.message} (code ${j?.error?.code})`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
