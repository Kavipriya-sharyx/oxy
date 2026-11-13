import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  handBackConversation,
  listConversations,
  listMessages,
  replyToConversation,
  takeOverConversation,
} from "../api/conversations.api";
import type { Conversation } from "../types";
import { usePermissions } from "../hooks/usePermissions";
import CustomerRecordDrawer from "../components/CustomerRecordDrawer";
import {
  Empty,
  ErrorNote,
  fmtTime,
  initials,
  Pill,
  StatePill,
  Tabs,
  usePageTitle,
} from "../components/ui";

type View = "all" | "person" | "booking" | "opted";
const DAY = 24 * 60 * 60 * 1000;
const inWindow = (c: Conversation) =>
  !!c.last_customer_message_at && Date.now() - new Date(c.last_customer_message_at).getTime() < DAY;
const nameOf = (c?: Conversation) =>
  c?.customer?.first_name || c?.customer?.wa_number || "Customer";
const productOf = (c: Conversation) => {
  const p = c.customer?.active_product || c.selected_product;
  if (p === "cut_medi_bills") return "Cut Medi Bills";
  if (p === "oxxy")
    return (
      "Oxxy" +
      (c.recommended_plan
        ? ` · ${c.recommended_plan[0].toUpperCase()}${c.recommended_plan.slice(1)}`
        : "")
    );
  return null;
};

