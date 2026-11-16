// Full Plan 12.7: urgent cases (medical emergency, self-harm, urgent complaint / payment) must reach the sales team
// at once. Shown on every console page while the task is open: a red banner, a short sound and a desktop
// notification for each NEW case. It stays until the case is closed on the Escalations page.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getUrgentAlerts, type UrgentAlert } from "../api/work.api";
import { usePermissions } from "../hooks/usePermissions";
import { fmtTime } from "./ui";

const SEEN_KEY = "oxxy-urgent-seen";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveSeen(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* private window: the sound may repeat after a reload */
  }
}

/** Three short beeps (Web Audio, no file). Browsers allow it after the user has clicked on the page once. */
function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.26);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* no audio */
  }
}

function notify(a: UrgentAlert) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(
      a.label.startsWith("Callback due") ? a.label : `URGENT: ${a.label}`,
      {
        body: `${a.customer?.first_name || "Customer"} · open the Oxxy console now`,
        tag: a.task_id,
        requireInteraction: true,
      },
    );
    n.onclick = () => window.focus();
  } catch {
    /* notifications blocked */
  }
}

export default function UrgentBanner() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const allowed = can("tasks.work");
  const q = useQuery({
    queryKey: ["tasks", "urgent"],
    queryFn: getUrgentAlerts,
    enabled: allowed,
    refetchInterval: 15_000, // live task events refresh it at once; this is the fallback
  });
  const seen = useRef<Set<string>>(readSeen());
  const [perm, setPerm] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const alerts = q.data ?? [];

  // a sound and a desktop notification once per new open case (not again for the same case)
  useEffect(() => {
    const fresh = (q.data ?? []).filter((a) => a.status !== "done" && !seen.current.has(a.task_id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.current.add(a.task_id));
    saveSeen(seen.current);
    beep();
    fresh.forEach(notify);
  }, [q.data]);

  // the tab title shows the count while cases are open
  useEffect(() => {
    const base = document.title.replace(/^\(\d+ urgent\) /, "");
    document.title = alerts.length ? `(${alerts.length} urgent) ${base}` : base;
  }, [alerts.length]);

  if (!allowed || !alerts.length) return null;
  return (
    <div className="urgent-banner" role="alert" aria-live="assertive">
      <div className="row" style={{ gap: 8 }}>
        <b>
          Urgent:{" "}
          {alerts.length === 1
            ? "1 case needs a person now"
            : `${alerts.length} cases need a person now`}
        </b>
        <span className="spacer" />
        {perm === "default" && (
          <button
            className="btn sm"
            onClick={() => Notification.requestPermission().then((p) => setPerm(p))}
          >
            Turn on desktop alerts
          </button>
        )}
        <button className="btn sm" onClick={() => navigate("/escalations")}>
          Open escalations
        </button>
      </div>
      {alerts.slice(0, 3).map((a) => (
        <div key={a.task_id} className="row urgent-item">
          <span className="urgent-dot" aria-hidden="true" />
          <b>{a.label}</b>
          <span>
            {a.customer?.first_name || "Customer"}{" "}
            <span className="mono">{a.customer?.wa_number}</span>
          </span>
          <span className="small">{fmtTime(a.created_at)}</span>
          {a.handled_by ? (
            <span className="small">· {a.handled_by} is on it</span>
          ) : (
            <span className="small">· nobody has taken it yet</span>
          )}
          <span className="spacer" />
          {a.customer?.wa_number && (
            <button
              className="btn sm"
              onClick={() => navigate(`/live-chat?q=${encodeURIComponent(a.customer!.wa_number)}`)}
            >
              Open chat
            </button>
          )}
        </div>
      ))}
      {alerts.length > 3 && (
        <div className="small">and {alerts.length - 3} more on the Escalations page</div>
      )}
    </div>
  );
}
