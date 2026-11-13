import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmBooking, listBookings } from "../api/bookings.api";
import { usePermissions } from "../hooks/usePermissions";
import {
  BOOKING_TONE,
  Empty,
  ErrorNote,
  fmtDate,
  Pill,
  Tabs,
  usePageTitle,
} from "../components/ui";

type View = "pending_confirmation" | "confirmed" | "cancelled" | "all";
const CRM_URL = import.meta.env.VITE_CRM_BASE_URL as string | undefined;

// booking window: today + 3 days to the same date + 6 months, India time (Full Plan 1.1)
function windowText() {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const min = new Date(ist);
  min.setDate(min.getDate() + 3);
  const max = new Date(ist);
  max.setMonth(max.getMonth() + 6);
  const f = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${f(min)} – ${f(max)}`;
}

export default function Bookings() {
  usePageTitle("Booking requests", "Confirmed only by the sales team in the CRM");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [view, setView] = useState<View>("pending_confirmation");
  const q = useQuery({
    queryKey: ["bookings", "list", view],
    queryFn: () => listBookings(view === "all" ? undefined : view),
  });

  const confirm = useMutation({
    mutationFn: confirmBooking,
    onSuccess: async () => {
      message.success("Booking confirmed. The customer is told on WhatsApp.");
      await qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const consoleConfirm = !CRM_URL && can("bookings.confirm");

  return (
    <>
      <div className="panel">
        <div className="panel-b small">
          The bot saves every request as <b>pending</b> and sends it to the CRM. The sales team
          confirms it with the centre in the CRM; the CRM's{" "}
          <span className="mono">booking.confirmed</span> webhook updates this list and sends the
          customer the WhatsApp template.
        </div>
      </div>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            ["pending_confirmation", "Pending"],
            ["confirmed", "Confirmed"],
            ["cancelled", "Cancelled"],
            ["all", "All"],
          ]}
        />
        <span className="spacer" />
        <span className="small muted">
          Allowed dates today: <span className="mono">{windowText()}</span> (IST)
        </span>
      </div>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>WhatsApp</th>
                <th>Centre</th>
                <th>Service</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((b) => {
                const [label, tone] = BOOKING_TONE[b.booking_status] ?? [b.booking_status, "plain"];
                return (
                  <tr key={b.id}>
                    <td>
                      <b>{b.customer?.first_name ?? "—"}</b>
                    </td>
                    <td className="mono small">{b.customer?.wa_number ?? "—"}</td>
                    <td>
                      {b.centre?.name ?? "—"}
                      {b.centre?.branch && <div className="small muted">{b.centre.branch}</div>}
                    </td>
                    <td className="small">{b.specialisation ?? "—"}</td>
                    <td className="mono">{fmtDate(b.preferred_date)}</td>
                    <td className="small">{b.preferred_time ?? "—"}</td>
                    <td>
                      <Pill tone={tone}>{label}</Pill>
                    </td>
                    <td>
                      <div
                        className="row"
                        style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}
                      >
                        {CRM_URL && b.crm_booking_id && (
                          <a
                            className="btn sm"
                            href={`${CRM_URL.replace(/\/$/, "")}/bookings/${b.crm_booking_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in CRM
                          </a>
                        )}
                        {consoleConfirm && b.booking_status === "pending_confirmation" && (
                          <button
                            className="btn sm pri"
                            disabled={confirm.isPending}
                            onClick={() => confirm.mutate(b.id)}
                          >
                            Confirm
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !(q.data ?? []).length && <Empty>Nothing here.</Empty>}
        </div>
      </div>
      {consoleConfirm && (
        <p className="small muted">
          The CRM is not connected (no <span className="mono">VITE_CRM_BASE_URL</span>), so admins
          confirm here after calling the centre.
        </p>
      )}
    </>
  );
}
