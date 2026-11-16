import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTasks, updateTask } from "../api/work.api";
import {
  Empty,
  ErrorNote,
  fmtTime,
  Pill,
  Stat,
  Tabs,
  type Tone,
  usePageTitle,
} from "../components/ui";

type View = "open" | "done" | "all";
const TYPES: Record<string, string> = {
  emergency: "Safety event",
  self_harm: "Self-harm (urgent)",
  escalation: "Escalation / callback",
  human_handoff: "Asked for a person",
  booking_confirm: "Booking confirmation",
  verify_activation: "Verify activation",
  activation: "Activation problem",
  holding_message: "Reply failed (holding message sent)",
  opt_out_open_case: "Opted out with an open case",
  privacy_request: "Privacy request",
  payment_issue: "Payment failed",
  directory_verification: "Check a new centre",
  servicing: "Existing customer request",
  activation_follow_up: "Activation follow-up (after booking)",
};
const PRIO: Record<string, [string, Tone]> = {
  urgent: ["Urgent", "crit"],
  high: ["High", "warn"],
  normal: ["Normal", "plain"],
  low: ["Low", "plain"],
};
// a task waiting longer than this is overdue: urgent after 1 hour, everything else after 24 hours
const overdueHours = (priority: string) => (priority === "urgent" ? 1 : 24);

function waiting(iso?: string) {
  if (!iso) return { text: "", hours: 0 };
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  const hours = mins / 60;
  if (mins < 60) return { text: `${mins} min`, hours };
  if (hours < 48) return { text: `${Math.floor(hours)} h`, hours };
  return { text: `${Math.floor(hours / 24)} days`, hours };
}

