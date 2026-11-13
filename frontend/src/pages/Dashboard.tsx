import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getReports } from "../api/crm.api";
import { listConversations } from "../api/conversations.api";
import { getPendingBookings } from "../api/bookings.api";
import { useAuth } from "../hooks/useAuth";
import {
  Empty,
  ErrorNote,
  fmtDate,
  fmtTime,
  initials,
  Panel,
  Stat,
  StatePill,
  usePageTitle,
} from "../components/ui";

export default function Dashboard() {
  const { email } = useAuth();
  const h = new Date().getHours();
  const name = (email ?? "").split("@")[0].split(/[._]/)[0];
  usePageTitle(
    `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}${name ? ", " + name[0].toUpperCase() + name.slice(1) : ""}`,
    new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
  const reports = useQuery({ queryKey: ["reports"], queryFn: getReports, refetchInterval: 30_000 });
  const convs = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    refetchInterval: 15_000,
  });
  const pending = useQuery({
    queryKey: ["bookings", "pending"],
    queryFn: getPendingBookings,
    refetchInterval: 30_000,
  });
  const d = reports.data ?? {};
  const all = convs.data ?? [];
  const needPerson = all.filter((c) => c.state === "pause" || c.state === "escalated");
  const open = all.filter((c) => !["closed", "opted_out"].includes(c.state));

  return (
    <>
      <ErrorNote error={reports.error || convs.error} />
      {needPerson
        .filter((c) => c.state === "pause")
        .map((c) => (
          <div
            key={c.id}
            className="panel"
            style={{ borderColor: "var(--crit)", background: "var(--crit-soft)" }}
          >
            <div className="panel-b row">
              <span className="pill crit">Paused</span>
              <b>{c.customer?.first_name || c.customer?.wa_number}</b>
              <span className="muted small">
                Automation is paused for this chat (safety, privacy or a failed reply). A person
                must check it.
              </span>
              <span className="spacer" />
              <Link
                className="btn sm"
                to={`/live-chat?q=${encodeURIComponent(c.customer?.wa_number ?? "")}`}
              >
                Open chat
              </Link>
            </div>
          </div>
        ))}
      <div className="grid g4">
        <Stat
          label="Open conversations"
          value={open.length}
          detail={`${needPerson.length} need a person`}
          to="/live-chat"
        />
        <Stat
          label="Bookings to confirm"
          value={pending.data?.length ?? "…"}
          detail="Confirmed by the sales team in the CRM"
          to="/bookings"
        />
        <Stat label="Opted out" value={d.optedOut ?? "…"} detail="No automated messages" />
        <Stat
          label="CRM dead letters"
          value={d.deadOutbox ?? "…"}
          detail="Need a retry in CRM sync"
          to="/crm-sync"
        />
      </div>
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
          {!needPerson.length && <Empty>Nobody is waiting for a person.</Empty>}
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
                </tr>
              </thead>
              <tbody>
                {(pending.data ?? []).slice(0, 8).map((b) => (
                  <tr key={b.id}>
                    <td>{b.customer?.first_name || b.customer?.wa_number}</td>
                    <td>{b.centre?.name}</td>
                    <td className="mono">{fmtDate(b.preferred_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pending.isLoading && !(pending.data ?? []).length && <Empty>None pending.</Empty>}
          </div>
        </Panel>
      </div>
    </>
  );
}
