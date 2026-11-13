import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listOutbox, listWebhooks, retryOutbox } from "../api/crm.api";
import {
  Empty,
  ErrorNote,
  fmtTime,
  Panel,
  Pill,
  Stat,
  type Tone,
  usePageTitle,
} from "../components/ui";

const STATUS: Record<string, [string, Tone]> = {
  pending: ["Pending", "info"],
  sent: ["Sent", "ok"],
  failed: ["Retrying", "warn"],
  dead: ["Dead letter", "crit"],
};

export default function CrmSync() {
  usePageTitle("CRM sync", "Admin · in-house CRM");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const outbox = useQuery({
    queryKey: ["crm", "outbox"],
    queryFn: listOutbox,
    refetchInterval: 15_000,
  });
  const hooks = useQuery({
    queryKey: ["crm", "webhooks"],
    queryFn: listWebhooks,
    refetchInterval: 15_000,
  });
  const retry = useMutation({
    mutationFn: retryOutbox,
    onSuccess: async () => {
      message.success("Queued again");
      await qc.invalidateQueries({ queryKey: ["crm", "outbox"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const rows = outbox.data ?? [];
  const n = (s: string) => rows.filter((r) => r.sync_status === s).length;

  return (
    <>
      <div className="grid g4">
        <Stat label="Pending" value={n("pending")} detail="Waiting to be sent" />
        <Stat label="Retrying" value={n("failed")} detail="1, 5, 15, 60 min, then hourly" />
        <Stat
          label="Dead letters"
          value={<span style={{ color: n("dead") ? "var(--crit)" : undefined }}>{n("dead")}</span>}
          detail="Gave up after 24 hours or a 4xx"
        />
        <Stat
          label="Webhooks received"
          value={hooks.data?.length ?? "…"}
          detail="Signed with HMAC-SHA256"
        />
      </div>
      <ErrorNote error={outbox.error || hooks.error} />
      <Panel
        title="Bot to CRM (outbox)"
        note="Saved with the bot change, then sent; its id is the Idempotency-Key"
        bodyless
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Created</th>
                <th>Next try</th>
                <th>CRM record</th>
                <th>Last error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [l, t] = STATUS[r.sync_status] ?? [r.sync_status, "plain" as Tone];
                return (
                  <tr key={r.id}>
                    <td className="mono small">{r.action}</td>
                    <td>
                      <Pill tone={t}>{l}</Pill>
                    </td>
                    <td className="mono">{r.attempts}</td>
                    <td className="small">{fmtTime(r.created_on)}</td>
                    <td className="small">
                      {r.sync_status === "failed" ? fmtTime(r.next_attempt_at) : "—"}
                    </td>
                    <td className="mono small">{r.crm_record_id ?? "—"}</td>
                    <td className="small" style={{ color: "var(--crit)", maxWidth: 280 }}>
                      {r.last_error ?? ""}
                    </td>
                    <td>
                      {(r.sync_status === "failed" || r.sync_status === "dead") && (
                        <button
                          className="btn sm"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(r.id)}
                        >
                          Retry now
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!outbox.isLoading && !rows.length && (
            <Empty>Nothing sent to the CRM yet. (CRM_ENABLED may be off.)</Empty>
          )}
        </div>
      </Panel>
      <Panel
        title="CRM to bot (webhooks)"
        note="Stored by event id before processing; a repeat is ignored"
        bodyless
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Event id</th>
                <th>Event</th>
                <th>Received</th>
                <th>Processed</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {(hooks.data ?? []).map((w) => (
                <tr key={w.event_id}>
                  <td className="mono small">{w.event_id}</td>
                  <td className="mono small">{w.event_type}</td>
                  <td className="small">{fmtTime(w.created_on)}</td>
                  <td>
                    {w.processed_at ? (
                      <Pill tone="ok">{fmtTime(w.processed_at)}</Pill>
                    ) : (
                      <Pill tone="warn">Not yet</Pill>
                    )}
                  </td>
                  <td className="small" style={{ color: "var(--crit)" }}>
                    {w.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!hooks.isLoading && !(hooks.data ?? []).length && <Empty>No webhooks yet.</Empty>}
        </div>
      </Panel>
    </>
  );
}
