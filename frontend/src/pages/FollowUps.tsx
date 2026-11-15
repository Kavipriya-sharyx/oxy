import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelFollowUp, listFollowUps } from "../api/ops.api";
import { usePermissions } from "../hooks/usePermissions";
import {
  Empty,
  ErrorNote,
  fmtTime,
  Panel,
  Pill,
  Stat,
  Tabs,
  type Tone,
  usePageTitle,
} from "../components/ui";

type View = "scheduled" | "sent" | "skipped" | "cancelled";

const KIND: Record<string, [string, Tone]> = {
  agreed_follow_up: ["Agreed follow-up (N)", "acc"],
  rescue: ["Rescue", "info"],
  trigger_q: ["Payment reminder (Q)", "warn"],
  booking_update: ["Booking update", "plain"],
};

const SKIP: Record<string, string> = {
  opt_out: "Customer opted out",
  privacy_request: "Privacy request",
  emergency: "Safety event open",
  active_complaint: "A person has the chat",
  frequency_cap: "Rescue limit reached",
  active_product: "Product already active",
  paid_or_cancelled: "Link paid or cancelled",
  payment_reported: "Customer said DONE",
  duplicate: "Already sent",
  closed: "Conversation closed",
  customer_replied: "Customer replied",
  cancelled_by_team: "Cancelled by the team",
  agreed_follow_up: "Replaced by an agreed follow-up",
  data_erased: "Data erased",
};

/** "in 2 h", "overdue 3 h" ... from now to a due time */
function dueText(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const abs = Math.abs(mins);
  const span =
    abs < 60
      ? `${abs} min`
      : abs < 48 * 60
        ? `${Math.floor(abs / 60)} h`
        : `${Math.floor(abs / 1440)} days`;
  return { overdue: mins < 0, text: mins < 0 ? `overdue ${span}` : `in ${span}` };
}
/** Messages go out 09:00-21:00 IST only; a row due outside that waits for the next 09:00 */
function inQuietHours(iso: string) {
  const h = Number(
    new Date(iso).toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }),
  );
  return h < 9 || h >= 21;
}

export default function FollowUps() {
  usePageTitle("Follow-ups", "Work · scheduled WhatsApp messages");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [view, setView] = useState<View>("scheduled");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const note = useRef("");
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = useQuery({
    queryKey: ["followUps", view, term, kind, page],
    queryFn: () => listFollowUps(view, { q: term, kind, page }),
    refetchInterval: 60_000,
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelFollowUp(id, reason),
    onSuccess: async () => {
      message.success("Cancelled. The customer will not get this message.");
      await qc.invalidateQueries({ queryKey: ["followUps"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const askCancel = (id: string, who: string) => {
    note.current = "";
    modal.confirm({
      title: `Cancel this message to ${who}?`,
      content: (
        <div>
          <p style={{ marginTop: 0 }}>The customer will not get it, and it cannot be restored.</p>
          <textarea
            className="input"
            rows={2}
            maxLength={200}
            placeholder="Why? (optional note)"
            onChange={(e) => (note.current = e.target.value)}
          />
        </div>
      ),
      okText: "Yes, cancel it",
      okButtonProps: { danger: true },
      onOk: () => cancel.mutateAsync({ id, reason: note.current }),
    });
  };

  const rows = q.data?.rows ?? [];
  const sum = q.data?.summary;
  const total = q.data?.total ?? 0;
  const size = q.data?.page_size ?? 50;
  const pages = Math.max(1, Math.ceil(total / size));
  const filtered = !!(term || kind);
  const switchView = (v: View) => {
    setView(v);
    setPage(0);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          Every message the bot will send later: agreed follow-ups, rescues after no reply (at most
          two in a row), the one payment reminder and booking updates. Consent, quiet hours
          (09:00–21:00 IST) and the conversation state are checked again at send time, so a row can
          still be skipped.
        </div>
      </div>
      <div className="grid g4">
        <Stat label="Scheduled" value={sum?.scheduled ?? "…"} detail="Waiting to be sent" />
        <Stat label="Due in the next hour" value={sum?.next_hour ?? "…"} detail="Going out soon" />
        <Stat
          label="Overdue"
          value={sum?.overdue ?? "…"}
          detail="Past the due time and not sent yet (quiet hours or a delay)"
        />
      </div>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={switchView}
          items={[
            ["scheduled", "Scheduled"],
            ["sent", "Sent"],
            ["skipped", "Skipped"],
            ["cancelled", "Cancelled"],
          ]}
        />
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Search name, number or template"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          style={{ width: "auto" }}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Any kind</option>
          {Object.entries(KIND).map(([k, [l]]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            className="btn sm"
            onClick={() => {
              setSearch("");
              setKind("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {view === "skipped" && (q.data?.skip_reasons ?? []).length > 0 && (
        <div className="panel">
          <div className="panel-b small">
            <b>Why messages were skipped:</b>{" "}
            {(q.data?.skip_reasons ?? []).map((r, i) => (
              <span key={r.reason}>
                {i > 0 && " · "}
                {SKIP[r.reason] ?? r.reason} <b>{r.n}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      <ErrorNote error={q.error} />
      <Panel bodyless>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Kind</th>
                <th>{view === "scheduled" ? "Due" : "Was due"}</th>
                <th>Template</th>
                <th>Reason</th>
                {view !== "scheduled" && <th>Result</th>}
                {view === "scheduled" && can("conversations.reply") && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [label, tone] = KIND[r.kind] ?? [r.kind, "plain" as Tone];
                const due = view === "scheduled" ? dueText(r.scheduled_for) : null;
                const quiet = view === "scheduled" && inQuietHours(r.scheduled_for);
                const who = r.customer?.first_name || r.customer?.wa_number || "this customer";
                return (
                  <tr key={r.id}>
                    <td>
                      {r.customer ? (
                        <Link to={`/live-chat?q=${encodeURIComponent(r.customer.wa_number)}`}>
                          <b>{r.customer.first_name ?? "—"}</b>
                        </Link>
                      ) : (
                        <b>—</b>
                      )}
                      <div className="mono small muted">{r.customer?.wa_number}</div>
                    </td>
                    <td>
                      <Pill tone={tone}>{label}</Pill>
                    </td>
                    <td className="small">
                      {fmtTime(r.scheduled_for)}
                      {due && (
                        <div
                          style={
                            due.overdue ? { color: "var(--crit)", fontWeight: 600 } : undefined
                          }
                        >
                          {due.text}
                        </div>
                      )}
                      {quiet && <div className="muted">Quiet hours: sent from 09:00 IST</div>}
                    </td>
                    <td className="mono small">{r.template_name ?? "—"}</td>
                    <td className="small">{r.reason ?? "—"}</td>
                    {view !== "scheduled" && (
                      <td className="small">
                        {r.skip_reason ? (SKIP[r.skip_reason] ?? r.skip_reason) : "—"}
                      </td>
                    )}
                    {view === "scheduled" && can("conversations.reply") && (
                      <td>
                        <button
                          className="btn sm"
                          disabled={cancel.isPending}
                          onClick={() => askCancel(r.id, who)}
                        >
                          Cancel
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !rows.length && (
            <Empty>{filtered ? "Nothing matches these filters." : "Nothing here."}</Empty>
          )}
        </div>
      </Panel>
      {pages > 1 && (
        <div className="row">
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹ Previous
          </button>
          <span className="small muted">
            Page {page + 1} of {pages} · {total} rows
          </span>
          <button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next ›
          </button>
        </div>
      )}
    </>
  );
}
