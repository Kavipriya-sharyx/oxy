// Small building blocks that follow the approved prototype design (styles/oxxy.css).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const PATHS: Record<string, string> = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  doc: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  log: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flow: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M6.5 8l4.3 7.8M17.5 8l-4.3 7.8"/>',
  sync: '<path d="M20 7h-9a5 5 0 0 0 0 10h1M4 17h9a5 5 0 0 0 0-10h-1"/><path d="M17 4l3 3-3 3M7 20l-3-3 3-3"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  task: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }}
    />
  );
}

// ---- page title shown in the shell's top bar ----
interface Title {
  title: string;
  sub?: string;
}
const TitleCtx = createContext<{ value: Title; set: (t: Title) => void }>({
  value: { title: "" },
  set: () => {},
});

export function TitleProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<Title>({ title: "" });
  return <TitleCtx.Provider value={{ value, set }}>{children}</TitleCtx.Provider>;
}
export const usePageTitleValue = () => useContext(TitleCtx).value;
export function usePageTitle(title: string, sub?: string) {
  const { set } = useContext(TitleCtx);
  useEffect(() => {
    set({ title, sub });
    document.title = `${title} · Oxxy`;
  }, [title, sub, set]);
}

// ---- pieces ----
export function Panel({
  title,
  note,
  actions,
  children,
  bodyless,
  style,
}: {
  title?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  bodyless?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className="panel" style={style}>
      {(title || actions) && (
        <div className="panel-h">
          {title && <h2>{title}</h2>}
          {note && <span className="muted small">{note}</span>}
          <span className="spacer" />
          {actions}
        </div>
      )}
      {bodyless ? children : <div className="panel-b">{children}</div>}
    </div>
  );
}

export type Tone = "ok" | "warn" | "crit" | "info" | "acc" | "plain";
export function Pill({
  tone = "plain",
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return <span className={`pill ${tone}${dot ? "" : " plain"}`}>{children}</span>;
}

export function Stat({
  label,
  value,
  detail,
  to,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      <span className="v">{value}</span>
      {detail && <span className="d">{detail}</span>}
    </>
  );
  return to ? (
    <a className="panel stat" href={to} style={{ color: "inherit", textDecoration: "none" }}>
      {body}
    </a>
  ) : (
    <div className="panel stat">{body}</div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l]) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          className={value === k ? "on" : ""}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="panel" style={{ borderColor: "var(--crit)", background: "var(--crit-soft)" }}>
      <div className="panel-b small" style={{ color: "var(--crit)" }}>
        {(error as Error).message || "Something went wrong"}
      </div>
    </div>
  );
}

// conversation states -> label + tone (same names as the prototype)
const STATES: Record<string, [string, Tone]> = {
  new: ["New", "plain"],
  intent_menu: ["Intent menu", "info"],
  need_discovery: ["Need discovery", "info"],
  oxxy_explain: ["Explaining Oxxy", "info"],
  service_or_escalation: ["Existing customer", "info"],
  follow_up_time: ["Asking follow-up time", "plain"],
  discovery: ["Discovery", "info"],
  routing: ["Routing", "info"],
  plan_fit: ["Plan fit", "acc"],
  cut_medi_bills_fit: ["Cut Medi Bills fit", "acc"],
  centre_search: ["Centre search", "info"],
  booking_capture: ["Booking capture", "info"],
  booking_recorded: ["Booking recorded", "acc"],
  activation: ["Activation", "acc"],
  awaiting_payment: ["Awaiting payment", "warn"],
  follow_up: ["Follow-up", "plain"],
  escalated: ["With a person", "warn"],
  pause: ["Paused", "crit"],
  closed: ["Closed", "plain"],
  opted_out: ["Opted out", "plain"],
};
export function StatePill({ state }: { state: string }) {
  const [l, t] = STATES[state] ?? [state.replace(/_/g, " "), "plain" as Tone];
  return <Pill tone={t}>{l}</Pill>;
}

export const BOOKING_TONE: Record<string, [string, Tone]> = {
  pending_confirmation: ["Pending confirmation", "warn"],
  confirmed: ["Confirmed", "ok"],
  changed: ["Changed", "info"],
  not_possible: ["Not possible", "crit"],
  cancelled: ["Cancelled", "plain"],
};

export const inr = (n: number | string | null | undefined) =>
  n == null ? "—" : "₹" + Math.round(Number(n)).toLocaleString("en-IN");

export const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso.length === 10 ? iso + "T00:00:00+05:30" : iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const fmtTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const initials = (n?: string | null) =>
  (n || "?")
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Right-hand drawer, same look as the prototype forms
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-label={title}>
        <div className="row">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="btn sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}
