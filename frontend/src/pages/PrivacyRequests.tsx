import { useQuery } from "@tanstack/react-query";
import { listPrivacyRequests } from "../api/crm.api";
import { Empty, ErrorNote, fmtTime, Pill, usePageTitle } from "../components/ui";

export default function PrivacyRequests() {
  usePageTitle("Data requests", "Admin · DPDP Act");
  const q = useQuery({ queryKey: ["privacyRequests"], queryFn: listPrivacyRequests });
  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          A customer who writes about privacy or deletion gets the fixed privacy reply, sales
          messages stop, and a privacy task is created. Records the law requires (payments, audit
          log) are kept and the reason is logged.
        </div>
      </div>
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
