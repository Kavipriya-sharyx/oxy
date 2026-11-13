// WhatsApp template status (Full Plan 8 "Triggers and templates": WhatsApp template status). Status is set
// by hand or read from Meta (GET /{WABA_ID}/message_templates). A template Meta rejected, paused or disabled
// is refused before the send (WhatsappClient), so a follow-up is logged as skipped instead of failing at Meta.
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { wa_template } from "@Database/Table/Oxxy/wa_template";
import { InvalidMessageError } from "@Helper/WhatsappErrors";

export const TEMPLATE_STATUSES = ["draft", "submitted", "approved", "rejected", "paused", "disabled"];
export const BLOCKED_STATUSES = ["rejected", "paused", "disabled"];

/** Meta's status names -> ours */
export function metaStatus(s: string | null | undefined): string {
  const v = String(s ?? "").toUpperCase();
  if (v === "APPROVED") return "approved";
  if (v === "REJECTED") return "rejected";
  if (v === "PAUSED") return "paused";
  if (v === "DISABLED") return "disabled";
  if (v === "PENDING" || v === "IN_APPEAL" || v === "PENDING_DELETION") return "submitted";
  return "draft";
}

/** Throws when this template is known to be unusable in Meta. Unknown templates are left to Meta. */
export async function assertTemplateUsable(name: string, languageCode: string | undefined): Promise<void> {
  let rows: wa_template[] = [];
  try {
    rows = await wa_template.find({ where: { name } });
  } catch {
    return; // no table / no database: never block a send for that
  }
  const lang = (languageCode || "en").toLowerCase();
  const row =
    rows.find((r) => r.language.toLowerCase() === lang) ??
    rows.find((r) => r.language.toLowerCase().split(/[_-]/)[0] === lang.split(/[_-]/)[0]);
  if (row && BLOCKED_STATUSES.includes(row.meta_status))
    throw new InvalidMessageError(`template ${name} is ${row.meta_status} in Meta`);
}

@Injectable()
export class TemplatesService {
  constructor(private readonly _Config: ConfigService) {}

  async list() {
    return await wa_template.find({ order: { name: "ASC", language: "ASC" } as any });
  }

  async update(id: string, body: { meta_status?: string; note?: string }, userId: string) {
    const row = await wa_template.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Template not found");
    if (body.meta_status !== undefined) {
      if (!TEMPLATE_STATUSES.includes(body.meta_status)) throw new BadRequestException("Unknown status");
      row.meta_status = body.meta_status;
    }
    if (body.note !== undefined) row.note = String(body.note).trim().slice(0, 500) || null;
    row.updated_by_id = userId;
    row.updated_on = new Date();
    return await row.save();
  }

  /** Reads every template of the WhatsApp Business Account from Meta and updates the list */
  async syncFromMeta() {
    const waba = this._Config.get<string>("Whatsapp.WabaId");
    const token = this._Config.get<string>("Whatsapp.AccessToken");
    if (!waba || !token) throw new BadRequestException("Set the WhatsApp Business Account ID and access token in Configuration first");
    const base = this._Config.get<string>("Whatsapp.ApiBase") || "https://graph.facebook.com";
    const version = this._Config.get<string>("Whatsapp.ApiVersion") || "v21.0";
    let url: string | null = `${base}/${version}/${encodeURIComponent(waba)}/message_templates?fields=id,name,status,language,category&limit=100`;
    let seen = 0;
    let added = 0;
    for (let page = 0; url && page < 10; page++) {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 });
      for (const t of (res.data?.data ?? []) as { id?: string; name?: string; status?: string; language?: string; category?: string }[]) {
        if (!t.name) continue;
        seen++;
        const language = (t.language || "en").trim();
        let row = await wa_template.findOne({ where: { name: t.name, language } });
        if (!row) {
          row = wa_template.create({ name: t.name, language } as any);
          added++;
        }
        row.meta_status = metaStatus(t.status);
        row.meta_id = t.id ?? row.meta_id ?? null;
        row.category = t.category ?? row.category ?? null;
        row.last_synced_at = new Date();
        await row.save();
      }
      url = res.data?.paging?.next ?? null;
    }
    return { seen, added };
  }
}
