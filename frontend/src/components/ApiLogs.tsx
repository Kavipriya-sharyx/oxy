import { Fragment, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getApiLogStats,
  listApiLogs,
  type ApiLogFilter,
  type ApiLogRow,
} from "../api/developer.api";
import { Empty, ErrorNote, Pill, Stat } from "./ui";

// Developer > API logs (Super Admin): every call the client's CRM / voice agent made to the Oxxy API.
// No message text or health detail is kept: the field names sent, the source and the last 4 digits only.

const WINDOWS: [number, string][] = [
  [1, "Last hour"],
  [24, "Last 24 hours"],
  [24 * 7, "Last 7 days"],
  [24 * 30, "Last 30 days"],
];
const RESULTS: [string, string][] = [
  ["", "All results"],
  ["ok", "Success (2xx)"],
  ["error", "All errors"],
  ["4xx", "Caller errors (4xx)"],
  ["5xx", "Server errors (5xx)"],
  ["auth", "Key problems (401/403/503)"],
];

// what a status means, for someone who is not a developer
const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  400: "Bad request: a field is missing or wrong",
  401: "Wrong, expired or missing API key",
  403: "Not allowed",
  404: "Not found: wrong id",
  409: "Conflict: already done or not in the right state",
  422: "Cannot be processed",
  429: "Too many calls",
  500: "Error on the Oxxy server",
  503: "API not set up (no key)",
};
const tone = (s: number) => (s >= 500 ? "crit" : s >= 400 ? "warn" : "ok");
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

function toCsv(rows: ApiLogRow[]): string {
  const head = [
    "time",
    "method",
    "endpoint",
    "path",
    "status",
    "duration_ms",
    "key",
    "ip",
    "error",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    head.join(","),
    ...rows.map((r) =>
      [
        r.created_on,
        r.method,
        r.endpoint,
        r.path,
        r.status_code,
        r.duration_ms,
        r.key_label,
        r.ip,
        r.error_message,
      ]
        .map(esc)
        .join(","),
    ),
  ].join("\n");
}

