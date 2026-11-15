import { audit_log } from "@Database/Table/Admin/audit_log";
import { user } from "@Database/Table/Admin/user";

/**
 * The audit trail, kept in the normal Postgres database (no InfluxDB needed).
 * Append-only: rows are only ever added here, never changed or deleted.
 * It never throws: a failed audit write must not break the action that was being recorded.
 */

// values that must never reach the log, whatever the table
const SECRET = /pass(word)?|token|secret|api[_-]?key|authorization|otp|pin$/i;

/** A copy of the object that is safe to store: secrets blanked, long text cut, no huge nesting */
export function scrub(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > 500 ? v.slice(0, 500) + "…" : v;
  if (v instanceof Date) return v.toISOString();
  if (depth > 3) return "…";
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrub(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET.test(k) ? "[hidden]" : scrub(val, depth + 1);
    }
    return out;
  }
  return String(v);
}

/** Only the fields whose value changed: { field: { from, to } } */
export function changes(before: Record<string, any>, after: Record<string, any>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      out[k] = { from: before?.[k] ?? null, to: after[k] ?? null };
    }
  }
  return scrub(out) as Record<string, { from: unknown; to: unknown }>;
}

export interface AuditEntry {
  /** What happened, e.g. "Insert", "Update", "Delete", "Confirm", "Import" */
  action: string;
  /** The table or area it happened in, e.g. "centre", "task" */
  table: string;
  /** The record it happened to (a row id or a short label) */
  recordId?: string | null;
  /** The signed-in user's id; empty = the system did it */
  userId?: string | null;
  /** Anything worth keeping: the new values, or { field: { from, to } } for an edit */
  details?: unknown;
}

export async function audit(e: AuditEntry): Promise<void> {
  try {
    let by = "system";
    if (e.userId) {
      const u = await user.findOne({ where: { id: e.userId } });
      by =
        [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
        (u as any)?.email ||
        e.userId;
    }
    const now = new Date();
    await audit_log.save(
      audit_log.create({
        performed_action: e.action,
        performed_by: by,
        performed_by_id: e.userId || "system",
        performed_module_name: e.table,
        performed_module_header_name: e.table.replace(/_/g, " "),
        performed_module_id: String(e.recordId ?? "-"),
        performed_on: now.toISOString(),
        performed_type: e.table,
        performed_ipaddress: "",
        performed_parameter: scrub(e.details ?? {}),
        created_by_id: e.userId || undefined,
        created_on: now,
      } as any),
    );
  } catch (err) {
    console.error("Audit trail write failed:", (err as Error).message);
  }
}
