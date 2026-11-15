import { BadRequestException, Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { api_request_log } from "@Database/Table/Admin/api_request_log";

/** What the guard found out about the caller (set on the request) */
export interface ApiCaller {
  id: string | null;
  label: string;
}

// query values that are safe to keep as they are (paging and filters, never personal data)
const SAFE_QUERY = new Set(["after", "limit", "offset", "status", "view", "type", "audience"]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const last4 = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
};

/**
 * The safe part of a call for the log: the query filters, the NAMES of the body fields (never their values,
 * which may hold health or payment details), the source and the last 4 digits of the WhatsApp number.
 */
export function summariseCall(query: unknown, body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const q = (query && typeof query === "object" ? query : {}) as Record<string, unknown>;
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  const safeQ = Object.fromEntries(
    Object.entries(q)
      .filter(([k]) => SAFE_QUERY.has(k))
      .map(([k, v]) => [k, String(v).slice(0, 60)]),
  );
  if (Object.keys(safeQ).length) out.query = safeQ;
  const fields = Object.keys(b).slice(0, 30);
  if (fields.length) out.body_fields = fields;
  if (typeof b.source === "string") out.source = b.source.slice(0, 40);
  const wa = last4(b.wa_number ?? q.wa_number);
  if (wa) out.wa_number_last4 = wa;
  return out;
}

/** "/api/v1/Actions/BookingRequests/<uuid>/Confirm" -> "/Actions/BookingRequests/:Id/Confirm" */
export function endpointOf(method: string, routePath: string | undefined, path: string): string {
  const p = (routePath || path.replace(UUID, ":Id")).replace(/^\/api\/v\d+/i, "");
  return `${method.toUpperCase()} ${p}`.slice(0, 200);
}

export interface ApiLogFilter {
  result?: string; // ok | error | 4xx | 5xx | auth
  key?: string; // key id, or "server" / "none"
  endpoint?: string;
  q?: string; // part of the path or the error
  from?: string;
  to?: string;
  before?: string; // created_on of the last row shown (older page)
  limit?: string;
}

@Injectable()
export class ApiLogService {
  private readonly logger = new Logger(ApiLogService.name);

  async record(row: Partial<api_request_log>): Promise<void> {
    try {
      await api_request_log.insert(row as api_request_log);
    } catch (e) {
      this.logger.warn(`API log not saved: ${(e as Error).message}`); // never breaks the API call
    }
  }

  async list(f: ApiLogFilter) {
    const limit = Math.min(200, Math.max(1, Math.floor(Number(f.limit)) || 50));
    const qb = api_request_log.createQueryBuilder("l");
    if (f.result === "ok") qb.andWhere("l.status_code < 400");
    else if (f.result === "error") qb.andWhere("l.status_code >= 400");
    else if (f.result === "4xx") qb.andWhere("l.status_code >= 400 AND l.status_code < 500");
    else if (f.result === "5xx") qb.andWhere("l.status_code >= 500");
    else if (f.result === "auth") qb.andWhere("l.status_code IN (401, 403, 503)");
    if (f.key === "server") qb.andWhere("l.key_id IS NULL AND l.key_label LIKE 'Server key%'");
    else if (f.key === "none") qb.andWhere("l.key_id IS NULL AND l.key_label NOT LIKE 'Server key%'");
    else if (f.key) qb.andWhere("l.key_id = :key", { key: f.key });
    if (f.endpoint) qb.andWhere("l.endpoint = :ep", { ep: f.endpoint });
    const term = String(f.q ?? "").trim().toLowerCase().slice(0, 80);
    if (term)
      qb.andWhere(
        "(LOWER(l.path) LIKE :t OR LOWER(COALESCE(l.error_message, '')) LIKE :t OR LOWER(l.key_label) LIKE :t)",
        { t: `%${term}%` },
      );
    const date = (v: string | undefined, name: string) => {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new BadRequestException(`${name} is not a date`);
      return d;
    };
    const from = date(f.from, "from");
    const to = date(f.to, "to");
    const before = date(f.before, "before");
    if (from) qb.andWhere("l.created_on >= :from", { from });
    if (to) qb.andWhere("l.created_on <= :to", { to });
    if (before) qb.andWhere("l.created_on < :before", { before });
    const rows = await qb
      .orderBy("l.created_on", "DESC")
      .addOrderBy("l.id", "DESC")
      .take(limit + 1)
      .getMany();
    return { rows: rows.slice(0, limit), has_more: rows.length > limit };
  }

  /** The last `hours`: totals, the slowest and failing endpoints, and each key's use */
  async stats(hours = 24) {
    const h = Math.min(24 * 90, Math.max(1, Math.floor(hours) || 24));
    // created_on is written by the database (now()), so the window is worked out there too (no time-zone shift)
    const since = h;
    const [total] = await api_request_log.query(
      `SELECT COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
              COUNT(*) FILTER (WHERE status_code IN (401, 403))::int AS auth_failures,
              COALESCE(ROUND(AVG(duration_ms)), 0)::int AS avg_ms,
              COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_ms,
              MAX(created_on) AS last_call_at
         FROM api_request_log WHERE created_on >= now() - make_interval(hours => $1::int)`,
      [since],
    );
    const endpoints = await api_request_log.query(
      `SELECT endpoint, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
              COALESCE(ROUND(AVG(duration_ms)), 0)::int AS avg_ms, MAX(created_on) AS last_call_at
         FROM api_request_log WHERE created_on >= now() - make_interval(hours => $1::int)
        GROUP BY endpoint ORDER BY calls DESC LIMIT 30`,
      [since],
    );
    const keys = await api_request_log.query(
      `SELECT key_id, MAX(key_label) AS key_label, COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors, MAX(created_on) AS last_call_at
         FROM api_request_log WHERE created_on >= now() - make_interval(hours => $1::int)
        GROUP BY key_id, CASE WHEN key_id IS NULL THEN key_label END ORDER BY calls DESC LIMIT 30`,
      [since],
    );
    return { hours: h, ...(total ?? {}), endpoints, keys };
  }

  /** Nightly: rows older than 90 days go */
  async prune(days = 90): Promise<number> {
    const r = await api_request_log
      .createQueryBuilder()
      .delete()
      .where("created_on < now() - make_interval(days => :days)", { days })
      .execute();
    return r.affected ?? 0;
  }
}

/** Logs every call to /Actions when the answer has gone out (status, time, caller, error) */
@Injectable()
export class ApiLogMiddleware implements NestMiddleware {
  constructor(private readonly _Log: ApiLogService) {}

  use(req: any, res: any, next: () => void) {
    const start = Date.now();
    res.on("finish", () => {
      const caller: ApiCaller | undefined = req.oxxyApiCaller;
      const given = String(req.headers?.["x-api-key"] ?? "");
      const label =
        caller?.label ??
        (given ? `Wrong or expired key (${given.slice(0, 8)}…)` : "No key sent");
      const path = String(req.originalUrl ?? req.url ?? "").split("?")[0].slice(0, 300);
      const status = Number(res.statusCode) || 0;
      void this._Log.record({
        method: String(req.method ?? "GET").slice(0, 10),
        path,
        endpoint: endpointOf(String(req.method ?? "GET"), req.route?.path, path),
        status_code: status,
        duration_ms: Date.now() - start,
        key_id: caller?.id ?? null,
        key_label: label.slice(0, 160),
        ip: String(req.headers?.["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim().slice(0, 64) || null,
        user_agent: req.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 200) : null,
        error_message:
          status >= 400 ? String(res.locals?.oxxyApiError ?? `HTTP ${status}`).slice(0, 1000) : null,
        detail: summariseCall(req.query, req.body),
      });
    });
    next();
  }
}
