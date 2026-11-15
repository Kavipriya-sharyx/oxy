import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReportDetail, getReports } from "../api/crm.api";
import { getKpis, type Kpis, type TriggerKpi } from "../api/insights.api";
import TrendChart from "../components/TrendChart";
import { Empty, ErrorNote, Panel, Pill, Stat, usePageTitle } from "../components/ui";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
const IST = "Asia/Kolkata";
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));
const addDays = (iso: string, n: number) =>
  ymd(new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000));

/** Higher is better: green at 50% and above, amber from 20%, red below */
const rateColor = (r: number | null) =>
  r == null ? undefined : r >= 50 ? "var(--ok)" : r >= 20 ? "var(--warn)" : "var(--crit)";
const SMALL = 10; // fewer than this many and a rate is only a hint

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

type FunnelRow = [
  label: string,
  note: string,
  num: number,
  den: number,
  rate: number | null,
  prev: number | null,
];

function funnelRows(k: Kpis, p?: Kpis): FunnelRow[] {
  return [
    [
      "Trust pack → kept talking",
      "A sent, then a customer reply",
      k.trust_pack_to_continued.continued,
      k.trust_pack_to_continued.sent,
      k.trust_pack_to_continued.rate,
      p?.trust_pack_to_continued.rate ?? null,
    ],
    [
      "Centre list → booking request",
      "D shown, then a booking",
      k.centre_list_to_booking.booked,
      k.centre_list_to_booking.lists,
      k.centre_list_to_booking.rate,
      p?.centre_list_to_booking.rate ?? null,
    ],
    [
      "Plan recommended → link asked",
      "E, then the customer said YES to the link",
      k.plan_to_acceptance.accepted,
      k.plan_to_acceptance.recommended,
      k.plan_to_acceptance.rate,
      p?.plan_to_acceptance.rate ?? null,
    ],
    [
      "Activation link → payment",
      "Links sent that were paid",
      k.link_to_payment.paid,
      k.link_to_payment.links,
      k.link_to_payment.rate,
      p?.link_to_payment.rate ?? null,
    ],
    [
      "Booking only → activated later",
      "Bookings made with no activation, paid later",
      k.booking_to_later_activation.later_activated,
      k.booking_to_later_activation.bookings_without_activation,
      k.booking_to_later_activation.rate,
      p?.booking_to_later_activation.rate ?? null,
    ],
    [
      "Callback → resolved",
      "Escalations and callbacks closed",
      k.callback_resolution.resolved,
      k.callback_resolution.callbacks,
      k.callback_resolution.resolution_rate,
      p?.callback_resolution.resolution_rate ?? null,
    ],
    [
      "Callback → activated",
      "Customers who paid after a callback",
      k.callback_resolution.activated,
      k.callback_resolution.callbacks,
      k.callback_resolution.activation_rate,
      p?.callback_resolution.activation_rate ?? null,
    ],
  ];
}

function Delta({ now, prev }: { now: number | null; prev: number | null }) {
  if (now == null || prev == null) return null;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return <span className="small muted">no change vs previous period</span>;
  return (
    <span className="small" style={{ color: d > 0 ? "var(--ok)" : "var(--crit)", fontWeight: 600 }}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)} pts{" "}
      <span className="muted" style={{ fontWeight: 400 }}>
        vs previous period
      </span>
    </span>
  );
}

