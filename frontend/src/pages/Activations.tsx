import { useEffect, useState } from "react";
import { App } from "antd";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listActivations, setActivationResult, type ActivationRow } from "../api/work.api";
import { usePermissions } from "../hooks/usePermissions";
import {
  Empty,
  ErrorNote,
  fmtTime,
  inr,
  Pill,
  Stat,
  Tabs,
  type Tone,
  usePageTitle,
} from "../components/ui";

const PAY: Record<string, [string, Tone]> = {
  pending: ["Link sent", "warn"],
  paid: ["Paid", "ok"],
  failed: ["Failed", "crit"],
  cancelled: ["Cancelled", "plain"],
};
const ACT: Record<string, [string, Tone]> = {
  pending: ["Pending", "warn"],
  link_sent: ["Pending", "warn"],
  active: ["Active", "ok"],
  failed: ["Not active", "plain"],
};

type View = "all" | "pending" | "paid" | "failed";
const STALE_DAYS = 2; // an unpaid link older than this is highlighted

const ageDays = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
const ageText = (iso?: string | null) => {
  const d = ageDays(iso);
  if (d == null) return "";
  if (d <= 0) return "today";
  return d === 1 ? "1 day ago" : `${d} days ago`;
};
// the price and GST rate saved when the link was sent win over today's catalogue price
const netPrice = (a: ActivationRow) => Number(a.price ?? a.catalog?.price ?? 0);
const gstRate = (a: ActivationRow) => Number(a.gst_rate ?? a.catalog?.gst_rate ?? 0);

