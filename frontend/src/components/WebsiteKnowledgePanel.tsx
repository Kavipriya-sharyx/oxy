import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWebsiteKnowledge, runWebsiteKnowledge } from "../api/ops.api";
import { Empty, fmtTime, Panel, Pill } from "./ui";

// The public website as the bot's knowledge for questions the approved answers do not cover (client, 21 Nov).
// Read every night at 03:00 IST; prices on the site are never used (they come from Plans and prices).
export default function WebsiteKnowledgePanel() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["websiteKnowledge"], queryFn: getWebsiteKnowledge });
  const run = useMutation({
    mutationFn: runWebsiteKnowledge,
    onSuccess: async (r) => {
      const s = (r.summary ?? {}) as Record<string, unknown>;
      if (r.job_status === "ok")
        message.success(`Website read: ${s.read ?? 0} pages, ${s.changed ?? 0} changed, ${s.failed ?? 0} failed`);
      else message.error(`Website read ${r.job_status}`);
      await qc.invalidateQueries({ queryKey: ["websiteKnowledge"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const pages = q.data?.pages ?? [];
  const last = q.data?.runs?.[0];
  const total = pages.reduce((n, p) => n + p.passages, 0);

  return (
    <Panel
      title="Website knowledge (oxxy.in)"
      note="Read every night at 03:00 IST · the bot answers questions the approved answers do not cover from these pages"
      actions={
        <button className="btn sm" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Reading…" : "Read now"}
        </button>
      }
      bodyless
    >
      <div className="panel-b">
        <div className="row small" style={{ gap: 8, marginBottom: 8 }}>
          {last ? (
            <>
              <Pill tone={last.job_status === "ok" ? "ok" : last.job_status === "failed" ? "crit" : "plain"}>
                {last.job_status}
              </Pill>
              <span>Last read {fmtTime(last.started_at)}</span>
              <span className="muted">{last.triggered_by_id ? "by hand" : "nightly"}</span>
            </>
          ) : (
            <span className="muted">Not read yet.</span>
          )}
          <span className="muted">· {total} passages in use</span>
        </div>
        <div className="small muted">
          Struck-out old prices and every line with a price are left out: prices always come from Plans and
          prices. The client's approved answers win when the website says something different.
        </div>
      </div>
      {pages.length ? (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Passages</th>
                <th>Read</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.url}>
                  <td>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.url.replace("https://www.oxxy.in", "") || "/"}
                    </a>
                    {p.fetch_error && (
                      <div className="small" style={{ color: "var(--crit)" }}>
                        Last read failed: {p.fetch_error} (the earlier text is still used)
                      </div>
                    )}
                  </td>
                  <td>{p.passages}</td>
                  <td className="small">{fmtTime(p.fetched_at)}</td>
                  <td className="small">{fmtTime(p.changed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel-b">
          <Empty>No pages read yet. Press "Read now".</Empty>
        </div>
      )}
    </Panel>
  );
}
