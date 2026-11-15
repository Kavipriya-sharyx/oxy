import { useMemo, useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decidePlanChange, listPlanChanges, proposePlanChange } from "../api/ops.api";
import type { PlanCatalog } from "../types";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { Empty, fmtTime, Panel, Pill, type Tone } from "./ui";

// Prices and terms: a saved change is used by the bot at once (the client chose no second approver). Every
// change stays in the history with who made it and the old and new values.
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

const STATUS: Record<string, Tone> = {
  applied: "ok",
  pending: "warn",
  approved: "ok",
  rejected: "crit",
  withdrawn: "plain",
};

const label = (r?: PlanCatalog) =>
  r
    ? `${r.product === "oxxy" ? `Oxxy ${r.plan[0].toUpperCase()}${r.plan.slice(1)}` : "Cut Medi Bills"} · ${r.billing}`
    : "—";
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default function PlanChangePanel({ rows }: { rows: PlanCatalog[] }) {
  const { message, modal } = App.useApp();
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
      message.success("Saved. The bot uses the new values from the next message.");
      setForm({});
      setReason("");
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "Approve" | "Reject" | "Withdraw" }) =>
      decidePlanChange(id, action),
    onSuccess: async (_d, v) => {
      message.success(
        v.action === "Approve" ? "Approved: the bot uses the new values now." : `${v.action} done`,
      );
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
    // it goes live at once, so the person sees exactly what changes before saving
    modal.confirm({
      title: `Change ${label(row)}?`,
      content: (
        <div className="small">
          {Object.entries(out).map(([k, v]) => (
            <div key={k}>
              {FIELDS.find(([f]) => f === k)?.[1] ?? k}: {show(row[k as keyof PlanCatalog])} →{" "}
              <b>{show(v)}</b>
            </div>
          ))}
          <div className="muted" style={{ marginTop: 8 }}>
            The bot uses this from the next message.
          </div>
        </div>
      ),
      okText: "Save change",
      onOk: () => propose.mutateAsync({ catalog_id: row.id, changes: out, reason }),
    });
  };

  const list = changes.data ?? [];
  return (
    <>
      {can("plans.edit") && (
        <Panel title="Change a plan" note="Saved changes are used by the bot at once">
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
              Note (optional)
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
            <button className="btn sm pri" disabled={!row || propose.isPending} onClick={submit}>
              Save change
            </button>
          </div>
        </Panel>
      )}
      <Panel title="Change history" note="Who changed what, newest first" bodyless>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Change</th>
                <th>Note</th>
                <th>Status</th>
                <th>When</th>
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
                          <span className="mono">{k}</span>: {show(c.before?.[k])} →{" "}
                          <b>{show(v)}</b>
                        </div>
                      ))}
                    </td>
                    <td className="small">{c.reason}</td>
                    <td>
                      <Pill tone={STATUS[c.change_status] ?? "plain"}>
                        {c.change_status === "applied" ? "live" : c.change_status}
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
                          {(can("plans.approve") || can("plans.edit")) && (
                            <>
                              <button
                                className="btn sm"
                                disabled={decide.isPending}
                                onClick={() => decide.mutate({ id: c.id, action: "Approve" })}
                              >
                                Approve
                              </button>
                              <button
                                className="btn sm"
                                disabled={decide.isPending}
                                onClick={() => decide.mutate({ id: c.id, action: "Reject" })}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <span className="small muted">Saved before changes applied at once</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {changes.isLoading && <Empty>Loading…</Empty>}
          {!changes.isLoading && !list.length && <Empty>No changes yet.</Empty>}
        </div>
      </Panel>
    </>
  );
}
