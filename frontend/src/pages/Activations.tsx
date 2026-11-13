import { App } from "antd";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listActivations, setActivationResult } from "../api/work.api";
import { usePermissions } from "../hooks/usePermissions";
import {
  Empty,
  ErrorNote,
  fmtTime,
  inr,
  Pill,
  Stat,
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

export default function Activations() {
  usePageTitle("Activations", "Paid only through the official link");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const q = useQuery({
    queryKey: ["activations"],
    queryFn: listActivations,
    refetchInterval: 30_000,
  });
  const rows = q.data?.rows ?? [];
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
  const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;

  return (
    <>
      <div className="grid g4">
        <Stat
          label="Active"
          value={n((r) => r.activation_status === "active")}
          detail="One product per customer"
        />
        <Stat
          label="Links not paid"
          value={n((r) => r.payment_status === "pending")}
          detail="One reminder only (Trigger Q)"
        />
        <Stat
          label="Payment problems"
          value={n((r) => r.payment_status === "failed")}
          detail="Escalated to payment support"
        />
        <Stat
          label="Collected (excl. GST)"
          value={inr(
            rows
              .filter((r) => r.payment_status === "paid")
              .reduce((s, r) => s + Number(r.catalog?.price ?? 0), 0),
          )}
        />
      </div>
      <div className="panel">
        <div className="panel-b small">
          The bot sends one official link after the price disclosure and a YES, and records{" "}
          <span className="mono">create_activation</span>.{" "}
          {crm
            ? "The sales team checks the payment; the CRM's activation.paid / activation.failed webhook updates this list."
            : "The CRM is not connected, so an admin records the payment result here after checking the payment system."}
        </div>
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
                return (
                  <tr key={a.id}>
                    <td>
                      {a.customer ? (
                        <Link to={`/live-chat?q=${encodeURIComponent(a.customer.wa_number)}`}>
                          {a.customer.first_name || a.customer.wa_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{a.product === "oxxy" ? `Oxxy ${a.plan}` : "Cut Medi Bills"}</td>
                    <td>{a.billing}</td>
                    <td className="mono">{inr(a.catalog?.price)}</td>
                    <td className="small">{fmtTime(a.link_sent_at)}</td>
                    <td>
                      <Pill tone={pt}>{pl}</Pill>
                    </td>
                    <td>
                      <Pill tone={at}>{al}</Pill>
                    </td>
                    <td>
                      {canRecord && a.payment_status === "pending" && (
                        <div
                          className="row"
                          style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}
                        >
                          <button className="btn sm pri" onClick={() => ask(a.id, "paid")}>
                            Paid
                          </button>
                          <button className="btn sm" onClick={() => ask(a.id, "failed")}>
                            Failed
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !rows.length && <Empty>No activation links sent yet.</Empty>}
        </div>
      </div>
    </>
  );
}
