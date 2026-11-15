import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "../api/crm.api";
import { Empty, ErrorNote, fmtTime, Pill, type Tone, usePageTitle } from "../components/ui";

const tone = (action: string): Tone => {
  const a = action.toLowerCase();
  if (a.includes("delete")) return "crit";
  if (a.includes("insert") || a.includes("import")) return "ok";
  if (a.includes("update") || a.includes("bulk") || a.includes("payment")) return "warn";
  return "info";
};

/** { field: { from, to } } (an edit), or a plain set of values (a new record) */
function Details({ value }: { value: unknown }) {
  if (value == null || (typeof value === "object" && !Object.keys(value as object).length))
    return <span className="muted small">No extra details.</span>;
  const v = value as Record<string, unknown>;
  const changed = v.changed as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changed && Object.keys(changed).length) {
    return (
      <table className="small" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingRight: 16 }}>Field</th>
            <th style={{ textAlign: "left", paddingRight: 16 }}>Was</th>
            <th style={{ textAlign: "left" }}>Now</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(changed).map(([k, c]) => (
            <tr key={k}>
              <td className="mono" style={{ paddingRight: 16 }}>
                {k}
              </td>
              <td style={{ paddingRight: 16 }}>{String(c.from ?? "—")}</td>
              <td>
                <b>{String(c.to ?? "—")}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <pre
      className="mono small"
      style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function AuditLog() {
  usePageTitle("Audit log", "Control · append-only");
  const [form, setForm] = useState({ q: "", action: "", table: "", from: "", to: "" });
  const [applied, setApplied] = useState(form);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["auditLogs", applied, page],
    queryFn: () => listAuditLogs({ ...applied, page }),
  });
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (q.data?.page_size ?? 50)));
  const filtered = Object.values(applied).some(Boolean);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...form, q: form.q.trim(), action: form.action.trim() });
          setPage(0);
        }}
      >
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Person or record id"
          value={form.q}
          onChange={(e) => set("q", e.target.value)}
        />
        <input
          className="input"
          style={{ width: 160 }}
          placeholder="Action (Update, Delete…)"
          value={form.action}
          onChange={(e) => set("action", e.target.value)}
        />
        <select
          className="input"
          style={{ width: "auto" }}
          value={form.table}
          onChange={(e) => set("table", e.target.value)}
        >
          <option value="">Any area</option>
          {(q.data?.tables ?? []).map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <label className="small row" style={{ gap: 6 }}>
          From
          <input
            className="input"
            type="date"
            value={form.from}
            onChange={(e) => set("from", e.target.value)}
          />
        </label>
        <label className="small row" style={{ gap: 6 }}>
          To
          <input
            className="input"
            type="date"
            value={form.to}
            onChange={(e) => set("to", e.target.value)}
          />
        </label>
        <button className="btn sm pri">Filter</button>
        {filtered && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const blank = { q: "", action: "", table: "", from: "", to: "" };
              setForm(blank);
              setApplied(blank);
              setPage(0);
            }}
          >
            Clear
          </button>
        )}
        <span className="spacer" />
        <span className="small muted">{total} entries · nothing here can be edited or deleted</span>
      </form>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Area</th>
                <th>Record</th>
                <th>Done by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td className="small">{fmtTime(a.created_on)}</td>
                    <td>
                      <Pill tone={tone(a.action)}>{a.action}</Pill>
                    </td>
                    <td className="small">{a.table_name.replace(/_/g, " ")}</td>
                    <td className="mono small">{a.record_id}</td>
                    <td className="small">{a.user_name || "system"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn sm"
                        onClick={() => setOpen(open === a.id ? null : a.id)}
                      >
                        {open === a.id ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {open === a.id && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--sunk)" }}>
                        <Details value={a.details} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !rows.length && (
            <Empty>{filtered ? "No entries match." : "Nothing has been recorded yet."}</Empty>
          )}
        </div>
      </div>
      {pages > 1 && (
        <div className="row">
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹ Newer
          </button>
          <span className="small muted">
            Page {page + 1} of {pages}
          </span>
          <button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Older ›
          </button>
        </div>
      )}
    </>
  );
}