export default function ApiLogs() {
  const [hours, setHours] = useState(24);
  const [filter, setFilter] = useState<ApiLogFilter>({ result: "", key: "", endpoint: "", q: "" });
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["apiLogs", "stats", hours],
    queryFn: () => getApiLogStats(hours),
    refetchInterval: live ? 15_000 : false,
  });
  const logs = useInfiniteQuery({
    queryKey: ["apiLogs", "rows", filter],
    queryFn: ({ pageParam }) => listApiLogs({ ...filter, before: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.has_more && last.rows.length ? last.rows[last.rows.length - 1].created_on : undefined,
    refetchInterval: live ? 15_000 : false,
  });
  const rows = logs.data?.pages.flatMap((p) => p.rows) ?? [];
  const st = stats.data;
  const set = (k: keyof ApiLogFilter, v: string) => setFilter((f) => ({ ...f, [k]: v }));
  const errorRate = st && st.calls ? Math.round((st.errors / st.calls) * 100) : 0;

  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `oxxy-api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="row">
        <span className="small muted">
          Every call the client's CRM and voice agent made to the Oxxy API: who called (which key),
          what, the answer and how long it took. Only Super Admin sees this. No message text or
          health detail is kept. Kept for 90 days.
        </span>
      </div>
      <div className="row">
        <select
          className="input"
          style={{ maxWidth: 170 }}
          value={hours}
          aria-label="Time window for the totals"
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {WINDOWS.map(([h, l]) => (
            <option key={h} value={h}>
              {l}
            </option>
          ))}
        </select>
        <label className="small row" style={{ gap: 6 }}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Refresh every 15 s
        </label>
        <span className="spacer" />
        <button className="btn sm" onClick={download} disabled={!rows.length}>
          Download CSV ({rows.length})
        </button>
      </div>
      <ErrorNote error={stats.error ?? logs.error} />

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat
          label="Calls"
          value={st?.calls ?? "—"}
          detail={st?.last_call_at ? `last ${when(st.last_call_at)}` : "none yet"}
        />
        <Stat
          label="Errors"
          value={st ? `${st.errors} (${errorRate}%)` : "—"}
          detail={st?.auth_failures ? `${st.auth_failures} with a key problem` : "no key problems"}
        />
        <Stat label="Average time" value={st ? ms(st.avg_ms) : "—"} detail="per call" />
        <Stat label="Slowest 5%" value={st ? ms(st.p95_ms) : "—"} detail="95th percentile" />
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-h">
            <b>By endpoint</b>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Calls</th>
                  <th>Errors</th>
                  <th>Avg</th>
                </tr>
              </thead>
              <tbody>
                {(st?.endpoints ?? []).map((e) => (
                  <tr
                    key={e.endpoint}
                    className="clickable"
                    title="Show only this endpoint"
                    onClick={() =>
                      set("endpoint", filter.endpoint === e.endpoint ? "" : e.endpoint)
                    }
                    style={
                      filter.endpoint === e.endpoint
                        ? { background: "var(--accent-soft)" }
                        : undefined
                    }
                  >
                    <td className="mono small">{e.endpoint}</td>
                    <td>{e.calls}</td>
                    <td>
                      {e.errors ? (
                        <Pill tone="warn">{e.errors}</Pill>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td className="small">{ms(e.avg_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {st && !st.endpoints.length && <Empty>No calls in this window.</Empty>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <b>By key</b>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Calls</th>
                  <th>Errors</th>
                  <th>Last call</th>
                </tr>
              </thead>
              <tbody>
                {(st?.keys ?? []).map((k) => {
                  const id = k.key_id ?? (k.key_label.startsWith("Server key") ? "server" : "none");
                  return (
                    <tr
                      key={`${k.key_id}-${k.key_label}`}
                      className="clickable"
                      title="Show only this caller"
                      onClick={() => set("key", filter.key === id ? "" : id)}
                      style={filter.key === id ? { background: "var(--accent-soft)" } : undefined}
                    >
                      <td className="small">{k.key_label}</td>
                      <td>{k.calls}</td>
                      <td>
                        {k.errors ? (
                          <Pill tone="warn">{k.errors}</Pill>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td className="small mono">{when(k.last_call_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {st && !st.keys.length && <Empty>No calls in this window.</Empty>}
          </div>
        </div>
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", search.trim());
        }}
      >
        <select
          className="input"
          style={{ maxWidth: 220 }}
          value={filter.result}
          aria-label="Result"
          onChange={(e) => set("result", e.target.value)}
        >
          {RESULTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search path, error or key, press Enter"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(filter.result || filter.key || filter.endpoint || filter.q) && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setSearch("");
              setFilter({ result: "", key: "", endpoint: "", q: "" });
            }}
          >
            Clear filters
          </button>
        )}
        {filter.endpoint && <Pill tone="info">{filter.endpoint}</Pill>}
        {filter.key && <Pill tone="info">caller filtered</Pill>}
      </form>

      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Result</th>
                <th>Endpoint</th>
                <th>Caller</th>
                <th>Time taken</th>
                <th>Why it failed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="mono small" style={{ whiteSpace: "nowrap" }}>
                      {when(r.created_on)}
                    </td>
                    <td>
                      <Pill tone={tone(r.status_code)}>{r.status_code}</Pill>
                    </td>
                    <td className="mono small">{r.endpoint}</td>
                    <td className="small">{r.key_label}</td>
                    <td
                      className="small"
                      style={{ color: r.duration_ms > 3000 ? "var(--warn)" : undefined }}
                    >
                      {ms(r.duration_ms)}
                    </td>
                    <td
                      className="small"
                      style={{ color: r.status_code >= 400 ? "var(--crit)" : undefined }}
                    >
                      {r.status_code >= 400
                        ? r.error_message || STATUS_TEXT[r.status_code] || ""
                        : ""}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--sunk)" }}>
                        <dl className="kv">
                          <dt>Meaning</dt>
                          <dd>{STATUS_TEXT[r.status_code] ?? `HTTP ${r.status_code}`}</dd>
                          <dt>Called</dt>
                          <dd className="mono small">
                            {r.method} {r.path}
                          </dd>
                          {r.error_message && (
                            <>
                              <dt>Error the caller got</dt>
                              <dd>{r.error_message}</dd>
                            </>
                          )}
                          <dt>From</dt>
                          <dd className="mono small">
                            {r.ip ?? "—"} · {r.user_agent ?? "no user agent"}
                          </dd>
                          {r.detail && Object.keys(r.detail).length > 0 && (
                            <>
                              <dt>Sent</dt>
                              <dd className="mono small" style={{ whiteSpace: "pre-wrap" }}>
                                {Object.entries(r.detail)
                                  .map(
                                    ([k, v]) =>
                                      `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`,
                                  )
                                  .join("\n")}
                              </dd>
                            </>
                          )}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {logs.isLoading && <Empty>Loading…</Empty>}
          {!logs.isLoading && !rows.length && (
            <Empty>
              No API calls match. Calls appear here as soon as the CRM or voice agent uses a key.
            </Empty>
          )}
          {logs.hasNextPage && (
            <div style={{ padding: 12, textAlign: "center" }}>
              <button
                className="btn sm"
                disabled={logs.isFetchingNextPage}
                onClick={() => logs.fetchNextPage()}
              >
                {logs.isFetchingNextPage ? "Loading…" : "Load older calls"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
