import { useQuery } from "@tanstack/react-query";
import { getCustomerRecord } from "../api/insights.api";
import { Drawer, Empty, ErrorNote } from "./ui";

// The Playbook 17 customer record, one block per field group (read-only)
const GROUPS: [string, string][] = [
  ["identity", "Identity"],
  ["consent", "Consent"],
  ["need", "Need"],
  ["location", "Location"],
  ["provider", "Provider"],
  ["eligibility", "Eligibility"],
  ["routing", "Routing"],
  ["booking", "Booking"],
  ["activation", "Activation"],
  ["engagement", "Engagement"],
  ["content", "Content"],
  ["trigger_events", "Trigger events"],
];

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    return v.map((x) => (typeof x === "object" && x ? (x as Record<string, unknown>).name ?? JSON.stringify(x) : String(x))).join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? new Date(s).toLocaleString("en-IN") : s;
}

function Fields({ obj }: { obj: Record<string, unknown> }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(140px, 40%) 1fr", gap: "4px 12px" }}>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span className="small muted">{label(k)}</span>
          <span className="small" style={{ overflowWrap: "anywhere" }}>{show(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CustomerRecordDrawer({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["customerRecord", customerId], queryFn: () => getCustomerRecord(customerId) });
  const r = q.data as Record<string, unknown> | undefined;
  return (
    <Drawer title="CRM record" onClose={onClose}>
      <ErrorNote error={q.error} />
      {q.isLoading && <Empty>Loading…</Empty>}
      {r &&
        GROUPS.map(([key, title]) => {
          const v = r[key];
          const list = Array.isArray(v) ? (v as Record<string, unknown>[]) : null;
          return (
            <section key={key} style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {title}
                {list ? ` (${list.length})` : ""}
              </div>
              {list ? (
                list.length ? (
                  list.map((row, i) => (
                    <div key={i} className="panel" style={{ padding: 8, marginBottom: 6 }}>
                      <Fields obj={row} />
                    </div>
                  ))
                ) : (
                  <span className="small muted">None</span>
                )
              ) : (
                <Fields obj={(v ?? {}) as Record<string, unknown>} />
              )}
            </section>
          );
        })}
    </Drawer>
  );
}