export default function Escalations() {
  usePageTitle("Escalations", "Tasks for people");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  // opened from another page with ?q=... (Activations -> Payment support): search all tasks for that customer
  const [view, setView] = useState<View>(params.get("q") ? "all" : "open");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [term, setTerm] = useState(search.trim());
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [mine, setMine] = useState(false);
  const note = useRef("");

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const q = useQuery({
    queryKey: ["tasks", view, term, type, priority, mine],
    queryFn: () => listTasks(view, { q: term, type, priority, mine }),
    refetchInterval: 15_000,
  });
  const act = useMutation({
    mutationFn: ({
      id,
      action,
      outcome,
    }: {
      id: string;
      action: "claim" | "done";
      outcome?: string;
    }) => updateTask(id, action, outcome),
    onSuccess: async (_r, v) => {
      message.success(
        v.action === "done" ? "Done. The chat is handed back to the bot." : "Assigned to you",
      );
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const askDone = (id: string, who: string) => {
    note.current = "";
    modal.confirm({
      title: `Mark this task done for ${who}?`,
      content: (
        <div>
          <p style={{ marginTop: 0 }}>
            The chat goes back to the bot, which may message the customer again.
          </p>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder="What was done? (optional note)"
            onChange={(e) => (note.current = e.target.value)}
          />
        </div>
      ),
      okText: "Yes, done",
      onOk: () => act.mutateAsync({ id, action: "done", outcome: note.current }),
    });
  };

  const crm = q.data?.crmEnabled ?? false;
  const sum = q.data?.summary;
  const rows = q.data?.rows ?? [];
  const filtered = !!(term || type || priority || mine);

  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          {crm ? (
            <>
              The bot creates these tasks in the CRM through the outbox. The sales team works them
              in the CRM; its <span className="mono">task.completed</span> webhook closes them here
              and hands the chat back to the bot.
            </>
          ) : (
            <>
              Your team works these tasks here, or in the client's CRM through the Oxxy API (it
              reads them from the changes feed and closes them with Tasks / Complete). Marking a
              task done also hands its chat back to the bot.
            </>
          )}
        </div>
      </div>
      <div className="grid g4">
        <Stat label="Open tasks" value={sum?.open ?? "…"} detail="All open, whatever the filter" />
        <Stat label="Urgent" value={sum?.urgent ?? "…"} detail="Answer within the hour" />
        <Stat label="Unassigned" value={sum?.unassigned ?? "…"} detail="Nobody has claimed them" />
        <Stat
          label="In progress / mine"
          value={sum ? `${sum.in_progress} / ${sum.mine}` : "…"}
          detail="Claimed by someone / by you"
        />
      </div>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            ["open", "Open"],
            ["done", "Done"],
            ["all", "All"],
          ]}
        />
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Search name, number, note or CB- reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          style={{ width: "auto" }}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Any priority</option>
          {Object.entries(PRIO).map(([k, [l]]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ width: "auto" }}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Any task type</option>
          {Object.entries(TYPES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {!crm && (
          <label className="small row" style={{ gap: 6 }}>
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Mine only
          </label>
        )}
        {filtered && (
          <button
            className="btn sm"
            onClick={() => {
              setSearch("");
              setType("");
              setPriority("");
              setMine(false);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Task</th>
                <th>Customer</th>
                <th>Created</th>
                <th>Owner</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const [pl, pt] = PRIO[t.priority] ?? [t.priority, "plain" as Tone];
                const w = waiting(t.created_on);
                const overdue = t.task_status !== "done" && w.hours > overdueHours(t.priority);
                const who = t.customer?.first_name || t.customer?.wa_number || "this customer";
                return (
                  <tr key={t.id}>
                    <td>
                      <Pill tone={pt}>{pl}</Pill>
                    </td>
                    <td>
                      <b>{TYPES[t.type] ?? t.type}</b>
                      {t.summary && !t.summary.startsWith("wamid:") && (
                        <div className="small muted">{t.summary}</div>
                      )}
                      {t.callback_from && (
                        <div className="small">
                          {t.case_ref && (
                            <span
                              className="mono"
                              title="The reference the customer was given on WhatsApp"
                              style={{ marginRight: 8 }}
                            >
                              Ref {t.case_ref}
                            </span>
                          )}
                          Call back: <b>{fmtTime(t.callback_from)}</b>
                          {t.callback_to && (
                            <>
                              {" "}
                              to{" "}
                              {new Date(t.callback_to).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </>
                          )}
                        </div>
                      )}
                      {t.task_status === "done" && t.outcome && (
                        <div className="small muted">Outcome: {t.outcome}</div>
                      )}
                    </td>
                    <td>
                      {t.customer ? (
                        <>
                          <Link to={`/live-chat?q=${encodeURIComponent(t.customer.wa_number)}`}>
                            {t.customer.first_name || t.customer.wa_number}
                          </Link>
                          <div className="small muted mono">{t.customer.wa_number}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="small">
                      {fmtTime(t.created_on)}
                      {t.task_status !== "done" && (
                        <div
                          style={overdue ? { color: "var(--crit)", fontWeight: 600 } : undefined}
                        >
                          Waiting {w.text}
                          {overdue && " · overdue"}
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {t.assigned_to?.first_name || t.assigned_to?.email || (
                        <span className="muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {t.task_status === "done" ? (
                        <Pill tone="ok">Done</Pill>
                      ) : t.task_status === "in_progress" ? (
                        <Pill tone="info">In progress</Pill>
                      ) : (
                        <Pill tone="warn">Open</Pill>
                      )}
                    </td>
                    <td>
                      {!crm && t.task_status !== "done" && (
                        <div
                          className="row"
                          style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}
                        >
                          {t.task_status === "open" && (
                            <button
                              className="btn sm"
                              disabled={act.isPending}
                              onClick={() => act.mutate({ id: t.id, action: "claim" })}
                            >
                              Claim
                            </button>
                          )}
                          <button
                            className="btn sm pri"
                            disabled={act.isPending}
                            onClick={() => askDone(t.id, who)}
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !rows.length && (
            <Empty>{filtered ? "No tasks match these filters." : "Nothing here."}</Empty>
          )}
        </div>
      </div>
    </>
  );
}
