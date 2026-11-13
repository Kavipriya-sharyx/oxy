import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReports } from "../api/crm.api";
import { getKpis, type Kpis } from "../api/insights.api";
import { Empty, ErrorNote, Panel, Pill, Stat, usePageTitle } from "../components/ui";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

const TRIGGER_NAMES: Record<string, string> = {
  A: "Trust pack",
  B: "Insurance vs Oxxy",
  C: "Why activate",
  D: "Nearby centres",
  E: "Plan and activation",
  F: "Savings illustration",
  G: "Booking request",
  H: "Booking saved",
  I: "Cut Medi Bills route",
  J: "Insurance coordination",
  K: "Medicines",
  L: "News and testimonials",
  M: "One objection",
  N: "Agreed follow-up",
  O: "Senior callback",
  P: "Payment completed",
  Q: "Incomplete activation",
  R: "Stop commercial flow",
};

function Funnel({ k }: { k: Kpis }) {
  const rows: [string, string, number, number, number | null][] = [
    ["Trust pack → kept talking", "A sent, then a customer reply", k.trust_pack_to_continued.continued, k.trust_pack_to_continued.sent, k.trust_pack_to_continued.rate],
    ["Centre list → booking request", "D shown, then a booking", k.centre_list_to_booking.booked, k.centre_list_to_booking.lists, k.centre_list_to_booking.rate],
    ["Plan recommended → link asked", "E, then the customer said YES to the link", k.plan_to_acceptance.accepted, k.plan_to_acceptance.recommended, k.plan_to_acceptance.rate],
    ["Activation link → payment", "Links sent that were paid", k.link_to_payment.paid, k.link_to_payment.links, k.link_to_payment.rate],
    ["Booking only → activated later", "Bookings made with no activation, paid later", k.booking_to_later_activation.later_activated, k.booking_to_later_activation.bookings_without_activation, k.booking_to_later_activation.rate],
    ["Callback → resolved", "Escalations and callbacks closed", k.callback_resolution.resolved, k.callback_resolution.callbacks, k.callback_resolution.resolution_rate],
    ["Callback → activated", "Customers who paid after a callback", k.callback_resolution.activated, k.callback_resolution.callbacks, k.callback_resolution.activation_rate],
  ];
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Measure</th>
            <th style={{ textAlign: "right" }}>Converted</th>
            <th style={{ textAlign: "right" }}>Out of</th>
            <th style={{ width: "30%" }}>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, note, num, den, rate]) => (
            <tr key={label}>
              <td>
                <b>{label}</b>
                <div className="small muted">{note}</div>
              </td>
              <td className="mono" style={{ textAlign: "right" }}>{num}</td>
              <td className="mono" style={{ textAlign: "right" }}>{den}</td>
              <td>
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <div className="bar" style={{ flex: 1 }}>
                    <span style={{ width: `${Math.min(100, rate ?? 0)}%` }} />
                  </div>
                  <span className="mono small" style={{ minWidth: 48, textAlign: "right" }}>{pct(rate)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  usePageTitle("Reports", "Control");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({ queryKey: ["reports"], queryFn: getReports, refetchInterval: 30_000 });
  const kq = useQuery({ queryKey: ["kpis", from, to], queryFn: () => getKpis(from || undefined, to || undefined) });
  const d = q.data ?? {};
  const k = kq.data;
  const n = (key: string) => (q.isLoading ? "…" : (d[key] ?? 0));
  const total = Number(d.totalConversations ?? 0);
  const bars: [string, number][] = [
    ["Conversations", total],
    ["With a person or paused", Number(d.pausedOrEscalated ?? 0)],
    ["Booking requests (pending)", Number(d.pendingBookings ?? 0)],
    ["Bookings confirmed", Number(d.confirmedBookings ?? 0)],
    ["Opted out", Number(d.optedOut ?? 0)],
  ];
  const max = Math.max(1, ...bars.map((b) => b[1]));
  const fired = (k?.trigger_to_response ?? []).filter((t) => t.fired || t.suppressed);

  return (
    <>
      <ErrorNote error={q.error || kq.error} />
      <div className="grid g4">
        <Stat label="Conversations" value={n("totalConversations")} to="/live-chat" />
        <Stat label="Pending bookings" value={n("pendingBookings")} detail="Waiting for the sales team" to="/bookings" />
        <Stat
          label="Link to payment"
          value={k ? pct(k.link_to_payment.rate) : "…"}
          detail={k ? `${k.link_to_payment.paid} of ${k.link_to_payment.links} links paid` : undefined}
          to="/activations"
        />
        <Stat
          label="Rule violations"
          value={k ? k.violations.total : "…"}
          detail="Duplicates and caps. Target 0"
        />
      </div>

      <Panel
        title="Conversion measures"
        note={k ? `${k.range.from} to ${k.range.to} (IST)` : "Trigger & Conversion Layer 13.1"}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <input className="input" type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
            <input className="input" type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          </div>
        }
        bodyless
      >
        {k ? <Funnel k={k} /> : <Empty>{kq.isLoading ? "Loading…" : "No data"}</Empty>}
      </Panel>

      <Panel title="Trigger-to-response rate by trigger" note="Ignored = no reply within 24 hours. Suppressed sends are not counted." bodyless>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Trigger</th>
                <th style={{ textAlign: "right" }}>Fired</th>
                <th style={{ textAlign: "right" }}>Response</th>
                <th style={{ textAlign: "right" }}>Clicked</th>
                <th style={{ textAlign: "right" }}>Declined</th>
                <th style={{ textAlign: "right" }}>Ignored</th>
                <th style={{ textAlign: "right" }}>Opt-out</th>
                <th style={{ textAlign: "right" }}>Complaint</th>
                <th style={{ textAlign: "right" }}>Suppressed</th>
              </tr>
            </thead>
            <tbody>
              {fired.map((t) => (
                <tr key={t.trigger_id}>
                  <td>
                    <b className="mono">{t.trigger_id}</b> {TRIGGER_NAMES[t.trigger_id]}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>{t.fired}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{pct(t.response_rate)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{t.clicked}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{t.declined}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{t.ignored}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{pct(t.opt_out_rate)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{pct(t.complaint_rate)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{t.suppressed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {k && !fired.length && <Empty>No triggers in this period.</Empty>}
        </div>
      </Panel>

      <div className="grid g2">
        <Panel title="Opt-outs and complaints by trigger sequence" note={k ? `${k.opt_out_and_complaint_by_sequence.journeys} journeys` : undefined} bodyless>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trigger path</th>
                  <th>Ended in</th>
                  <th style={{ textAlign: "right" }}>Journeys</th>
                </tr>
              </thead>
              <tbody>
                {(k?.opt_out_and_complaint_by_sequence.sequences ?? []).map((s) => (
                  <tr key={s.path + s.outcome}>
                    <td className="mono">{s.path}</td>
                    <td>{s.outcome === "opted_out" ? <Pill tone="warn">Opt-out</Pill> : <Pill tone="crit">Complaint</Pill>}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {k && !k.opt_out_and_complaint_by_sequence.sequences.length && <Empty>None in this period.</Empty>}
          </div>
        </Panel>
        <Panel title="Duplicate and frequency-cap violations" note="Target: zero">
          {k ? (
            <div className="grid" style={{ gap: 8 }}>
              {(
                [
                  ["Duplicate replies to one message", k.violations.duplicate_replies],
                  ["Same trigger sent twice in a journey", k.violations.duplicate_triggers_sent],
                  ["Rescue nudges over the cap of 2", k.violations.rescue_over_cap],
                ] as [string, number][]
              ).map(([l, v]) => (
                <div key={l} className="row">
                  <span className="small">{l}</span>
                  <span className="spacer" />
                  {v ? <Pill tone="crit">{v}</Pill> : <Pill tone="ok">0</Pill>}
                </div>
              ))}
              <div className="small muted">
                Blocked before sending (working as intended): {k.violations.duplicate_triggers_blocked} duplicates,{" "}
                {k.violations.frequency_cap_blocked} frequency caps.
              </div>
            </div>
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Where conversations are" note="Live from the database">
        <div className="grid" style={{ gap: 12 }}>
          {bars.map(([l, v]) => (
            <div key={l} className="grid" style={{ gridTemplateColumns: "200px 1fr 50px", gap: 10, alignItems: "center" }}>
              <span className="small">{l}</span>
              <div className="bar">
                <span style={{ width: `${((v / max) * 100).toFixed(1)}%` }} />
              </div>
              <span className="mono small" style={{ textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
