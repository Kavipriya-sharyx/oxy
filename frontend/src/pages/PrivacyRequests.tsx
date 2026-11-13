import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPrivacyRequests } from "../api/crm.api";
import { eraseCustomer } from "../api/ops.api";
import { Empty, ErrorNote, fmtTime, Pill, usePageTitle } from "../components/ui";
import { RetentionPanel } from "../components/JobRunPanels";

export default function PrivacyRequests() {
  usePageTitle("Data requests", "Admin · DPDP Act");
  const q = useQuery({ queryKey: ["privacyRequests"], queryFn: listPrivacyRequests });
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const erase = useMutation({
    mutationFn: eraseCustomer,
    onSuccess: async () => {
      message.success("Data removed and the privacy task closed.");
      await qc.invalidateQueries({ queryKey: ["privacyRequests"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const confirmErase = (customerId: string) =>
    modal.confirm({
      title: "Remove this customer's data now?",
      content:
        "Names, health answers, message texts and notes are removed for good. The number and the opt-out stay. " +
        "Refused while a booking, an unpaid link or another task is open.",
      okText: "Remove data",
      okButtonProps: { danger: true },
      onOk: () => erase.mutateAsync(customerId),
    });
  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          A customer who writes about privacy or deletion gets the fixed privacy reply, sales
          messages stop, and a privacy task is created. Records the law requires (payments, audit
          log) are kept and the reason is logged.
        </div>
      </div>
      <RetentionPanel />
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>WhatsApp</th>
                <th>Requested</th>
                <th>Health-data consent</th>
                <th>Marketing</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((r) => (
                <tr key={r.id ?? r.customer_id}>
                  <td>
                    <b>{r.customer?.first_name ?? "—"}</b>
                  </td>
                  <td className="mono small">{r.customer?.wa_number ?? r.customer_id}</td>
                  <td className="small">{fmtTime(r.privacy_request_at)}</td>
                  <td>
                    {r.health_data_consent ? <Pill tone="ok">Given</Pill> : <Pill>Not given</Pill>}
                  </td>
                  <td>
                    {r.marketing_consent ? (
                      <Pill tone="warn">Still allowed</Pill>
                    ) : (
                      <Pill tone="ok">Stopped</Pill>
                    )}
                  </td>
                  <td>
                    {r.erased_at ? (
                      <Pill tone="ok">Removed {fmtTime(r.erased_at)}</Pill>
                    ) : (
                      <button className="btn sm" disabled={erase.isPending} onClick={() => confirmErase(r.customer_id)}>
                        Remove data
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !(q.data ?? []).length && <Empty>No data requests.</Empty>}
        </div>
      </div>
    </>
  );
}
