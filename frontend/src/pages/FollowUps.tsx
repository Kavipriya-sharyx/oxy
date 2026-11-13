import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelFollowUp, listFollowUps } from "../api/ops.api";
import { usePermissions } from "../hooks/usePermissions";
import { Empty, ErrorNote, fmtTime, Panel, Pill, Tabs, type Tone, usePageTitle } from "../components/ui";

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

export default function FollowUps() {
  usePageTitle("Follow-ups", "Work · scheduled WhatsApp messages");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [view, setView] = useState<View>("scheduled");
  const q = useQuery({ queryKey: ["followUps", view], queryFn: () => listFollowUps(view), refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: cancelFollowUp,
    onSuccess: async () => {
      message.success("Cancelled. The customer will not get this message.");
      await qc.invalidateQueries({ queryKey: ["followUps"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const rows = q.data ?? [];

  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          Every message the bot will send later: agreed follow-ups, rescues after no reply (at most two in a
          row), the one payment reminder and booking updates. Consent, quiet hours (09:00–21:00 IST) and the
          conversation state are checked again at send time, so a row can still be skipped.
        </div>
      </div>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            ["scheduled", "Scheduled"],
            ["sent", "Sent"],
            ["skipped", "Skipped"],
            ["cancelled", "Cancelled"],
          ]}
        />
      </div>
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
                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.customer?.first_name ?? "—"}</b>
                      <div className="mono small muted">{r.customer?.wa_number}</div>
                    </td>
                    <td>
                      <Pill tone={tone}>{label}</Pill>
                    </td>
                    <td className="small">{fmtTime(r.scheduled_for)}</td>
                    <td className="mono small">{r.template_name ?? "—"}</td>
                    <td className="small">{r.reason ?? "—"}</td>
                    {view !== "scheduled" && <td className="small">{r.skip_reason ? (SKIP[r.skip_reason] ?? r.skip_reason) : "—"}</td>}
                    {view === "scheduled" && can("conversations.reply") && (
                      <td>
                        <button className="btn sm" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
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
          {!q.isLoading && !rows.length && <Empty>Nothing here.</Empty>}
        </div>
      </Panel>
    </>
  );
}
