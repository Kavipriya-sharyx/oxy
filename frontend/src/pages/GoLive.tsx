import { useQuery } from "@tanstack/react-query";
import { getGoLive, type GoLiveCheck } from "../api/ops.api";
import { Empty, ErrorNote, fmtTime, Panel, Pill, type Tone, usePageTitle } from "../components/ui";

const TONE: Record<GoLiveCheck["status"], Tone> = { ok: "ok", warn: "warn", blocker: "crit" };
const LABEL: Record<GoLiveCheck["status"], string> = {
  ok: "Ready",
  warn: "Check",
  blocker: "Missing",
};
const ORDER: Record<GoLiveCheck["status"], number> = { blocker: 0, warn: 1, ok: 2 };

/** What is really in the system right now: no sample data, nothing assumed. Read fresh from the server. */
export default function GoLive() {
  usePageTitle("Go-live check", "Admin · real data only");
  const q = useQuery({ queryKey: ["goLive"], queryFn: getGoLive, staleTime: 0 });
  const d = q.data;
  const areas = [...new Set((d?.checks ?? []).map((c) => c.area))];

  return (
    <>
      <div className="panel">
        <div className="panel-b small row">
          {d &&
            (d.ready ? (
              <Pill tone="ok">Ready to go live</Pill>
            ) : (
              <Pill tone="crit">Not ready: {d.blockers} missing</Pill>
            ))}
          {!!d?.warnings && <Pill tone="warn">{d.warnings} to check</Pill>}
          <span style={{ flex: 1, minWidth: 0 }}>
            The system holds no sample data. Until a plan has its real official link, renewal terms
            and activation time, the bot gives no price or link for it and hands the customer to the
            team.
          </span>
          {d && <span className="muted">Checked {fmtTime(d.checked_at)}</span>}
          <button className="btn sm" disabled={q.isFetching} onClick={() => void q.refetch()}>
            {q.isFetching ? "Checking…" : "Check again"}
          </button>
        </div>
      </div>
      <ErrorNote error={q.error} />
      {q.isLoading && <Empty>Checking…</Empty>}
      {areas.map((area) => {
        const rows = (d?.checks ?? [])
          .filter((c) => c.area === area)
          .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
        return (
          <Panel key={area} title={area} bodyless>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Status</th>
                    <th style={{ width: 220 }}>Item</th>
                    <th>What the system has now</th>
                    <th style={{ width: 240 }}>Where to fix it</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.item}>
                      <td>
                        <Pill tone={TONE[c.status]}>{LABEL[c.status]}</Pill>
                      </td>
                      <td>
                        <b>{c.item}</b>
                      </td>
                      <td className="small">{c.detail}</td>
                      <td className="small muted">{c.status === "ok" ? "" : c.fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </>
  );
}
