import { useMemo, useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decidePlanChange, listPlanChanges, proposePlanChange } from "../api/ops.api";
import type { PlanCatalog } from "../types";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { Empty, fmtTime, Panel, Pill, type Tone } from "./ui";

// Two-person rule for prices and terms (Full Plan 6.1 / 8): one user proposes, a different user approves,
// and only then does the bot use the new values.
const FIELDS: [keyof PlanCatalog, string, "number" | "text"][] = [
  ["price", "Price (₹, excl. GST)", "number"],
  ["gst_rate", "GST rate (0.18 = 18%)", "number"],
  ["renewal_terms", "Renewal terms", "text"],
  ["activation_time", "Activation time", "text"],
  ["activation_link", "Official activation link (https)", "text"],
  ["max_saving_pct", "Savings up to (%)", "number"],
  ["illustration_pct", "Illustration rate (%)", "number"],
  ["age_limit", "Age limit (empty = none)", "number"],
];

const STATUS: Record<string, Tone> = { pending: "warn", approved: "ok", rejected: "crit", withdrawn: "plain" };

const label = (r?: PlanCatalog) =>
  r ? `${r.product === "oxxy" ? `Oxxy ${r.plan[0].toUpperCase()}${r.plan.slice(1)}` : "Cut Medi Bills"} · ${r.billing}` : "—";
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default function PlanChangePanel({ rows }: { rows: PlanCatalog[] }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { userId } = useAuth();
  const changes = useQuery({ queryKey: ["planChanges"], queryFn: listPlanChanges });
  const [catalogId, setCatalogId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const row = rows.find((r) => r.id === catalogId);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["planChanges"] });
    await qc.invalidateQueries({ queryKey: ["planCatalog"] });
  };
  const propose = useMutation({
    mutationFn: proposePlanChange,
    onSuccess: async () => {
      message.success("Proposed. A different user must approve it before the bot uses it.");
      setForm({});
      setReason("");
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "Approve" | "Reject" | "Withdraw" }) => decidePlanChange(id, action),
    onSuccess: async (_d, v) => {
      message.success(v.action === "Approve" ? "Approved: the bot uses the new values now." : `${v.action} done`);
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const submit = () => {
    if (!row) return;
    const out: Record<string, unknown> = {};
    for (const [k, , type] of FIELDS) {
      if (!(k in form)) continue;
      const raw = form[k as string];
      const before = row[k];
      const value = type === "number" ? (raw.trim() === "" ? null : Number(raw)) : raw;
      if (String(value ?? "") !== String(before ?? "")) out[k as string] = value;
    }
    if (!Object.keys(out).length) return message.info("Nothing changes");
    propose.mutate({ catalog_id: row.id, changes: out, reason });
  };

  const list = changes.data ?? [];
  return (
    <>
      {can("plans.edit") && (
        <Panel title="Propose a change" note="Two-person rule: a different user approves it">
          <div className="grid g2" style={{ gap: 10 }}>
            <label className="small">
              Plan
              <select
                className="input"
                style={{ width: "100%" }}
                value={catalogId}
                onChange={(e) => {
                  setCatalogId(e.target.value);
                  setForm({});
                }}
              >
                <option value="">Choose a plan…</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {label(r)} (v{r.version})
                  </option>
                ))}
              </select>
            </label>
            <label className="small">
              Reason (required)
              <input
                className="input"
                style={{ width: "100%" }}
                value={reason}
                maxLength={500}
                placeholder="e.g. official plan page updated on 14 Nov"
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {row &&
              FIELDS.map(([k, text, type]) => (
                <label key={k as string} className="small">
                  {text}
                  <input
                    className="input"
                    style={{ width: "100%" }}
                    type={type === "number" ? "number" : "text"}
                    value={form[k as string] ?? show(row[k]).replace(/^—$/, "")}
                    onChange={(e) => setForm((f) => ({ ...f, [k as string]: e.target.value }))}
                  />
                </label>
              ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" disabled={!row || !reason.trim() || propose.isPending} onClick={submit}>
              Propose change
            </button>
          </div>
        </Panel>
      )}
      <Panel title="Changes" note="Pending first; the bot uses a change only after approval" bodyless>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Change</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Asked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const mine = !!userId && c.requested_by_id === userId;
                return (
                  <tr key={c.id}>
                    <td className="small">{label(byId.get(c.catalog_id))}</td>
                    <td className="small">
                      {Object.entries(c.changes).map(([k, v]) => (
                        <div key={k}>
                          <span className="mono">{k}</span>: {show(c.before?.[k])} → <b>{show(v)}</b>
                        </div>
                      ))}
                    </td>
                    <td className="small">{c.reason}</td>
                    <td>
                      <Pill tone={STATUS[c.change_status] ?? "plain"}>
                        {c.change_status}
                        {c.applied_version ? ` (v${c.applied_version})` : ""}
                      </Pill>
                    </td>
                    <td className="small">
                      {fmtTime(c.created_on)}
                      {mine && <div className="muted">by you</div>}
                    </td>
                    <td>
                      {c.change_status === "pending" && (
                        <div className="row" style={{ gap: 6 }}>
                          {!mine && can("plans.approve") && (
                            <>
                              <button className="btn sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "Approve" })}>
                                Approve
                              </button>
                              <button className="btn sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "Reject" })}>
                                Reject
                              </button>
                            </>
                          )}
                          {mine && (
                            <button className="btn sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "Withdraw" })}>
                              Withdraw
                            </button>
                          )}
                          {mine && <span className="small muted">Waiting for another approver</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {changes.isLoading && <Empty>Loading…</Empty>}
          {!changes.isLoading && !list.length && <Empty>No changes proposed yet.</Empty>}
        </div>
      </Panel>
    </>
  );
}
