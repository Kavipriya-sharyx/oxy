import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRetention, type JobRun, type JobSummary, listReconciliation, runReconciliation, runRetention } from "../api/ops.api";
import { Empty, fmtTime, Panel, Pill, type Tone } from "./ui";

const TONE: Record<string, Tone> = { ok: "ok", failed: "crit", skipped: "plain", running: "info" };
const ISSUE: Record<string, string> = {
  missing_in_crm: "Open in the bot, not in the CRM",
  missing_in_bot: "Open in the CRM, not in the bot",
  status_differs: "Status differs",
};

function RunLine({ run }: { run?: JobRun }) {
  if (!run) return <span className="muted small">Not run yet.</span>;
  return (
    <span className="row small" style={{ gap: 8 }}>
      <Pill tone={TONE[run.job_status] ?? "plain"}>{run.job_status}</Pill>
      <span>{fmtTime(run.started_at)}</span>
      <span className="muted">{run.triggered_by_id ? "run by hand" : "nightly"}</span>
      {run.summary?.reason && <span className="muted">· {String(run.summary.reason)}</span>}
      {run.summary?.error && <span style={{ color: "var(--crit)" }}>· {String(run.summary.error)}</span>}
    </span>
  );
}

/** Full Plan 3.4: the nightly comparison of open bookings, tasks and activations with the CRM */
export function ReconciliationPanel() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["jobRuns", "reconciliation"], queryFn: listReconciliation });
  const run = useMutation({
    mutationFn: runReconciliation,
    onSuccess: async (r) => {
      message.info(`Check finished: ${r.job_status}`);
      await qc.invalidateQueries({ queryKey: ["jobRuns"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const last = q.data?.[0];
  const s: JobSummary = last?.summary ?? {};
  const mismatches = s.mismatches ?? [];
  return (
    <Panel
      title="Nightly check with the CRM"
      note="02:00 IST · open bookings, tasks and activations on both sides; nothing is changed automatically"
      actions={
        <button className="btn sm" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Checking…" : "Run now"}
        </button>
      }
      bodyless
    >
      <div className="panel-b">
        <RunLine run={last} />
        {last?.job_status === "ok" && (
          <div className="small" style={{ marginTop: 6 }}>
            Bot open: {s.bot_open?.bookings ?? 0} bookings, {s.bot_open?.tasks ?? 0} tasks, {s.bot_open?.activations ?? 0} activations ·
            CRM open: {s.crm_open?.bookings ?? 0} / {s.crm_open?.tasks ?? 0} / {s.crm_open?.activations ?? 0} · Outbox: {s.outbox?.dead ?? 0} dead,{" "}
            {s.outbox?.stuck ?? 0} waiting over 1 hour ·{" "}
            <b style={{ color: s.mismatch_count ? "var(--crit)" : undefined }}>{s.mismatch_count ?? 0} mismatches</b>
          </div>
        )}
      </div>
      {!!mismatches.length && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Record</th>
                <th>Issue</th>
                <th>Bot id</th>
                <th>CRM id</th>
                <th>Bot status</th>
                <th>CRM status</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((m, i) => (
                <tr key={i}>
                  <td>{m.kind}</td>
                  <td className="small">{ISSUE[m.issue] ?? m.issue}</td>
                  <td className="mono small">{m.bot_id ?? "—"}</td>
                  <td className="mono small">{m.crm_id ?? "—"}</td>
                  <td className="small">{m.bot_status ?? "—"}</td>
                  <td className="small">{m.crm_status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.isLoading && <Empty>Loading…</Empty>}
    </Panel>
  );
}

/** Playbook 16.3: the nightly data-retention job */
export function RetentionPanel() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["jobRuns", "retention"], queryFn: getRetention });
  const run = useMutation({
    mutationFn: runRetention,
    onSuccess: async (r) => {
      message.info(`Retention run: ${r.job_status}`);
      await qc.invalidateQueries({ queryKey: ["jobRuns"] });
      await qc.invalidateQueries({ queryKey: ["privacyRequests"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const last = q.data?.runs?.[0];
  const s: JobSummary = last?.summary ?? {};
  return (
    <Panel
      title="Data retention"
      note={
        q.data?.days
          ? `02:30 IST · data removed after ${q.data.days} days without a message, or after the customer's retention date`
          : "RETENTION_DAYS is not set yet [CONFIRM the period with legal]: nothing is removed"
      }
      actions={
        <button className="btn sm" disabled={run.isPending || !q.data?.days} onClick={() => run.mutate()}>
          {run.isPending ? "Running…" : "Run now"}
        </button>
      }
    >
      <RunLine run={last} />
      {last?.job_status === "ok" && (
        <div className="small" style={{ marginTop: 6 }}>
          Checked {s.checked ?? 0} customers · due {s.due ?? 0} · removed {s.erased ?? 0}
          {s.kept && Object.keys(s.kept).length > 0 && (
            <> · kept (open case): {Object.entries(s.kept).map(([k, v]) => `${k} ${v}`).join(", ")}</>
          )}
        </div>
      )}
      <div className="small muted" style={{ marginTop: 6 }}>
        Removed: names, age, health answers, message texts, notes and task summaries. Kept: the WhatsApp number and
        the opt-out (so a STOP is still honoured), ids, statuses and payment records. Never while a booking, an unpaid
        link, an open task or an active product exists.
      </div>
    </Panel>
  );
}
