import { useQuery } from "@tanstack/react-query";
import { listPlanCatalog } from "../api/planCatalog.api";
import type { PlanCatalog as PlanRow } from "../types";
import { Empty, ErrorNote, inr, Panel, Pill, usePageTitle } from "../components/ui";

const ORDER = ["everyday", "vital", "thrive", "infinity"];
const FIT: Record<string, string> = {
  everyday: "Routine OPD, new diseases, eye and dental check-ups",
  vital: "Broader OPD and IPD, eye, dental and skin check-ups",
  thrive: "New and pre-existing diseases, larger expected expense",
  infinity: "Broadest OPD and IPD; no age limit",
};
const gstOf = (r?: PlanRow) => Number(r?.gst_rate ?? 0.18);

export default function PlanCatalog() {
  usePageTitle("Plans and prices", "Control · from plan_catalog");
  const q = useQuery({ queryKey: ["planCatalog"], queryFn: listPlanCatalog });
  const rows = q.data ?? [];
  const find = (product: string, plan: string, billing: string) =>
    rows.find((r) => r.product === product && r.plan === plan && r.billing === billing);
  const cmbM = rows.find((r) => r.product === "cut_medi_bills" && r.billing === "monthly");
  const cmbY = rows.find((r) => r.product === "cut_medi_bills" && r.billing !== "monthly");

  return (
    <>
      <div className="panel">
        <div className="panel-b small row">
          <Pill tone="warn">Confirm before launch</Pill>
          <span style={{ flex: 1, minWidth: 0 }}>
            The bot reads every price, GST rate, renewal term and link from this catalogue. Claude
            never writes a price. Values marked [CONFIRM] are still open with Oxxy.
          </span>
        </div>
      </div>
      <ErrorNote error={q.error} />
      <Panel
        title="Oxxy plans"
        note="Recommend one plan; show all four only when the customer asks to compare"
        bodyless
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Monthly</th>
                <th>Yearly</th>
                <th>Age</th>
                <th>Savings up to</th>
                <th>Illustration rate</th>
                <th>Yearly + GST</th>
                <th>Break-even spend</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((p) => {
                const y = find("oxxy", p, "yearly");
                const m = find("oxxy", p, "monthly");
                if (!y && !m) return null;
                const rate = Number(y?.illustration_pct ?? y?.max_saving_pct ?? 0);
                const withGst = y ? Math.round(y.price * (1 + gstOf(y))) : null;
                return (
                  <tr key={p}>
                    <td>
                      <b>{p[0].toUpperCase() + p.slice(1)}</b>
                      <div className="small muted">{FIT[p]}</div>
                    </td>
                    <td className="mono">{inr(m?.price)}</td>
                    <td className="mono">{inr(y?.price)}</td>
                    <td>{y?.age_limit ? `Up to ${y.age_limit}` : "No age limit"}</td>
                    <td className="mono">{y?.max_saving_pct ?? "—"}%</td>
                    <td className="mono">{rate}%</td>
                    <td className="mono">{inr(withGst)}</td>
                    <td className="mono">
                      {withGst && rate ? `${inr(Math.ceil(withGst / (rate / 100)))}/yr` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
        </div>
      </Panel>
      <div className="grid g2">
        <Panel title="Cut Medi Bills" note="Always written in full">
          <dl className="kv">
            <dt>Monthly</dt>
            <dd>
              <span className="mono">{inr(cmbM?.price)}</span> + GST · {cmbM?.renewal_terms ?? "—"}
            </dd>
            <dt>Annual</dt>
            <dd>
              <span className="mono">{inr(cmbY?.price)}</span> + GST · {cmbY?.renewal_terms ?? "—"}
            </dd>
            <dt>Activation</dt>
            <dd>{cmbM?.activation_time ?? "—"}</dd>
            <dt>Age</dt>
            <dd>No age limit</dd>
            <dt>Value check</dt>
            <dd>30% of the one known bill must be more than the monthly price + GST</dd>
          </dl>
        </Panel>
        <Panel title="Which plan the bot recommends" note="Full Plan 12.3" bodyless>
          <div className="tbl-wrap">
            <table>
              <tbody>
                {[
                  ["Routine consultations and tests", "Everyday"],
                  ["OPD plus possible hospitalisation", "Vital"],
                  ["Pre-existing condition or larger expected expense", "Thrive"],
                  [
                    "Age above other limits; cancer, cardiac, kidney, major surgery, IVF",
                    "Infinity",
                  ],
                  ["One upcoming expense whose saving beats the price + GST", "Cut Medi Bills"],
                ].map(([a, b]) => (
                  <tr key={b}>
                    <td className="small">{a}</td>
                    <td>
                      <b>{b}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Panel
        title="Links and terms"
        note="What the bot sends after the disclosure and a YES"
        bodyless
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Billing</th>
                <th>Renewal</th>
                <th>Activation time</th>
                <th>Official link</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.product === "oxxy" ? `Oxxy ${r.plan}` : "Cut Medi Bills"}</td>
                  <td>{r.billing}</td>
                  <td className="small">{r.renewal_terms ?? "—"}</td>
                  <td className="small">{r.activation_time ?? "—"}</td>
                  <td className="mono small" style={{ wordBreak: "break-all" }}>
                    {r.activation_link ?? "—"}
                  </td>
                  <td className="mono">{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
