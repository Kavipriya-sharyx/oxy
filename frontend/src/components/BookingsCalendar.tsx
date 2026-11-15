import { useMemo, useState } from "react";
import type { Booking } from "../types";
import { BOOKING_TONE, Drawer, Pill } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHIP: Record<string, { bg: string; fg: string }> = {
  pending_confirmation: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  confirmed: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  changed: { bg: "var(--info-soft)", fg: "var(--info)" },
  not_possible: { bg: "var(--crit-soft)", fg: "var(--crit)" },
  cancelled: { bg: "var(--sunk)", fg: "var(--muted)" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const dayKey = (iso: string) => iso.slice(0, 10);

interface Props {
  bookings: Booking[];
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: (id: string) => void;
  crmUrl?: string;
}

export default function BookingsCalendar({
  bookings,
  canConfirm,
  confirming,
  onConfirm,
  crmUrl,
}: Props) {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());
  // booking window: today + 3 days up to the same date 6 months on (India time)
  const minD = new Date(today);
  minD.setDate(minD.getDate() + 3);
  const maxD = new Date(today);
  maxD.setMonth(maxD.getMonth() + 6);
  const minKey = key(minD.getFullYear(), minD.getMonth(), minD.getDate());
  const maxKey = key(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());

  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [centre, setCentre] = useState("all");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const centres = useMemo(() => {
    const map = new Map<string, string>();
    bookings.forEach(
      (b) =>
        b.centre &&
        map.set(b.centre_id, `${b.centre.name}${b.centre.branch ? ` · ${b.centre.branch}` : ""}`),
    );
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [bookings]);

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings
      .filter((b) => centre === "all" || b.centre_id === centre)
      .forEach((b) => {
        const k = dayKey(b.preferred_date);
        map.set(k, [...(map.get(k) ?? []), b]);
      });
    map.forEach((list) =>
      list.sort((a, b) => (a.preferred_time ?? "").localeCompare(b.preferred_time ?? "")),
    );
    return map;
  }, [bookings, centre]);

  // month grid, weeks start on Monday
  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const move = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const dayList = openDay ? (byDay.get(openDay) ?? []) : [];

  return (
    <div className="panel">
      <div className="panel-b">
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn sm" onClick={() => move(-1)} aria-label="Previous month">
            ‹
          </button>
          <b style={{ minWidth: 150, textAlign: "center" }}>{monthLabel}</b>
          <button className="btn sm" onClick={() => move(1)} aria-label="Next month">
            ›
          </button>
          <button
            className="btn sm"
            onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
          >
            Today
          </button>
          <span className="spacer" />
          <select
            className="input"
            style={{ width: "auto" }}
            value={centre}
            onChange={(e) => setCentre(e.target.value)}
          >
            <option value="all">All centres</option>
            {centres.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
                marginBottom: 4,
              }}
            >
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="small muted"
                  style={{ textAlign: "center", fontWeight: 600 }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const k = key(cursor.y, cursor.m, d);
                const list = byDay.get(k) ?? [];
                const pending = list.filter(
                  (b) => b.booking_status === "pending_confirmation",
                ).length;
                const inWindow = k >= minKey && k <= maxKey;
                const isToday = k === todayKey;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => list.length && setOpenDay(k)}
                    style={{
                      minHeight: 92,
                      textAlign: "left",
                      padding: 6,
                      borderRadius: 8,
                      cursor: list.length ? "pointer" : "default",
                      background: inWindow ? "var(--surface)" : "var(--sunk)",
                      border: isToday ? "2px solid var(--accent)" : "1px solid var(--line)",
                      color: "var(--fg)",
                      opacity: inWindow || list.length ? 1 : 0.6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      font: "inherit",
                    }}
                  >
                    <span
                      className="row"
                      style={{ justifyContent: "space-between", flexWrap: "nowrap", gap: 4 }}
                    >
                      <span className="small" style={{ fontWeight: isToday ? 700 : 500 }}>
                        {d}
                      </span>
                      {pending > 0 && (
                        <span
                          title={`${pending} pending`}
                          style={{
                            background: "var(--crit)",
                            color: "#fff",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "0 6px",
                          }}
                        >
                          {pending}
                        </span>
                      )}
                    </span>
                    {list.slice(0, 2).map((b) => {
                      const c = CHIP[b.booking_status] ?? CHIP.cancelled;
                      return (
                        <span
                          key={b.id}
                          style={{
                            background: c.bg,
                            color: c.fg,
                            borderRadius: 4,
                            fontSize: 11,
                            padding: "1px 4px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {b.preferred_time ? `${b.preferred_time} ` : ""}
                          {b.customer?.first_name ?? "—"}
                        </span>
                      );
                    })}
                    {list.length > 2 && (
                      <span className="small muted">+{list.length - 2} more</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="small muted"
          style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}
        >
          <span>🟨 Pending</span>
          <span>🟩 Confirmed</span>
          <span>⬜ Cancelled</span>
          <span>Shaded days are outside the booking window.</span>
        </div>
      </div>

      {openDay && (
        <Drawer
          title={new Date(openDay + "T00:00:00+05:30").toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          onClose={() => setOpenDay(null)}
        >
          {dayList.map((b) => {
            const [label, tone] = BOOKING_TONE[b.booking_status] ?? [b.booking_status, "plain"];
            return (
              <div key={b.id} className="panel" style={{ marginBottom: 10 }}>
                <div className="panel-b">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>{b.customer?.first_name ?? "—"}</b>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                  <div className="small mono">{b.customer?.wa_number ?? "—"}</div>
                  <div className="small" style={{ marginTop: 6 }}>
                    {b.centre?.name ?? "—"}
                    {b.centre?.branch ? ` · ${b.centre.branch}` : ""}
                  </div>
                  <div className="small muted">
                    {b.specialisation ?? "—"} · {b.preferred_time ?? "time not set"}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    {crmUrl && b.crm_booking_id && (
                      <a
                        className="btn sm"
                        href={`${crmUrl.replace(/\/$/, "")}/bookings/${b.crm_booking_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in CRM
                      </a>
                    )}
                    {canConfirm && b.booking_status === "pending_confirmation" && (
                      <button
                        className="btn sm pri"
                        disabled={confirming}
                        onClick={() => onConfirm(b.id)}
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Drawer>
      )}
    </div>
  );
}
