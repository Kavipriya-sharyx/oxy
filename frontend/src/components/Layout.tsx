import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { Icon, initials, Pill, TitleProvider, usePageTitleValue } from "./ui";
import { useLiveUpdates } from "../hooks/useLiveUpdates";
import { getPendingBookings } from "../api/bookings.api";

// Same groups and order as the approved prototype
const NAV: [string, [string, string, string][]][] = [
  [
    "Work",
    [
      ["/dashboard", "Dashboard", "dash"],
      ["/live-chat", "Conversations", "chat"],
      ["/bookings", "Booking requests", "cal"],
      ["/activations", "Activations", "card"],
      ["/escalations", "Escalations", "task"],
      ["/follow-ups", "Follow-ups", "cal"],
    ],
  ],
  ["Directory", [["/centres", "Centres", "pin"]]],
  ["Flows", [["/flows", "All flows", "flow"]]],
  [
    "Control",
    [
      ["/plan-catalog", "Plans and prices", "tag"],
      ["/triggers", "Triggers A–R", "zap"],
      ["/templates", "WhatsApp templates", "doc"],
      ["/reports", "Reports", "chart"],
    ],
  ],
  [
    "Admin",
    [
      ["/users", "Users", "users"],
      ["/roles", "Roles and permissions", "key"],
      ["/crm-sync", "CRM sync", "sync"],
      ["/content", "Approved content", "doc"],
      ["/privacy", "Data requests", "lock"],
      ["/audit-log", "Audit log", "log"],
      ["/settings", "Configuration", "gear"],
    ],
  ],
];

function readMini(): boolean {
  try {
    return localStorage.getItem("oxxy-mini") === "1";
  } catch {
    return false;
  }
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, role, logout } = useAuth();
  const { title, sub } = usePageTitleValue();
  const [mini, setMini] = useState(readMini);
  const [open, setOpen] = useState(false);
  const { canOpen } = usePermissions();
  const allowed = (path: string) => !!role && canOpen(path);
  const pending = useQuery({
    queryKey: ["bookings", "pending"],
    queryFn: getPendingBookings,
    enabled: allowed("/bookings"),
    refetchInterval: 60_000,
  });
  const counts: Record<string, number> = { "/bookings": pending.data?.length ?? 0 };
  const live = useLiveUpdates(!!role);

  const toggle = () => {
    if (window.innerWidth <= 860) return setOpen((o) => !o);
    setMini((m) => {
      try {
        localStorage.setItem("oxxy-mini", m ? "0" : "1");
      } catch {
        /* private window */
      }
      return !m;
    });
  };
  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };
  const search = (q: string) => {
    if (q.trim()) navigate(`/live-chat?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className={`app ${mini ? "mini" : ""} ${open ? "navopen" : ""}`}>
      <div className="navscrim" onClick={() => setOpen(false)} />
      <aside className="rail" aria-label="Main navigation">
        <div className="brand">
          <div className="mark">O</div>
          <div>
            <b>Oxxy</b>
            <span>Sales and bot console</span>
          </div>
        </div>
        {NAV.map(([group, items]) => {
          const visible = items.filter(([p]) => allowed(p));
          if (!visible.length) return null;
          return (
            <div key={group}>
              <div className="navgroup eyebrow">{group}</div>
              <nav className="nav">
                {visible.map(([path, label, icon]) => (
                  <NavLink
                    key={path}
                    to={path}
                    title={label}
                    className={({ isActive }) => (isActive ? "on" : "")}
                    onClick={() => setOpen(false)}
                  >
                    <Icon name={icon} />
                    <span>{label}</span>
                    {counts[path] ? <span className="count">{counts[path]}</span> : null}
                  </NavLink>
                ))}
              </nav>
            </div>
          );
        })}
        <div className="me">
          <div className="avatar">{initials(email?.split("@")[0]?.replace(/[._]/g, " "))}</div>
          <div style={{ minWidth: 0 }}>
            <b
              style={{
                fontSize: 13,
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {email}
            </b>
            <div className="small muted">{role}</div>
          </div>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <button className="menubtn" onClick={toggle} aria-label="Show or hide the sidebar">
            <Icon name="menu" />
          </button>
          <div style={{ minWidth: 0 }}>
            {sub && <div className="eyebrow">{sub}</div>}
            <h1>{title}</h1>
          </div>
          <span title={live === "live" ? "Screens update as soon as something changes" : "Live updates are reconnecting; screens still refresh every few seconds"}>
            <Pill tone={live === "live" ? "ok" : undefined}>{live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Offline"}</Pill>
          </span>
          <label className="search">
            <span className="muted small">Search</span>
            <input
              key={location.pathname}
              placeholder="Name or WhatsApp number"
              onKeyDown={(e) => e.key === "Enter" && search((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function Layout() {
  return (
    <TitleProvider>
      <Shell />
    </TitleProvider>
  );
}
