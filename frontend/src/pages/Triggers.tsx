import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getTriggers } from "../api/crm.api";
import { Empty, ErrorNote, Panel, Pill, Tabs, usePageTitle } from "../components/ui";

export default function Triggers() {
  usePageTitle("Triggers A–R", "Trigger & Conversion Layer");
  const [view, setView] = useState<"rules" | "events">("rules");
  const q = useQuery({ queryKey: ["triggers"], queryFn: getTriggers, refetchInterval: 30_000 });
  const events = q.data?.events ?? [];
  const counts = events.reduce<Record<string, number>>(
    (m, e) => ((m[e.trigger_id] = (m[e.trigger_id] ?? 0) + 1), m),
    {},
  );
  const max = Math.max(1, ...Object.values(counts));

  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          <Link to="/flows" className="btn sm" style={{ float: "right", marginLeft: 12 }}>
            See the flows
          </Link>
          Priority order: emergency → opt-out or privacy → complaint, payment or human → direct
          question → booking → trust and education → plan and activation → follow-up. One trigger
          per message, then wait for the reply. Triggers never override the hard rules.
        </div>
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          ["rules", "Rules A–R"],
          ["events", `Fired (${events.length})`],
        ]}
      />
      <ErrorNote error={q.error} />
      {view === "rules" ? (
        <Panel bodyless>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Trigger</th>
                  <th>Fires when</th>
                  <th style={{ width: "22%" }}>Sent (recent)</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.catalog ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="tag">{t.id}</span>
                    </td>
                    <td>
                      <b>{t.name}</b>
                    </td>
                    <td className="small">{t.when}</td>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <div className="bar" style={{ flex: 1, minWidth: 50 }}>
                          <span
                            style={{
                              width: `${((counts[t.id] ?? 0) / max) * 100}%`,
                              background: t.id === "R" ? "var(--crit)" : undefined,
                            }}
                          />
                        </div>
                        <span className="mono small">{counts[t.id] ?? 0}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {q.isLoading && <Empty>Loading…</Empty>}
          </div>
        </Panel>
      ) : (
        <Panel bodyless>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trigger</th>
                  <th>Customer</th>
                  <th>Reason</th>
                  <th>Suppressed</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className="tag">{e.trigger_id}</span>
                    </td>
                    <td className="mono small">{e.customer?.wa_number ?? e.customer_id}</td>
                    <td className="small">{e.reason ?? "—"}</td>
                    <td>
                      {e.suppression_reason ? (
                        <Pill tone="warn">{e.suppression_reason}</Pill>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!q.isLoading && !events.length && <Empty>No triggers fired yet.</Empty>}
          </div>
        </Panel>
      )}
    </>
  );
}
