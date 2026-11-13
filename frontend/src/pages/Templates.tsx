import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTemplates, syncTemplates, TEMPLATE_STATUSES, updateTemplate } from "../api/ops.api";
import { usePermissions } from "../hooks/usePermissions";
import { Empty, ErrorNote, fmtTime, Panel, Pill, type Tone, usePageTitle } from "../components/ui";

const TONE: Record<string, Tone> = {
  approved: "ok",
  submitted: "info",
  draft: "plain",
  rejected: "crit",
  paused: "warn",
  disabled: "crit",
};

export default function Templates() {
  usePageTitle("WhatsApp templates", "Control · status in Meta");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const edit = can("settings.manage");
  const q = useQuery({ queryKey: ["templates"], queryFn: listTemplates });
  const done = async () => qc.invalidateQueries({ queryKey: ["templates"] });
  const sync = useMutation({
    mutationFn: syncTemplates,
    onSuccess: async (r) => {
      message.success(`Read ${r.seen} templates from Meta (${r.added} new).`);
      await done();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const save = useMutation({
    mutationFn: ({ id, meta_status }: { id: string; meta_status: string }) => updateTemplate(id, { meta_status }),
    onSuccess: done,
    onError: (e: Error) => message.error(e.message),
  });
  const rows = q.data ?? [];
  const notReady = rows.filter((r) => r.meta_status !== "approved").length;

  return (
    <>
      <div className="panel">
        <div className="panel-b small row">
          {notReady ? <Pill tone="warn">{notReady} not approved</Pill> : <Pill tone="ok">All approved</Pill>}
          <span style={{ flex: 1, minWidth: 0 }}>
            Outside the 24-hour window the bot may send only approved templates (follow-ups, rescues, the payment
            reminder, booking updates). A template marked rejected, paused or disabled is not sent: the follow-up is
            logged as skipped instead.
          </span>
        </div>
      </div>
      <ErrorNote error={q.error} />
      <Panel
        title="Templates"
        note="Set by hand, or read from Meta with the WhatsApp Business Account ID (Configuration)"
        actions={
          edit && (
            <button className="btn sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? "Reading…" : "Read status from Meta"}
            </button>
          )
        }
        bodyless
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Language</th>
                <th>Category</th>
                <th>Used for</th>
                <th>Status</th>
                <th>Last read from Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono small">
                    <b>{r.name}</b>
                  </td>
                  <td className="mono small">{r.language}</td>
                  <td className="small">{r.category ?? "—"}</td>
                  <td className="small">{r.purpose ?? "—"}</td>
                  <td>
                    {edit ? (
                      <select
                        className="input"
                        value={r.meta_status}
                        disabled={save.isPending}
                        onChange={(e) => save.mutate({ id: r.id, meta_status: e.target.value })}
                      >
                        {TEMPLATE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Pill tone={TONE[r.meta_status] ?? "plain"}>{r.meta_status}</Pill>
                    )}
                  </td>
                  <td className="small">{r.last_synced_at ? fmtTime(r.last_synced_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !rows.length && <Empty>No templates yet.</Empty>}
        </div>
      </Panel>
    </>
  );
}
