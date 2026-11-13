import { useState } from "react";
import { App } from "antd";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTasks, updateTask } from "../api/work.api";
import { Empty, ErrorNote, fmtTime, Pill, Tabs, type Tone, usePageTitle } from "../components/ui";

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
};
const PRIO: Record<string, [string, Tone]> = {
  urgent: ["Urgent", "crit"],
  high: ["High", "warn"],
  normal: ["Normal", "plain"],
  low: ["Low", "plain"],
};

export default function Escalations() {
  usePageTitle("Escalations", "Tasks for people");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("open");
  const q = useQuery({
    queryKey: ["tasks", view],
    queryFn: () => listTasks(view),
    refetchInterval: 15_000,
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "claim" | "done" }) =>
      updateTask(id, action),
    onSuccess: async (_r, v) => {
      message.success(
        v.action === "done" ? "Done. The chat is handed back to the bot." : "Assigned to you",
      );
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const crm = q.data?.crmEnabled ?? false;

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
              The CRM is not connected, so tasks are worked here. Marking a task done also hands its
              chat back to the bot.
            </>
          )}
        </div>
      </div>
      <Tabs<View>
        value={view}
        onChange={setView}
        items={[
          ["open", "Open"],
          ["done", "Done"],
          ["all", "All"],
        ]}
      />
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
              {(q.data?.rows ?? []).map((t) => {
                const [pl, pt] = PRIO[t.priority] ?? [t.priority, "plain" as Tone];
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
                    </td>
                    <td>
                      {t.customer ? (
                        <Link to={`/live-chat?q=${encodeURIComponent(t.customer.wa_number)}`}>
                          {t.customer.first_name || t.customer.wa_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="small">{fmtTime(t.created_on)}</td>
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
                            onClick={() => act.mutate({ id: t.id, action: "done" })}
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
          {!q.isLoading && !(q.data?.rows ?? []).length && <Empty>Nothing here.</Empty>}
        </div>
      </div>
    </>
  );
}