function exportCsv(rows: ActivationRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = [
    "Customer",
    "WhatsApp",
    "Product",
    "Plan",
    "Billing",
    "Price excl GST",
    "GST",
    "Total incl GST",
    "Link sent",
    "Payment",
    "Activation",
  ];
  const lines = rows.map((a) => {
    const net = netPrice(a);
    const gst = net * gstRate(a);
    return [
      a.customer?.first_name,
      a.customer?.wa_number,
      a.product,
      a.plan,
      a.billing,
      net.toFixed(2),
      gst.toFixed(2),
      (net + gst).toFixed(2),
      a.link_sent_at,
      a.payment_status,
      a.activation_status,
    ]
      .map(esc)
      .join(",");
  });
  const text = "﻿" + [head.map(esc).join(","), ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `activations-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Activations() {
  usePageTitle("Activations", "Paid only through the official link");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const q = useQuery({
    queryKey: ["activations", view, term],
    queryFn: () => listActivations(view === "all" ? undefined : view, term),
    refetchInterval: 30_000,
  });
  // unpaid links first, oldest link first (the ones most at risk), then the rest newest first
  const rows = [...(q.data?.rows ?? [])].sort((a, b) => {
    const pa = a.payment_status === "pending" ? 0 : 1;
    const pb = b.payment_status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.link_sent_at ?? a.created_on ?? 0).getTime();
    const tb = new Date(b.link_sent_at ?? b.created_on ?? 0).getTime();
    return pa === 0 ? ta - tb : tb - ta;
  });
  const sum = q.data?.summary;
  const crm = q.data?.crmEnabled ?? false;
  const canRecord = !crm && can("activations.record");
  const record = useMutation({
    mutationFn: ({ id, result }: { id: string; result: "paid" | "failed" }) =>
      setActivationResult(id, result),
    onSuccess: async () => {
      message.success("Saved");
      await qc.invalidateQueries({ queryKey: ["activations"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const ask = (id: string, result: "paid" | "failed") =>
    modal.confirm({
      title:
        result === "paid" ? "Record this payment as received?" : "Record this payment as failed?",
      content:
        result === "paid"
          ? "Only after you checked it in the payment system. The product becomes active and the other product is locked."
          : "Activation reminders stop for this link.",
      okText: result === "paid" ? "Yes, paid" : "Yes, failed",
      onOk: () => record.mutateAsync({ id, result }),
    });

  return (
    <>
      <div className="grid g4">
        <Stat label="Active" value={sum?.active ?? "…"} detail="One product per customer" />
        <Stat
          label="Links not paid"
          value={sum?.unpaid ?? "…"}
          detail="One reminder only (Trigger Q)"
        />
        <Stat
          label="Payment problems"
          value={sum?.failed ?? "…"}
          detail="Escalated to payment support"
        />
        <Stat
          label="Collected (excl. GST)"
          value={sum ? inr(sum.collected_net) : "…"}
          detail={sum ? `${inr(sum.collected_gross)} incl. GST · all activations` : undefined}
        />
      </div>
      <div className="panel">
        <div className="panel-b small">
          The bot sends one official link after the price disclosure and a YES, and records{" "}
          <span className="mono">create_activation</span>.{" "}
          {crm
            ? "The sales team checks the payment; the CRM's activation.paid / activation.failed webhook updates this list."
            : "After checking the payment, record the result here, or the client's CRM sends it through the Oxxy API (Activations / Payment)."}
        </div>
      </div>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            ["all", "All"],
            ["pending", "Link sent"],
            ["paid", "Paid"],
            ["failed", "Failed"],
          ]}
        />
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Search name, number or plan"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="spacer" />
        <button className="btn" disabled={!rows.length} onClick={() => exportCsv(rows)}>
          Export CSV
        </button>
      </div>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Product</th>
                <th>Billing</th>
                <th>Price (excl. GST)</th>
                <th>Link sent</th>
                <th>Payment</th>
                <th>Activation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const [pl, pt] = PAY[a.payment_status] ?? [a.payment_status, "plain" as Tone];
                const [al, at] = ACT[a.activation_status] ?? [a.activation_status, "plain" as Tone];
                const stale =
                  a.payment_status === "pending" && (ageDays(a.link_sent_at) ?? 0) > STALE_DAYS;
                return (
                  <tr key={a.id}>
                    <td>
                      {a.customer ? (
                        <>
                          <Link to={`/live-chat?q=${encodeURIComponent(a.customer.wa_number)}`}>
                            {a.customer.first_name || a.customer.wa_number}
                          </Link>
                          <div className="small muted mono">{a.customer.wa_number}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{a.product === "oxxy" ? `Oxxy ${a.plan}` : "Cut Medi Bills"}</td>
                    <td>{a.billing}</td>
                    <td className="mono">
                      {inr(netPrice(a))}
                      <div className="small muted">
                        {inr(netPrice(a) * (1 + gstRate(a)))} incl. GST
                      </div>
                    </td>
                    <td className="small">
                      {fmtTime(a.link_sent_at)}
                      {a.payment_status === "pending" && (
                        <div style={stale ? { color: "var(--crit)", fontWeight: 600 } : undefined}>
                          {ageText(a.link_sent_at)}
                          {stale && " · follow up"}
                        </div>
                      )}
                    </td>
                    <td>
                      <Pill tone={pt}>{pl}</Pill>
                    </td>
                    <td>
                      <Pill tone={at}>{al}</Pill>
                    </td>
                    <td>
                      <div
                        className="row"
                        style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}
                      >
                        {a.payment_status === "failed" && a.customer && (
                          <Link
                            className="btn sm"
                            to={`/escalations?q=${encodeURIComponent(a.customer.wa_number)}`}
                          >
                            Payment support
                          </Link>
                        )}
                        {canRecord && a.payment_status === "pending" && (
                          <>
                            <button className="btn sm pri" onClick={() => ask(a.id, "paid")}>
                              Paid
                            </button>
                            <button className="btn sm" onClick={() => ask(a.id, "failed")}>
                              Failed
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !rows.length && (
            <Empty>
              {view !== "all" || term
                ? "No activations match this filter."
                : "No activation links sent yet."}
            </Empty>
          )}
        </div>
      </div>
    </>
  );
}