export default function LiveChat() {
  usePageTitle("Conversations", "WhatsApp inbox");
  const { message } = App.useApp();
  const { can } = usePermissions();
  const canReply = can("conversations.reply");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const q = (params.get("q") || "").toLowerCase();
  const msgsRef = useRef<HTMLDivElement>(null);

  const convs = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    refetchInterval: 20_000, // live updates push changes; this is the fallback
  });
  const filters: Record<View, (c: Conversation) => boolean> = {
    all: () => true,
    person: (c) => c.state === "pause" || c.state === "escalated",
    booking: (c) => c.state === "booking_capture" || c.state === "booking_recorded",
    opted: (c) => c.state === "opted_out",
  };
  const list = (convs.data ?? [])
    .filter(filters[view])
    .filter(
      (c) =>
        !q ||
        `${c.customer?.first_name ?? ""} ${c.customer?.wa_number ?? ""} ${c.state}`
          .toLowerCase()
          .includes(q),
    );
  const active = list.find((c) => c.id === selectedId) ?? list[0];

  const msgs = useQuery({
    queryKey: ["messages", active?.id],
    queryFn: () => listMessages(active!.id),
    enabled: !!active?.id,
    refetchInterval: 15_000, // live updates push changes; this is the fallback
  });
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [msgs.data?.length, active?.id]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (active?.id) await queryClient.invalidateQueries({ queryKey: ["messages", active.id] });
  };
  const onError = (e: Error) => message.error(e.message);
  const [handBackNote, setHandBackNote] = useState<string | null>(null); // null = the note box is closed
  const takeOver = useMutation({
    mutationFn: takeOverConversation,
    onSuccess: async () => {
      message.success("You are replying now. The bot is paused for this chat.");
      await refresh();
    },
    onError,
  });
  const handBack = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => handBackConversation(id, note),
    onSuccess: async () => {
      setHandBackNote(null);
      message.success("Handed back. The bot resumes from the stored state.");
      await refresh();
    },
    onError,
  });
  const reply = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => replyToConversation(id, body),
    onSuccess: async () => {
      setDraft("");
      await refresh();
    },
    onError,
  });

  const withPerson = active?.state === "pause" || active?.state === "escalated";
  const optedOut = active?.state === "opted_out";
  const open = active ? inWindow(active) : false;
  const send = () => active && draft.trim() && reply.mutate({ id: active.id, body: draft.trim() });

  return (
    <>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={setView}
          items={[
            ["all", "All"],
            ["person", "Needs a person"],
            ["booking", "Booking in progress"],
            ["opted", "Opted out"],
          ]}
        />
        <span className="spacer" />
        {q && (
          <span className="row small" style={{ gap: 6 }}>
            Filtered by “{params.get("q")}”
            <button className="btn sm" onClick={() => setParams({})}>
              Clear
            </button>
          </span>
        )}
      </div>
      <ErrorNote error={convs.error} />
      <div className="panel inbox">
        <div className="ilist">
          {convs.isLoading && <Empty>Loading…</Empty>}
          {!convs.isLoading && !list.length && <Empty>No conversations in this view.</Empty>}
          {list.map((c) => (
            <div
              key={c.id}
              className={`iitem ${c.id === active?.id ? "on" : ""}`}
              onClick={() => {
                setSelectedId(c.id);
                setHandBackNote(null);
              }}
            >
              <div className="avatar">{initials(nameOf(c))}</div>
              <div className="t">
                <b>
                  <span>{nameOf(c)}</span>
                  <span className="muted small mono" style={{ fontWeight: 400 }}>
                    {fmtTime(c.last_customer_message_at)}
                  </span>
                </b>
                <p className="mono small">{c.customer?.wa_number}</p>
                <div className="row" style={{ gap: 6 }}>
                  <StatePill state={c.state} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="thread">
          {!active ? (
            <Empty>Select a conversation.</Empty>
          ) : (
            <>
              <div className="panel-h" style={{ background: "var(--surface)" }}>
                <div className="avatar">{initials(nameOf(active))}</div>
                <div>
                  <b>{nameOf(active)}</b>
                  <div className="small muted mono">{active.customer?.wa_number}</div>
                </div>
                <span className="spacer" />
                <StatePill state={active.state} />
                <button className="btn sm" onClick={() => setRecordFor(active.customer_id)}>
                  CRM record
                </button>
                {!optedOut &&
                  canReply &&
                  (withPerson ? (
                    <button
                      className="btn sm"
                      disabled={handBack.isPending || handBackNote !== null}
                      onClick={() => setHandBackNote("")}
                    >
                      Hand back to bot
                    </button>
                  ) : (
                    <button
                      className="btn sm"
                      disabled={takeOver.isPending}
                      onClick={() => takeOver.mutate(active.id)}
                    >
                      Take over
                    </button>
                  ))}
              </div>
              {handBackNote !== null && (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  <div style={{ marginBottom: 6 }}>
                    Note for the bot (optional): what was agreed, or what it should not bring up again.
                    The customer never sees it.
                  </div>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={1000}
                    style={{ width: "100%" }}
                    value={handBackNote}
                    onChange={(e) => setHandBackNote(e.target.value)}
                    placeholder="e.g. Customer will pay after salary on the 1st; do not send the link again."
                  />
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button
                      className="btn sm"
                      disabled={handBack.isPending}
                      onClick={() => handBack.mutate({ id: active.id, note: handBackNote })}
                    >
                      Hand back
                    </button>
                    <button className="btn sm" onClick={() => setHandBackNote(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div className="msgs" ref={msgsRef}>
                {(msgs.data ?? []).map((m) => (
                  <div key={m.id} className={`bub ${m.direction === "in" ? "" : "out"}`}>
                    {m.body ||
                      (m.template_name ? `[Template ${m.template_name}]` : "[Non-text message]")}
                    <div className="meta">
                      {m.direction === "out" && (
                        <span>
                          {m.sender === "bot" ? "Bot" : m.sender === "agent" ? "Team" : m.sender}
                        </span>
                      )}
                      <span>{fmtTime(m.created_on)}</span>
                      {m.direction === "out" && m.message_status === "failed" && (
                        <span style={{ color: "var(--crit)" }}>failed</span>
                      )}
                      {m.direction === "in" && m.message_status === "stale" && (
                        <span
                          style={{ color: "var(--warn)" }}
                          title="Arrived late, after a newer message was answered. The bot did not reply to it; read it and reply yourself if needed."
                        >
                          not answered (late)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {!msgs.isLoading && !(msgs.data ?? []).length && (
                  <div className="sys">No messages yet.</div>
                )}
              </div>
              {active.state === "pause" && (
                <div
                  className="panel-b small"
                  style={{ background: "var(--crit-soft)", color: "var(--crit)" }}
                >
                  Automation is paused (safety or privacy). Reply manually only
                  after checking on the customer.
                </div>
              )}
              {optedOut ? (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  Customer opted out. Messages are blocked unless there is an open booking request.
                </div>
              ) : !canReply ? (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  Your role can read chats but not reply.
                </div>
              ) : open ? (
                <div className="composer">
                  <textarea
                    className="input"
                    placeholder="Reply as the Oxxy team (inside the 24-hour window)"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button
                    className="btn pri"
                    disabled={!draft.trim() || reply.isPending}
                    onClick={send}
                  >
                    Send
                  </button>
                </div>
              ) : (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  The 24-hour reply window is closed. Only approved templates can be sent now.
                </div>
              )}
            </>
          )}
        </div>

        <aside className="side">
          {active && (
            <>
              <div>
                <div className="eyebrow">Customer</div>
                <dl className="kv" style={{ marginTop: 8 }}>
                  <dt>Name</dt>
                  <dd>{active.customer?.first_name ?? "—"}</dd>
                  <dt>WhatsApp</dt>
                  <dd className="mono">{active.customer?.wa_number ?? "—"}</dd>
                  <dt>CRM</dt>
                  <dd className="mono">
                    {active.customer?.crm_customer_id ?? (
                      <span className="muted">Not synced yet</span>
                    )}
                  </dd>
                  <dt>Language</dt>
                  <dd>{active.customer?.language ?? "—"}</dd>
                  <dt>Age</dt>
                  <dd>{active.customer?.age ?? "—"}</dd>
                  <dt>Product</dt>
                  <dd>{productOf(active) ?? <span className="muted">Not chosen</span>}</dd>
                  <dt>24-hour window</dt>
                  <dd>{open ? <Pill tone="ok">Open</Pill> : <Pill>Closed</Pill>}</dd>
                </dl>
              </div>
              <div>
                <div className="eyebrow">Rules for this chat</div>
                <div style={{ marginTop: 8 }}>
                  {[
                    ["One product per customer", true],
                    ["Bookings stay pending until the sales team confirms", true],
                    ["Never call Oxxy insurance", true],
                    ["STOP ends every automated message", true],
                  ].map(([t]) => (
                    <div key={String(t)} className="check">
                      <i className="y">✓</i>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {recordFor && <CustomerRecordDrawer customerId={recordFor} onClose={() => setRecordFor(null)} />}
    </>
  );
}
