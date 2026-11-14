import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  handBackConversation,
  listConversations,
  listMessages,
  MESSAGE_PAGE,
  replyToConversation,
  takeOverConversation,
} from "../api/conversations.api";
import type { Conversation, Message } from "../types";
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
const PAGE = 100;
const inWindow = (c: Conversation, now: number) =>
  !!c.last_customer_message_at && now - new Date(c.last_customer_message_at).getTime() < DAY;
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
const whoSent = (m: { direction: string; sender: string }) =>
  m.direction === "in" ? "" : m.sender === "agent" ? "Team: " : "Bot: ";

// A tap on a list row or button arrives as the row id: show what the customer actually tapped
const TAP_LABELS: Record<string, string> = {
  menu_need: "Tapped: Reduce a medical bill",
  menu_centre: "Tapped: Find or book a centre",
  menu_explain: "Tapped: Understand Oxxy",
  menu_service: "Tapped: Existing customer help",
  lead_yes: "Tapped: Yes, please",
  lead_details: "Tapped: Just send details",
  lead_not_now: "Tapped: Not now",
};

export default function LiveChat() {
  usePageTitle("Conversations", "WhatsApp inbox");
  const { message } = App.useApp();
  const { can } = usePermissions();
  const canReply = can("conversations.reply");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>("all");
  const [limit, setLimit] = useState(PAGE);
  // the chat that is open stays open until someone picks another one: new messages, a state change or a
  // tab filter never switch it to a different customer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Conversation | null>(null);
  // one draft per chat, so text typed for one customer is never sent to another
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [older, setOlder] = useState<{ id: string; rows: Message[]; done: boolean }>({
    id: "",
    rows: [],
    done: false,
  });
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const q = (params.get("q") || "").trim();
  const msgsRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // the 24-hour window closes while the page is open
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const convs = useQuery({
    queryKey: ["conversations", "inbox", view, q, limit],
    queryFn: () => listConversations({ q, view, limit }),
    refetchInterval: 20_000, // live updates push changes; this is the fallback
    placeholderData: (prev) => prev,
  });
  const list = convs.data ?? [];
  const fresh = selectedId ? list.find((c) => c.id === selectedId) : undefined;
  const active = fresh ?? (pinned?.id === selectedId ? pinned : undefined);
  const notInView = !!active && !fresh;

  // first open: the newest chat. Keep the open chat's latest data while it is in the list.
  // (state adjusted while rendering, React's pattern for state derived from new data)
  if (!selectedId && list.length) setSelectedId(list[0].id);
  if (fresh && fresh !== pinned) setPinned(fresh);

  const msgs = useQuery({
    queryKey: ["messages", active?.id],
    queryFn: () => listMessages(active!.id),
    enabled: !!active?.id,
    refetchInterval: 15_000, // live updates push changes; this is the fallback
  });
  const latest = msgs.data ?? [];
  const olderRows = older.id === active?.id ? older.rows : [];
  const shown = [...olderRows, ...latest.filter((m) => !olderRows.some((o) => o.id === m.id))];
  const mayHaveOlder =
    !!active && (older.id === active.id ? !older.done : latest.length >= MESSAGE_PAGE);

  useEffect(() => {
    stickToBottom.current = true;
  }, [active?.id]);
  useEffect(() => {
    const el = msgsRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [latest.length, active?.id]);

  const loadOlder = useMutation({
    mutationFn: async () => {
      const first = shown[0]?.created_on;
      const rows = await listMessages(active!.id, first);
      return { id: active!.id, rows };
    },
    onSuccess: ({ id, rows }) => {
      const el = msgsRef.current;
      const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
      stickToBottom.current = false;
      setOlder((o) => ({
        id,
        rows: [...rows, ...(o.id === id ? o.rows : [])],
        done: rows.length < MESSAGE_PAGE,
      }));
      // keep the message the reader was looking at in place
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    },
    onError: (e: Error) => message.error(e.message),
  });

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
    onSuccess: async (_r, v) => {
      setDrafts((d) => ({ ...d, [v.id]: "" }));
      stickToBottom.current = true;
      await refresh();
    },
    onError,
  });

  const pick = (id: string) => {
    setSelectedId(id);
    setHandBackNote(null);
  };
  const changeView = (v: View) => {
    setView(v);
    setLimit(PAGE);
    setSelectedId(null); // open the newest chat of that tab
  };
  const search = (text: string) => {
    setLimit(PAGE);
    setSelectedId(null);
    setParams(text.trim() ? { q: text.trim() } : {});
  };

  const withPerson = active?.state === "pause" || active?.state === "escalated";
  const optedOut = active?.state === "opted_out";
  const open = active ? inWindow(active, now) : false;
  const draft = active ? (drafts[active.id] ?? "") : "";
  const setDraft = (text: string) => active && setDrafts((d) => ({ ...d, [active.id]: text }));
  const send = () => active && draft.trim() && reply.mutate({ id: active.id, body: draft.trim() });

  const composer = (
    <div className="composer">
      <textarea
        className="input"
        placeholder={`Reply to ${nameOf(active)} as the Oxxy team`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="btn pri" disabled={!draft.trim() || reply.isPending} onClick={send}>
        Send
      </button>
    </div>
  );

  return (
    <>
      <div className="row">
        <Tabs<View>
          value={view}
          onChange={changeView}
          items={[
            ["all", "All"],
            ["person", "Needs a person"],
            ["booking", "Booking in progress"],
            ["opted", "Opted out"],
          ]}
        />
        <span className="spacer" />
        <input
          key={q}
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Search name or number, press Enter"
          defaultValue={q}
          aria-label="Search conversations"
          onKeyDown={(e) => e.key === "Enter" && search((e.target as HTMLInputElement).value)}
        />
        {q && (
          <button className="btn sm" onClick={() => search("")}>
            Clear
          </button>
        )}
      </div>
      <ErrorNote error={convs.error} />
      <div className="panel inbox">
        <div className="ilist">
          {convs.isLoading && <Empty>Loading…</Empty>}
          {!convs.isLoading && !list.length && (
            <Empty>
              {q ? `No conversation matches “${q}”.` : "No conversations in this view."}
            </Empty>
          )}
          {list.map((c) => (
            <div
              key={c.id}
              className={`iitem ${c.id === active?.id ? "on" : ""}`}
              onClick={() => pick(c.id)}
            >
              <div className="avatar">{initials(nameOf(c))}</div>
              <div className="t">
                <b>
                  <span>{nameOf(c)}</span>
                  <span className="muted small mono" style={{ fontWeight: 400 }}>
                    {fmtTime(c.last_message?.created_on ?? c.last_customer_message_at)}
                  </span>
                </b>
                <p
                  className="small"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {c.last_message ? (
                    <>
                      <span className="muted">{whoSent(c.last_message)}</span>
                      {c.last_message.text || "—"}
                    </>
                  ) : (
                    <span className="mono">{c.customer?.wa_number}</span>
                  )}
                </p>
                <div className="row" style={{ gap: 6 }}>
                  <StatePill state={c.state} />
                  {!!c.waiting && <Pill tone="info">{c.waiting} waiting</Pill>}
                </div>
              </div>
            </div>
          ))}
          {list.length >= limit && (
            <div style={{ padding: 12, textAlign: "center" }}>
              <button
                className="btn sm"
                disabled={convs.isFetching}
                onClick={() => setLimit((l) => Math.min(300, l + PAGE))}
              >
                {limit >= 300 ? "Showing the newest 300: search to find older chats" : "Load more"}
              </button>
            </div>
          )}
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
              {notInView && (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  This chat is no longer in this tab (its state changed). It stays open until you
                  pick another one.
                </div>
              )}
              {handBackNote !== null && (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  <div style={{ marginBottom: 6 }}>
                    Note for the bot (optional): what was agreed, or what it should not bring up
                    again. The customer never sees it.
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
              <div
                className="msgs"
                ref={msgsRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                }}
              >
                {mayHaveOlder && (
                  <div className="sys">
                    <button
                      className="btn sm"
                      disabled={loadOlder.isPending}
                      onClick={() => loadOlder.mutate()}
                    >
                      {loadOlder.isPending ? "Loading…" : "Load older messages"}
                    </button>
                  </div>
                )}
                {shown.map((m) => (
                  <div key={m.id} className={`bub ${m.direction === "in" ? "" : "out"}`}>
                    {(m.direction === "in" && m.body && TAP_LABELS[m.body.trim()]) ||
                      m.body ||
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
                {!msgs.isLoading && !shown.length && <div className="sys">No messages yet.</div>}
              </div>
              {active.state === "pause" && (
                <div
                  className="panel-b small"
                  style={{ background: "var(--crit-soft)", color: "var(--crit)" }}
                >
                  Automation is paused (safety or privacy). Reply manually only after checking on
                  the customer.
                </div>
              )}
              {!canReply ? (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  Your role can read chats but not reply.
                </div>
              ) : optedOut && !active.open_booking ? (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  Customer opted out and has no open booking request: messages are blocked.
                </div>
              ) : !open ? (
                <div className="panel-b small" style={{ background: "var(--sunk)" }}>
                  The 24-hour reply window is closed. Only approved templates can be sent now.
                </div>
              ) : optedOut ? (
                <>
                  <div
                    className="panel-b small"
                    style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
                  >
                    Customer opted out. Reply only about the open booking request.
                  </div>
                  {composer}
                </>
              ) : (
                composer
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
                  <dd>
                    {open ? (
                      <>
                        <Pill tone="ok">Open</Pill>
                        <div className="small muted">
                          until{" "}
                          {fmtTime(
                            new Date(
                              new Date(active.last_customer_message_at!).getTime() + DAY,
                            ).toISOString(),
                          )}
                        </div>
                      </>
                    ) : (
                      <Pill>Closed</Pill>
                    )}
                  </dd>
                </dl>
              </div>
              <div>
                <div className="eyebrow">Rules for this chat</div>
                <div style={{ marginTop: 8 }}>
                  {[
                    "One product per customer",
                    "Bookings stay pending until the sales team confirms",
                    "Never call Oxxy insurance",
                    "STOP ends every automated message",
                  ].map((t) => (
                    <div key={t} className="check">
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
      {recordFor && (
        <CustomerRecordDrawer customerId={recordFor} onClose={() => setRecordFor(null)} />
      )}
    </>
  );
}
