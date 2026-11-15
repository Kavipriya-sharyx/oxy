import { Link } from "react-router-dom";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getReports, getTrend } from "../api/crm.api";
import { listConversations } from "../api/conversations.api";
import { confirmBooking, getPendingBookings } from "../api/bookings.api";
import { getKpis } from "../api/insights.api";
import { getUrgentAlerts, listTasks } from "../api/work.api";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { ROLE } from "../auth/roles";
import TrendChart from "../components/TrendChart";
import {
  Empty,
  ErrorNote,
  fmtDate,
  fmtTime,
  initials,
  Panel,
  Pill,
  Stat,
  StatePill,
  usePageTitle,
} from "../components/ui";

const CRM_URL = import.meta.env.VITE_CRM_BASE_URL as string | undefined;
const IST = "Asia/Kolkata";
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

/** Whole days from today (India time) to a YYYY-MM-DD date: 0 = today, negative = overdue */
function daysUntil(iso: string): number {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: IST });
  const a = Date.parse(today + "T00:00:00Z");
  const b = Date.parse(iso.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}
function dueText(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 0) return `${-n} day${n === -1 ? "" : "s"} overdue`;
  return `In ${n} days`;
}

export default function Dashboard() {
  const { email } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { can, role } = usePermissions();
  const isAdmin = role === ROLE.Admin || role === ROLE.SuperAdmin;
  // greeting and date follow India time, not the browser's zone
  const h = Number(
    new Date().toLocaleString("en-GB", { timeZone: IST, hour: "numeric", hour12: false }),
  );
  const name = (email ?? "").split("@")[0].split(/[._]/)[0];
  usePageTitle(
    `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}${name ? ", " + name[0].toUpperCase() + name.slice(1) : ""}`,
    new Date().toLocaleDateString("en-IN", {
      timeZone: IST,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );

  const reports = useQuery({ queryKey: ["reports"], queryFn: getReports, refetchInterval: 30_000 });
  const convs = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listConversations(),
    refetchInterval: 15_000,
  });
  const pending = useQuery({
    queryKey: ["bookings", "pending"],
    queryFn: getPendingBookings,
    refetchInterval: 30_000,
  });
  // optional panels: a user without the permission simply doesn't see them
  const trend = useQuery({
    queryKey: ["trend"],
    queryFn: getTrend,
    refetchInterval: 60_000,
    retry: false,
  });
  const kpis = useQuery({
    queryKey: ["kpis", "dashboard"],
    queryFn: () => getKpis(),
    retry: false,
  });
  const urgent = useQuery({
    queryKey: ["urgent-alerts"],
    queryFn: getUrgentAlerts,
    refetchInterval: 30_000,
    retry: false,
  });
  const tasks = useQuery({
    queryKey: ["tasks", "open"],
    queryFn: () => listTasks("open"),
    refetchInterval: 30_000,
    retry: false,
  });

  const confirm = useMutation({
    mutationFn: confirmBooking,
    onSuccess: async () => {
      message.success("Booking confirmed. The customer is told on WhatsApp.");
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const consoleConfirm = !CRM_URL && can("bookings.confirm");

  const d = reports.data ?? {};
  const all = convs.data ?? [];
  const paused = all.filter((c) => c.state === "pause");
  const needPerson = all.filter((c) => c.state === "pause" || c.state === "escalated");
  const open = all.filter((c) => !["closed", "opted_out"].includes(c.state));
  const pendingSorted = [...(pending.data ?? [])].sort((a, b) =>
    a.preferred_date.localeCompare(b.preferred_date),
  );
  const openTasks = tasks.data?.rows ?? [];
  const urgentTasks = openTasks.filter((t) => t.priority === "urgent").length;
  const k = kpis.data;
  const loading = reports.isLoading || convs.isLoading;
  const dash = (v: number | undefined) => (reports.isLoading ? "…" : (v ?? 0));
  const updated = Math.max(reports.dataUpdatedAt, convs.dataUpdatedAt, pending.dataUpdatedAt);

  const conversion = (
    <>
      {k && (
        <Panel
          title="Conversion, last 30 days"
          actions={
            <Link to="/reports" className="small">
              Full report
            </Link>
          }
        >
          <div className="grid g4">
            <Stat
              label="Centre list → booking"
              value={pct(k.centre_list_to_booking.rate)}
              detail={`${k.centre_list_to_booking.booked} of ${k.centre_list_to_booking.lists}`}
            />
            <Stat
              label="Plan → accepted"
              value={pct(k.plan_to_acceptance.rate)}
              detail={`${k.plan_to_acceptance.accepted} of ${k.plan_to_acceptance.recommended}`}
            />
            <Stat
              label="Link → payment"
              value={pct(k.link_to_payment.rate)}
              detail={`${k.link_to_payment.paid} of ${k.link_to_payment.links}`}
            />
            <Stat
              label="Callback → resolved"
              value={pct(k.callback_resolution.resolution_rate)}
              detail={`${k.callback_resolution.resolved} of ${k.callback_resolution.callbacks}`}
            />
          </div>
        </Panel>
      )}
    </>
  );
  const health = (
    <>
      <Panel title="System health">
        <div className="row small" style={{ gap: 18 }}>
          <span>
            Opted out: <b>{dash(d.optedOut)}</b>
          </span>
          <span>
            Triggers fired: <b>{dash(d.triggersFired)}</b>
          </span>
          <span>
            CRM push errors:{" "}
            <b style={{ color: (d.deadOutbox ?? 0) > 0 ? "var(--crit)" : undefined }}>
              {dash(d.deadOutbox)}
            </b>{" "}
            <Link to="/crm-sync">(details)</Link>
          </span>
        </div>
      </Panel>
      {trend.data && (
        <Panel title="Last 7 days">
          <TrendChart data={trend.data} />
        </Panel>
      )}
    </>
  );

  return (
    <>
      <div className="row">
        <span className="small muted">
          {updated
            ? `Updated ${new Date(updated).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit" })}`
            : "Loading…"}
        </span>
        <span className="spacer" />
        <button
          className="btn sm"
          disabled={reports.isFetching || convs.isFetching || pending.isFetching}
          onClick={() => {
            void reports.refetch();
            void convs.refetch();
            void pending.refetch();
            void urgent.refetch();
            void tasks.refetch();
          }}
        >
          {reports.isFetching || convs.isFetching || pending.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <ErrorNote error={reports.error || convs.error || pending.error} />

      {(urgent.data ?? []).length > 0 && (
        <div
          className="panel"
          style={{ borderColor: "var(--crit)", background: "var(--crit-soft)" }}
        >
          <div className="panel-b">
            <b style={{ color: "var(--crit)" }}>
              {(urgent.data ?? []).length} urgent case{(urgent.data ?? []).length === 1 ? "" : "s"}{" "}
              open
            </b>
            {(urgent.data ?? []).slice(0, 4).map((u) => (
              <div key={u.task_id} className="row small" style={{ marginTop: 6 }}>
                <Pill tone="crit">{u.label}</Pill>
                <span>{u.customer?.first_name || u.customer?.wa_number || "Unknown"}</span>
                <span className="muted">{fmtTime(u.created_at)}</span>
                <span className="spacer" />
                {u.customer?.wa_number && (
                  <Link
                    className="btn sm"
                    to={`/live-chat?q=${encodeURIComponent(u.customer.wa_number)}`}
                  >
                    Open chat
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {paused.length > 0 && (
        <div
          className="panel"
          style={{ borderColor: "var(--crit)", background: "var(--crit-soft)" }}
        >
          <div className="panel-b row">
            <span className="pill crit">Paused</span>
            <b>
              {paused.length} chat{paused.length === 1 ? "" : "s"} paused
            </b>
            <span className="muted small">
              Automation stopped (safety, privacy or a failed reply). A person must check{" "}
              {paused.length === 1 ? "it" : "them"}.
              {paused.length <= 3 &&
                ` ${paused.map((c) => c.customer?.first_name || c.customer?.wa_number).join(", ")}`}
            </span>
            <span className="spacer" />
            <Link
              className="btn sm"
              to={`/live-chat?q=${encodeURIComponent(paused[0].customer?.wa_number ?? "")}`}
            >
              {paused.length === 1 ? "Open chat" : "Open first"}
            </Link>
          </div>
        </div>
      )}

      <div className="grid g4">
        <Stat
          label="Needs a person"
          value={loading ? "…" : needPerson.length}
          detail={`${paused.length} paused · ${needPerson.length - paused.length} escalated`}
          to="/live-chat"
        />
        <Stat
          label="Bookings to confirm"
          value={pending.isLoading ? "…" : (pending.data?.length ?? 0)}
          detail="Confirmed by a sales person (here or via the API)"
          to="/bookings"
        />
        <Stat
          label="Confirmed bookings"
          value={dash(d.confirmedBookings)}
          detail="All time"
          to="/bookings"
        />
        <Stat
          label="Open conversations"
          value={loading ? "…" : open.length}
          detail={`${d.totalConversations ?? 0} in total`}
          to="/live-chat"
        />
      </div>

      <div className="grid g4">
        <Stat label="New chats today" value={dash(d.conversationsToday)} detail="India time" />
        <Stat label="Booking requests today" value={dash(d.bookingsToday)} detail="India time" />
        <Stat
          label="Activations today"
          value={dash(d.activationsToday)}
          detail="Links and plans started"
          to="/activations"
        />
        {tasks.data && (
          <Stat
            label="Open tasks"
            value={openTasks.length}
            detail={`${urgentTasks} urgent`}
            to="/escalations"
          />
        )}
      </div>

      {isAdmin && health}
      {isAdmin && conversion}

      <div className="grid g2">
        <Panel
          title="Needs a person"
          actions={
            <Link to="/live-chat" className="small">
              Inbox
            </Link>
          }
          bodyless
        >
          {needPerson.slice(0, 6).map((c) => (
            <Link
              key={c.id}
              className="panel-b row"
              to={`/live-chat?q=${encodeURIComponent(c.customer?.wa_number ?? "")}`}
              style={{
                borderBottom: "1px solid var(--line)",
                gap: 8,
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <div className="avatar">
                {initials(c.customer?.first_name || c.customer?.wa_number)}
              </div>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.customer?.first_name || c.customer?.wa_number}</b>
                <div className="small muted">
                  Last message {fmtTime(c.last_customer_message_at)}
                </div>
              </span>
              <StatePill state={c.state} />
            </Link>
          ))}
          {convs.isLoading && <Empty>Loading…</Empty>}
          {!convs.isLoading && !needPerson.length && <Empty>Nobody is waiting for a person.</Empty>}
        </Panel>

        <Panel
          title="Bookings pending confirmation"
          actions={
            <Link to="/bookings" className="small">
              Open list
            </Link>
          }
          bodyless
        >
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Centre</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingSorted.slice(0, 8).map((b) => (
                  <tr key={b.id}>
                    <td>{b.customer?.first_name || b.customer?.wa_number}</td>
                    <td>{b.centre?.name}</td>
                    <td>
                      <span className="mono">{fmtDate(b.preferred_date)}</span>
                      <div className="small muted">
                        {b.preferred_time ? `${b.preferred_time} · ` : ""}
                        {dueText(b.preferred_date)}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {consoleConfirm && (
                        <button
                          className="btn sm pri"
                          disabled={confirm.isPending}
                          onClick={() => confirm.mutate(b.id)}
                        >
                          Confirm
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pending.isLoading && <Empty>Loading…</Empty>}
            {!pending.isLoading && !pendingSorted.length && <Empty>None pending.</Empty>}
          </div>
        </Panel>
      </div>

      {!isAdmin && conversion}
      {!isAdmin && health}
    </>
  );
}