function Funnel({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Measure</th>
            <th style={{ textAlign: "right" }}>Converted</th>
            <th style={{ textAlign: "right" }}>Out of</th>
            <th style={{ width: "34%" }}>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, note, num, den, rate, prev]) => (
            <tr key={label}>
              <td>
                <b>{label}</b>
                <div className="small muted">{note}</div>
              </td>
              <td className="mono" style={{ textAlign: "right" }}>
                {num}
              </td>
              <td className="mono" style={{ textAlign: "right" }}>
                {den}
              </td>
              <td>
                {den === 0 ? (
                  <span className="small muted">Nothing to measure in this period</span>
                ) : (
                  <>
                    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <div className="bar" style={{ flex: 1 }}>
                        <span
                          style={{
                            width: `${Math.min(100, rate ?? 0)}%`,
                            background: rateColor(rate),
                          }}
                        />
                      </div>
                      <span
                        className="mono small"
                        style={{ minWidth: 48, textAlign: "right", color: rateColor(rate) }}
                      >
                        {pct(rate)}
                      </span>
                    </div>
                    <div>
                      {den < SMALL && (
                        <span className="small muted">
                          Only {den} in this period: treat as a hint.{" "}
                        </span>
                      )}
                      <Delta now={rate} prev={prev} />
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortKey =
  | "trigger_id"
  | "fired"
  | "response_rate"
  | "clicked"
  | "declined"
  | "ignored"
  | "opt_out_rate"
  | "complaint_rate"
  | "suppressed";
const COLS: [SortKey, string][] = [
  ["fired", "Fired"],
  ["response_rate", "Response"],
  ["clicked", "Clicked"],
  ["declined", "Declined"],
  ["ignored", "Ignored"],
  ["opt_out_rate", "Opt-out"],
  ["complaint_rate", "Complaint"],
  ["suppressed", "Suppressed"],
];

function csvDownload(name: string, lines: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const text = "﻿" + lines.map((l) => l.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  usePageTitle("Reports", "Control");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "fired", dir: -1 });
  const q = useQuery({ queryKey: ["reports"], queryFn: getReports, refetchInterval: 30_000 });
  const kq = useQuery({
    queryKey: ["kpis", from, to],
    queryFn: () => getKpis(from || undefined, to || undefined),
    refetchInterval: 120_000,
  });
  const k = kq.data;
  // the period just before the chosen one, same length, for "vs previous period"
  const prevRange = k
    ? (() => {
        const len =
          Math.round((Date.parse(k.range.to) - Date.parse(k.range.from)) / 86_400_000) + 1;
        const pTo = addDays(k.range.from, -1);
        return { from: addDays(pTo, -(len - 1)), to: pTo };
      })()
    : null;
  const pq = useQuery({
    queryKey: ["kpis", "prev", prevRange?.from, prevRange?.to],
    queryFn: () => getKpis(prevRange!.from, prevRange!.to),
    enabled: !!prevRange,
    retry: false,
  });
  const dq = useQuery({
    queryKey: ["reportDetail", from, to],
    queryFn: () => getReportDetail(from || undefined, to || undefined),
    refetchInterval: 120_000,
    retry: false,
  });
  const d = q.data ?? {};
  const detail = dq.data;
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
  const fired = [...(k?.trigger_to_response ?? []).filter((t) => t.fired || t.suppressed)].sort(
    (a, b) => {
      const av =
        sort.key === "trigger_id"
          ? a.trigger_id
          : ((a[sort.key as keyof TriggerKpi] as number | null) ?? -1);
      const bv =
        sort.key === "trigger_id"
          ? b.trigger_id
          : ((b[sort.key as keyof TriggerKpi] as number | null) ?? -1);
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    },
  );
  const rows = k ? funnelRows(k, pq.data) : [];
  const sortBy = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? " ▼" : " ▲") : "");
  const daily = detail?.daily ?? [];
  const sumDaily = (f: "conversations" | "bookings" | "activations") =>
    daily.reduce((s, x) => s + x[f], 0);

  const exportCsv = () => {
    if (!k) return;
    csvDownload(`report-${k.range.from}-to-${k.range.to}.csv`, [
      ["Conversion measures", `${k.range.from} to ${k.range.to}`],
      ["Measure", "Converted", "Out of", "Rate %", "Previous period rate %"],
      ...rows.map(([l, , num, den, rate, prev]) => [l, num, den, rate, prev]),
      [],
      ["Trigger-to-response"],
      [
        "Trigger",
        "Name",
        "Fired",
        "Response %",
        "Clicked",
        "Declined",
        "Ignored",
        "Opt-out %",
        "Complaint %",
        "Suppressed",
      ],
      ...fired.map((t) => [
        t.trigger_id,
        TRIGGER_NAMES[t.trigger_id],
        t.fired,
        t.response_rate,
        t.clicked,
        t.declined,
        t.ignored,
        t.opt_out_rate,
        t.complaint_rate,
        t.suppressed,
      ]),
      [],
      ["Activity per day"],
      ["Date", "New chats", "Booking requests", "Activations"],
      ...daily.map((x) => [x.date, x.conversations, x.bookings, x.activations]),
    ]);
  };
  const quick = (a: string, b: string) => {
    setFrom(a);
    setTo(b);
  };
  const monthStart = ymd(new Date()).slice(0, 8) + "01";

  return (
    <>
      <div className="row">
        <span className="small muted">
          Tiles with “All time” show totals since the start. Everything with a date range follows
          the period you pick below.
        </span>
        <span className="spacer" />
        <button className="btn sm" disabled={!k} onClick={exportCsv}>
          Export CSV
        </button>
        <button className="btn sm" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <ErrorNote error={q.error || kq.error} />
      <div className="grid g4">
        <Stat
          label="Conversations"
          value={n("totalConversations")}
          detail="All time"
          to="/live-chat"
        />
        <Stat
          label="Pending bookings"
          value={n("pendingBookings")}
          detail="Right now · waiting for the sales team"
          to="/bookings"
        />
        <Stat
          label="Link to payment"
          value={k ? pct(k.link_to_payment.rate) : "…"}
          detail={
            k
              ? `Selected period · ${k.link_to_payment.paid} of ${k.link_to_payment.links} links paid`
              : undefined
          }
          to="/activations"
        />
        <Stat
          label="Rule violations"
          value={k ? k.violations.total : "…"}
          detail="Selected period · duplicates and caps. Target 0"
          to="#violations"
        />
      </div>

      <Panel
        title="Conversion measures"
        note={
          k
            ? `${k.range.from} to ${k.range.to} (IST) · colour: green 50%+, amber 20%+, red below`
            : "Trigger & Conversion Layer 13.1"
        }
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => quick(daysAgo(6), daysAgo(0))}>
              7 days
            </button>
            <button className="btn sm" onClick={() => quick(daysAgo(29), daysAgo(0))}>
              30 days
            </button>
            <button className="btn sm" onClick={() => quick(monthStart, daysAgo(0))}>
              This month
            </button>
            <input
              className="input"
              type="date"
              aria-label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ width: 150 }}
            />
            <input
              className="input"
              type="date"
              aria-label="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ width: 150 }}
            />
            {(from || to) && (
              <button className="btn sm" onClick={() => quick("", "")}>
                Reset
              </button>
            )}
          </div>
        }
        bodyless
      >
        {k ? <Funnel rows={rows} /> : <Empty>{kq.isLoading ? "Loading…" : "No data"}</Empty>}
      </Panel>

      <Panel
        title="Activity per day"
        note={
          detail
            ? `${detail.range.from} to ${detail.range.to} · ${sumDaily("conversations")} chats, ${sumDaily("bookings")} bookings, ${sumDaily("activations")} activations`
            : undefined
        }
      >
        {detail ? (
          <TrendChart data={daily} />
        ) : (
          <Empty>{dq.isLoading ? "Loading…" : "Not available"}</Empty>
        )}
      </Panel>

      <div className="grid g2">
        <Panel title="Bookings per centre" note="Selected period · top 15" bodyless>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Centre</th>
                  <th style={{ textAlign: "right" }}>Requests</th>
                  <th style={{ textAlign: "right" }}>Confirmed</th>
                  <th style={{ textAlign: "right" }}>Avg. to confirm</th>
                </tr>
              </thead>
              <tbody>
                {(detail?.centres ?? []).map((c) => (
                  <tr key={c.name + c.branch + c.city}>
                    <td>
                      <b>{c.name}</b>
                      <div className="small muted">
                        {[c.branch, c.city].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {c.bookings}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {c.confirmed}
                    </td>
                    <td className="mono small" style={{ textAlign: "right" }}>
                      {c.avg_confirm_hours == null
                        ? "—"
                        : c.avg_confirm_hours < 48
                          ? `${c.avg_confirm_hours} h`
                          : `${Math.round(c.avg_confirm_hours / 24)} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail && !detail.centres.length && <Empty>No booking requests in this period.</Empty>}
            {dq.isLoading && <Empty>Loading…</Empty>}
          </div>
        </Panel>

        {detail?.people ? (
          <Panel title="Team: tasks taken" note="Selected period · Admin only" bodyless>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th style={{ textAlign: "right" }}>Claimed</th>
                    <th style={{ textAlign: "right" }}>Closed</th>
                    <th style={{ textAlign: "right" }}>Avg. to close</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.people.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {p.claimed}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {p.closed}
                      </td>
                      <td className="mono small" style={{ textAlign: "right" }}>
                        {p.avg_hours == null
                          ? "—"
                          : p.avg_hours < 48
                            ? `${p.avg_hours} h`
                            : `${Math.round(p.avg_hours / 24)} days`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.people.length && <Empty>No tasks were claimed in this period.</Empty>}
            </div>
          </Panel>
        ) : (
          <Panel title="Where conversations are" note="All time · live from the database">
            <div className="grid" style={{ gap: 12 }}>
              {bars.map(([l, v]) => (
                <div
                  key={l}
                  className="grid"
                  style={{ gridTemplateColumns: "160px 1fr 50px", gap: 10, alignItems: "center" }}
                >
                  <span className="small">{l}</span>
                  <div className="bar">
                    <span style={{ width: `${((v / max) * 100).toFixed(1)}%` }} />
                  </div>
                  <span className="mono small" style={{ textAlign: "right" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      <Panel
        title="Trigger-to-response rate by trigger"
        note="Ignored = no reply within 24 hours. Suppressed sends are not counted. Click a heading to sort."
        bodyless
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: "pointer" }} onClick={() => sortBy("trigger_id")}>
                  Trigger{arrow("trigger_id")}
                </th>
                {COLS.map(([key, label]) => (
                  <th
                    key={key}
                    style={{ textAlign: "right", cursor: "pointer" }}
                    onClick={() => sortBy(key)}
                  >
                    {label}
                    {arrow(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fired.map((t) => (
                <tr key={t.trigger_id}>
                  <td>
                    <b className="mono">{t.trigger_id}</b> {TRIGGER_NAMES[t.trigger_id]}
                    {t.fired > 0 && t.fired < SMALL && (
                      <div className="small muted">Only {t.fired} sent</div>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {t.fired}
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", color: rateColor(t.response_rate) }}
                  >
                    {pct(t.response_rate)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {t.clicked}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {t.declined}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {t.ignored}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {pct(t.opt_out_rate)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {pct(t.complaint_rate)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {t.suppressed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {k && !fired.length && <Empty>No triggers in this period.</Empty>}
        </div>
      </Panel>

      <div className="grid g2">
        <Panel
          title="Opt-outs and complaints by trigger sequence"
          note={k ? `${k.opt_out_and_complaint_by_sequence.journeys} journeys` : undefined}
          bodyless
        >
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
                    <td>
                      {s.outcome === "opted_out" ? (
                        <Pill tone="warn">Opt-out</Pill>
                      ) : (
                        <Pill tone="crit">Complaint</Pill>
                      )}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {s.n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {k && !k.opt_out_and_complaint_by_sequence.sequences.length && (
              <Empty>None in this period.</Empty>
            )}
          </div>
        </Panel>
        <div id="violations">
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
                  Blocked before sending (working as intended):{" "}
                  {k.violations.duplicate_triggers_blocked} duplicates,{" "}
                  {k.violations.frequency_cap_blocked} frequency caps.
                </div>
              </div>
            ) : (
              <Empty>Loading…</Empty>
            )}
          </Panel>
        </div>
      </div>

      {detail?.people && (
        <Panel title="Where conversations are" note="All time · live from the database">
          <div className="grid" style={{ gap: 12 }}>
            {bars.map(([l, v]) => (
              <div
                key={l}
                className="grid"
                style={{ gridTemplateColumns: "200px 1fr 50px", gap: 10, alignItems: "center" }}
              >
                <span className="small">{l}</span>
                <div className="bar">
                  <span style={{ width: `${((v / max) * 100).toFixed(1)}%` }} />
                </div>
                <span className="mono small" style={{ textAlign: "right" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
