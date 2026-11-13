import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "../api/crm.api";
import { Empty, ErrorNote, fmtTime, usePageTitle } from "../components/ui";

export default function AuditLog() {
  usePageTitle("Audit log", "Control · append-only");
  const [action, setAction] = useState("");
  const [table, setTable] = useState("");
  const [applied, setApplied] = useState({ action: "", table: "" });
  const q = useQuery({
    queryKey: ["auditLogs", applied],
    queryFn: () => listAuditLogs(applied.action || undefined, applied.table || undefined),
  });
  return (
    <>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ action: action.trim(), table: table.trim() });
        }}
      >
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Action (insert, update…)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Table"
          value={table}
          onChange={(e) => setTable(e.target.value)}
        />
        <button className="btn sm">Filter</button>
        {(applied.action || applied.table) && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setAction("");
              setTable("");
              setApplied({ action: "", table: "" });
            }}
          >
            Clear
          </button>
        )}
        <span className="spacer" />
        <span className="small muted">
          {(q.data ?? []).length} entries · nothing here can be edited or deleted
        </span>
      </form>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Table</th>
                <th>Record</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="mono small">{fmtTime(a.created_on)}</td>
                  <td className="mono small">{a.action}</td>
                  <td className="small">{a.table_name}</td>
                  <td className="mono small">{a.record_id}</td>
                  <td className="mono small">{a.user_id ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !(q.data ?? []).length && <Empty>No entries match.</Empty>}
        </div>
      </div>
    </>
  );
}
