// Two-person rule for the plan catalogue (Full Plan 6.1 / 8: "changes need a second approver"). One user
// proposes, a DIFFERENT user approves; only then is plan_catalog changed (version + 1). Every price, GST
// rate, renewal term and link the bot sends comes from plan_catalog, so this is the only way to change them.
import { isPlaceholder, isRealLink } from "@Helper/GoLive";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { plan_catalog } from "@Database/Table/Oxxy/plan_catalog";
import { plan_change } from "@Database/Table/Oxxy/plan_change";

export const EDITABLE = [
  "price",
  "gst_rate",
  "renewal_terms",
  "activation_time",
  "activation_link",
  "max_saving_pct",
  "illustration_pct",
  "age_limit",
  "auto_renews",
] as const;
type Field = (typeof EDITABLE)[number];

const intIn = (v: unknown, min: number, max: number) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

/** Keeps only editable fields with valid values; returns the problems for the rest */
export function cleanChanges(input: Record<string, unknown>): { clean: Partial<Record<Field, unknown>>; errors: string[] } {
  const clean: Partial<Record<Field, unknown>> = {};
  const errors: string[] = [];
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!(EDITABLE as readonly string[]).includes(k)) {
      errors.push(`${k} cannot be changed here`);
      continue;
    }
    const f = k as Field;
    const nullable = f === "max_saving_pct" || f === "illustration_pct" || f === "age_limit";
    if (nullable && (v === null || v === "")) {
      clean[f] = null;
      continue;
    }
    switch (f) {
      case "price":
        if (intIn(v, 1, 10_000_000)) clean.price = Number(v);
        else errors.push("price must be a whole number of rupees above 0");
        break;
      case "gst_rate":
        if (Number(v) >= 0 && Number(v) <= 0.5) clean.gst_rate = Number(v);
        else errors.push("gst_rate must be between 0 and 0.5 (0.18 = 18%)");
        break;
      case "max_saving_pct":
      case "illustration_pct":
        if (intIn(v, 0, 100)) clean[f] = Number(v);
        else errors.push(`${f} must be 0-100`);
        break;
      case "age_limit":
        if (intIn(v, 1, 130)) clean.age_limit = Number(v);
        else errors.push("age_limit must be 1-130, or empty for no limit");
        break;
      case "auto_renews":
        if (typeof v === "boolean") clean.auto_renews = v;
        else errors.push("auto_renews must be true or false");
        break;
      case "activation_link":
        if (typeof v === "string" && isRealLink(v) && v.length <= 1000) clean.activation_link = v.trim();
        else errors.push("activation_link must be the real official https:// link (no example or test address)");
        break;
      default: {
        const s = typeof v === "string" ? v.trim() : "";
        if (s && s.length <= 500 && !isPlaceholder(s)) clean[f] = s;
        else errors.push(`${f} must be the real text, 1-500 characters (no [CONFIRM] marker)`);
      }
    }
  }
  return { clean, errors };
}

@Injectable()
export class PlanChangeService {
  constructor(private readonly _DataSource: DataSource) {}

  async list() {
    return await plan_change
      .createQueryBuilder("p")
      .addSelect("p.created_on")
      .orderBy("CASE WHEN p.change_status = 'pending' THEN 0 ELSE 1 END", "ASC")
      .addOrderBy("p.created_on", "DESC")
      .take(50)
      .getMany();
  }

  async propose(catalogId: string, changes: Record<string, unknown>, reason: string, userId: string) {
    if (!userId) throw new ForbiddenException("Sign in again");
    const row = await plan_catalog.findOne({ where: { id: catalogId } });
    if (!row) throw new NotFoundException("Plan not found");
    if (!reason?.trim()) throw new BadRequestException("A reason is required (e.g. the official page changed)");
    const { clean, errors } = cleanChanges(changes);
    if (errors.length) throw new BadRequestException(errors.join("; "));
    const fields = Object.keys(clean).filter((k) => (row as any)[k] !== clean[k as Field]);
    if (!fields.length) throw new BadRequestException("Nothing changes");
    if (await plan_change.findOne({ where: { catalog_id: catalogId, change_status: "pending" } }))
      throw new ConflictException("This plan already has a change waiting for approval");
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of fields) {
      before[k] = (row as any)[k] ?? null;
      after[k] = clean[k as Field];
    }
    return await plan_change.save(
      plan_change.create({
        catalog_id: catalogId,
        changes: after,
        before,
        reason: reason.trim().slice(0, 500),
        requested_by_id: userId,
        created_by_id: userId,
      } as any),
    );
  }

  private async pending(id: string) {
    const c = await plan_change.findOne({ where: { id } });
    if (!c) throw new NotFoundException("Change not found");
    if (c.change_status !== "pending") throw new ConflictException(`This change is already ${c.change_status}`);
    return c;
  }

  async approve(id: string, userId: string, note?: string) {
    const c = await this.pending(id);
    if (!userId || c.requested_by_id === userId)
      throw new ForbiddenException("Two-person rule: a different user must approve this change");
    const { clean, errors } = cleanChanges(c.changes);
    if (errors.length) throw new BadRequestException(errors.join("; "));
    return await this._DataSource.transaction(async (mg) => {
      const row = await mg.findOne(plan_catalog, { where: { id: c.catalog_id } });
      if (!row) throw new NotFoundException("Plan not found");
      const version = Number(row.version || 1) + 1;
      await mg.update(plan_catalog, { id: row.id }, { ...clean, version, updated_by_id: userId, updated_on: new Date() } as any);
      await mg.update(plan_change, { id: c.id }, {
        change_status: "approved",
        decided_by_id: userId,
        decided_at: new Date(),
        decision_note: note?.trim().slice(0, 500) || null,
        applied_version: version,
      } as any);
      return { ...c, change_status: "approved", decided_by_id: userId, applied_version: version };
    });
  }

  async reject(id: string, userId: string, note?: string) {
    const c = await this.pending(id);
    if (!userId || c.requested_by_id === userId) throw new ForbiddenException("Withdraw your own change instead");
    await plan_change.update(c.id, {
      change_status: "rejected",
      decided_by_id: userId,
      decided_at: new Date(),
      decision_note: note?.trim().slice(0, 500) || null,
    } as any);
    return { ...c, change_status: "rejected" };
  }

  async withdraw(id: string, userId: string) {
    const c = await this.pending(id);
    if (c.requested_by_id !== userId) throw new ForbiddenException("Only the person who proposed it can withdraw it");
    await plan_change.update(c.id, { change_status: "withdrawn", decided_by_id: userId, decided_at: new Date() } as any);
    return { ...c, change_status: "withdrawn" };
  }
}
