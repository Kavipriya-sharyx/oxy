import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App } from "antd";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversationCounts,
  handBackConversation,
  restartConversation,
  listConversations,
  listMessages,
  MESSAGE_PAGE,
  replyToConversation,
  takeOverConversation,
  type InboxCounts,
} from "../api/conversations.api";
import { getCustomerRecord } from "../api/insights.api";
import type { Conversation, Message } from "../types";
import { usePermissions } from "../hooks/usePermissions";
import CustomerRecordDrawer from "../components/CustomerRecordDrawer";
import {
  BOOKING_TONE,
  Empty,
  ErrorNote,
  fmtTime,
  initials,
  Pill,
  StatePill,
  usePageTitle,
} from "../components/ui";

type View = "all" | "waiting" | "person" | "mine" | "booking" | "window" | "opted";
const VIEWS: [View, string][] = [
  ["all", "All"],
  ["waiting", "Waiting"],
  ["person", "Person"],
  ["mine", "Mine"],
  ["booking", "Booking"],
  ["window", "24h open"],
  ["opted", "Opted out"],
];
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

// A tap on a list row or button arrives as the row id: show what the customer actually tapped
const TAP_LABELS: Record<string, string> = {
  menu_need: "Reduce a medical bill",
  menu_centre: "Find or book a centre",
  menu_explain: "Understand Oxxy",
  menu_service: "Existing customer help",
  lead_yes: "Yes, please",
  lead_details: "Just send details",
  lead_not_now: "Not now",
};

// the parts of the customer record the side panel shows
interface RecBooking {
  booking_request_id: string;
  centre: string | null;
  branch: string | null;
  specialisation: string | null;
  preferred_date: string;
  preferred_time: string | null;
  status: string;
}
interface RecActivation {
  activation_id: string;
  product: string;
  plan: string | null;
  billing: string | null;
  price: number | null;
  payment_status: string | null;
}

// ---- small helpers ----

const AVATAR_TONES = 6;
function avatarTone(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % AVATAR_TONES;
}

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
/** "14:05" today, "Yesterday", "Mon" this week, else "12 Nov" */
function shortTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date(now);
  if (ymd(d) === ymd(today))
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (ymd(d) === ymd(new Date(now - DAY))) return "Yesterday";
  if (now - d.getTime() < 6 * DAY) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function dayLabel(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (ymd(d) === ymd(new Date(now))) return "Today";
  if (ymd(d) === ymd(new Date(now - DAY))) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
const clock = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";
function left(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Text with its links clickable and the find-in-chat term highlighted */
function RichText({ text, find }: { text: string; find: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  const mark = (s: string, k: string): ReactNode => {
    if (!find) return s;
    const low = s.toLowerCase();
    const out: ReactNode[] = [];
    let i = 0;
    let at = low.indexOf(find);
    while (at >= 0) {
      out.push(s.slice(i, at), <mark key={`${k}-${at}`}>{s.slice(at, at + find.length)}</mark>);
      i = at + find.length;
      at = low.indexOf(find, i);
    }
    out.push(s.slice(i));
    return out;
  };
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener">
            {mark(p, String(i))}
          </a>
        ) : (
          <Fragment key={i}>{mark(p, String(i))}</Fragment>
        ),
      )}
    </>
  );
}

// messages WhatsApp did not (or may not have) delivered: the reason shows under the bubble
const NOT_DELIVERED = new Set(["failed", "uncertain", "frequency_cap"]);
function failureText(m: Message): string {
  if (m.error_reason) return m.error_reason;
  if (m.message_status === "frequency_cap")
    return "Meta held back this marketing message to protect the customer's experience (marketing limit). Try again later.";
  if (m.message_status === "uncertain")
    return "WhatsApp did not answer in time, so it was not sent again. It may or may not have reached the customer.";
  return "WhatsApp did not say why (this message failed before reasons were recorded). Check the number and the 24-hour window, then try again.";
}

/** WhatsApp delivery state of a message we sent */
function Ticks({ status }: { status: string }) {
  if (status === "failed")
    return (
      <span className="tick fail" title="Not delivered">
        ⚠ failed
      </span>
    );
  if (status === "frequency_cap")
    return (
      <span className="tick fail" title="Held back by WhatsApp (marketing limit)">
        ⚠ held back
      </span>
    );
  if (status === "uncertain")
    return (
      <span
        className="tick fail"
        title="WhatsApp did not answer in time. It may or may not have reached the customer, so it was not sent again."
      >
        ⚠ not confirmed
      </span>
    );
  if (status === "read")
    return (
      <span className="tick read" title="Read">
        ✓✓
      </span>
    );
  if (status === "delivered")
    return (
      <span className="tick" title="Delivered">
        ✓✓
      </span>
    );
  if (status === "sent")
    return (
      <span className="tick" title="Sent">
        ✓
      </span>
    );
  return (
    <span className="tick" title={status}>
      ⏱
    </span>
  );
}

// Saved replies (this browser): {name} becomes the customer's first name
const QR_KEY = "oxxy.quickReplies";
const QR_DEFAULT = [
  "Hi {name}, this is the Oxxy team. How can I help you today?",
  "Thank you for waiting, {name}. I am checking this for you now.",
  "Your booking request is pending confirmation. Our team will update you here.",
  "Could you share a convenient time for a short call?",
];
function loadReplies(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(QR_KEY) || "null");
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : QR_DEFAULT;
  } catch {
    return QR_DEFAULT;
  }
}
function saveReplies(v: string[]) {
  try {
    localStorage.setItem(QR_KEY, JSON.stringify(v));
  } catch {
    /* private window: kept for this visit only */
  }
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

// ---- the page ----

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
  const [searchText, setSearchText] = useState(q);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [findAt, setFindAt] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [seen, setSeen] = useState<{ id: string; n: number }>({ id: "", n: 0 });
  const [qrOpen, setQrOpen] = useState(false);
  const [replies, setReplies] = useState<string[]>(loadReplies);
  const [handBackNote, setHandBackNote] = useState<string | null>(null); // null = the note box is closed
  // "Restart chat" options; null = the box is closed
  const [restartBox, setRestartBox] = useState<{ forget: boolean; consent: boolean } | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  // the 24-hour window closes while the page is open
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // search as you type (after a short pause)
  useEffect(() => {
    if (searchText.trim() === q) return;
    const t = setTimeout(() => {
      setLimit(PAGE);
      setSelectedId(null);
      setParams(searchText.trim() ? { q: searchText.trim() } : {});
    }, 350);
    return () => clearTimeout(t);
  }, [searchText, q, setParams]);

  const convs = useQuery({
    queryKey: ["conversations", "inbox", view, q, limit],
    queryFn: () => listConversations({ q, view, limit }),
    refetchInterval: 20_000, // live updates push changes; this is the fallback
    placeholderData: (prev) => prev,
  });
  const counts = useQuery({
    queryKey: ["conversations", "counts"],
    queryFn: getConversationCounts,
    refetchInterval: 30_000,
  });
  const list = useMemo(() => convs.data ?? [], [convs.data]);
  const fresh = selectedId ? list.find((c) => c.id === selectedId) : undefined;
  const active = fresh ?? (pinned?.id === selectedId ? pinned : undefined);
  const notInView = !!active && !fresh;

  // first open: the newest chat. Keep the open chat's latest data while it is in the list.
  // (state adjusted while rendering, React's pattern for state derived from new data)
  if (!selectedId && list.length && !convs.isPlaceholderData) setSelectedId(list[0].id);
  if (fresh && fresh !== pinned) setPinned(fresh);

  const msgs = useQuery({
    queryKey: ["messages", active?.id],
    queryFn: () => listMessages(active!.id),
    enabled: !!active?.id,
    refetchInterval: 15_000, // live updates push changes; this is the fallback
  });
  const record = useQuery({
    queryKey: ["customerRecord", active?.customer_id],
    queryFn: () => getCustomerRecord(active!.customer_id),
    enabled: !!active?.customer_id,
    staleTime: 30_000,
  });
  const latest = msgs.data ?? [];
  const olderRows = older.id === active?.id ? older.rows : [];
  const shown = [...olderRows, ...latest.filter((m) => !olderRows.some((o) => o.id === m.id))];
  const mayHaveOlder =
    !!active && (older.id === active.id ? !older.done : latest.length >= MESSAGE_PAGE);

  const findTerm = findOpen ? find.trim().toLowerCase() : "";
  const hits = findTerm
    ? shown.filter((m) => (m.body ?? "").toLowerCase().includes(findTerm)).map((m) => m.id)
    : [];
  const hitIndex = hits.length ? Math.min(findAt, hits.length - 1) : -1;
  const hitId = hitIndex >= 0 ? hits[hitIndex] : null;
  const unseen = atBottom || seen.id !== active?.id ? 0 : Math.max(0, shown.length - seen.n);

  useEffect(() => {
    stickToBottom.current = true;
  }, [active?.id]);
  useEffect(() => {
    const el = msgsRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [latest.length, active?.id]);
  // the current find hit in view (only when the hit changes, not on every refresh)
  useEffect(() => {
    if (!hitId) return;
    const el = msgsRef.current?.querySelector(`[data-mid="${hitId}"]`);
    if (el) {
      stickToBottom.current = false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [hitId]);

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
  const takeOver = useMutation({
    mutationFn: takeOverConversation,
    onSuccess: async () => {
      message.success("You are replying now. The bot is paused for this chat.");
      await refresh();
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    onError,
  });
  const restart = useMutation({
    mutationFn: (v: { id: string; forget: boolean; consent: boolean }) =>
      restartConversation(v.id, { forget_earlier: v.forget, ask_consent_again: v.consent }),
    onSuccess: async (r) => {
      setRestartBox(null);
      message.success("Chat restarted. The bot greets the customer as new on their next message.");
      setSelectedId(r.conversation_id);
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
    setRestartBox(null);
    setFindOpen(false);
    setFind("");
    setQrOpen(false);
    setAtBottom(true);
  };
  const changeView = (v: View) => {
    setView(v);
    setLimit(PAGE);
    setSelectedId(null); // open the newest chat of that tab
  };

  // keyboard: "/" search, Alt+↓ / Alt+↑ (or j / k) next / previous chat, Ctrl+F find in chat, Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      if (e.key === "Escape") {
        setFindOpen(false);
        setQrOpen(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && selectedId) {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      const step =
        (e.altKey && e.key === "ArrowDown") || (!typing && e.key === "j")
          ? 1
          : (e.altKey && e.key === "ArrowUp") || (!typing && e.key === "k")
            ? -1
            : 0;
      if (step && list.length) {
        e.preventDefault();
        const i = list.findIndex((c) => c.id === selectedId);
        const next = list[Math.min(list.length - 1, Math.max(0, i + step))];
        if (next) {
          setSelectedId(next.id);
          setHandBackNote(null);
          setFindOpen(false);
          setAtBottom(true);
        }
        return;
      }
      if (!typing && e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, selectedId]);

  const withPerson = active?.state === "pause" || active?.state === "escalated";
  const optedOut = active?.state === "opted_out";
  const open = active ? inWindow(active, now) : false;
  const windowLeft =
    active?.last_customer_message_at && open
      ? new Date(active.last_customer_message_at).getTime() + DAY - now
      : 0;
  const draft = active ? (drafts[active.id] ?? "") : "";
  const setDraft = (text: string) => active && setDrafts((d) => ({ ...d, [active.id]: text }));
  const send = () => active && draft.trim() && reply.mutate({ id: active.id, body: draft.trim() });
  const firstName = active?.customer?.first_name || "there";
  const pickReply = (t: string) => {
    setDraft(t.replace(/\{name\}/g, firstName));
    setQrOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const setAndSaveReplies = (v: string[]) => {
    setReplies(v);
    saveReplies(v);
  };
  const jumpToLatest = () => {
    const el = msgsRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickToBottom.current = true;
  };
  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(active?.customer?.wa_number ?? "");
      message.success("Number copied");
    } catch {
      message.info(active?.customer?.wa_number ?? "");
    }
  };

  const composer = (
    <div className="composer2">
      {qrOpen && (
        <div className="qr-pop" role="dialog" aria-label="Saved replies">
          <div className="qr-h">
            <b>Saved replies</b>
            <span className="muted small">{"{name}"} = first name · this browser only</span>
          </div>
          {replies.map((t, i) => (
            <div key={i} className="qr-item">
              <button className="qr-use" onClick={() => pickReply(t)}>
                {t}
              </button>
              <button
                className="qr-x"
                aria-label="Remove this saved reply"
                onClick={() => setAndSaveReplies(replies.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          {!replies.length && <div className="small muted qr-item">No saved replies.</div>}
          <div className="qr-f">
            <button
              className="btn sm"
              disabled={!draft.trim() || replies.includes(draft.trim())}
              onClick={() => setAndSaveReplies([...replies, draft.trim()])}
            >
              Save the text below as a reply
            </button>
            <button className="btn sm ghost" onClick={() => setAndSaveReplies(QR_DEFAULT)}>
              Reset
            </button>
          </div>
        </div>
      )}
      <div className="composer2-row">
        <button
          className={`btn sm icon ${qrOpen ? "on" : ""}`}
          title="Saved replies"
          aria-label="Saved replies"
          onClick={() => setQrOpen((v) => !v)}
        >
          ⚡
        </button>
        <textarea
          ref={composerRef}
          className="input"
          rows={1}
          placeholder={`Reply to ${nameOf(active)}`}
          value={draft}
          maxLength={4096}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="btn pri send"
          disabled={!draft.trim() || reply.isPending}
          onClick={send}
          aria-label="Send"
        >
          {reply.isPending ? "Sending…" : "Send ➤"}
        </button>
      </div>
      <div className="composer2-hint small muted">
        <span>Enter to send · Shift+Enter new line</span>
        <span className="mono">{draft.length ? `${draft.length}/4096` : ""}</span>
      </div>
    </div>
  );

  const c = (counts.data ?? {}) as Partial<InboxCounts>;
  const rec = (record.data ?? {}) as {
    need?: Record<string, unknown>;
    location?: Record<string, unknown>;
    booking?: RecBooking[];
    activation?: RecActivation[];
  };
  const needRec = (rec.need ?? {}) as Record<string, unknown>;
  const locRec = (rec.location ?? {}) as Record<string, unknown>;
  const bookings = Array.isArray(rec.booking) ? rec.booking : [];
  const acts = Array.isArray(rec.activation) ? rec.activation : [];
  const facts: [string, unknown][] = [
    ["For", needRec.beneficiary],
    ["Need", needRec.healthcare_need],
    ["Specialisation", needRec.specialisation],
    ["Urgency", needRec.urgency],
    ["Area", [locRec.locality, locRec.city].filter(Boolean).join(", ")],
  ];
  const knownFacts = facts.filter(([, v]) => v !== null && v !== undefined && v !== "");

  // messages with day separators and same-sender grouping
  const rows: ReactNode[] = [];
  let lastDay = "";
  let prev: Message | null = null;
  let lastConv = "";
  for (const m of shown) {
    if (lastConv && m.conversation_id && m.conversation_id !== lastConv) {
      rows.push(
        <div key={`n-${m.id}`} className="newchat">
          <span>New chat started</span>
        </div>,
      );
      prev = null;
    }
    if (m.conversation_id) lastConv = m.conversation_id;
    const day = m.created_on ? ymd(new Date(m.created_on)) : "";
    if (day && day !== lastDay) {
      rows.push(
        <div key={`d-${day}`} className="daysep">
          <span>{dayLabel(m.created_on, now)}</span>
        </div>,
      );
      lastDay = day;
      prev = null;
    }
    const grouped =
      !!prev &&
      prev.direction === m.direction &&
      prev.sender === m.sender &&
      !!prev.created_on &&
      !!m.created_on &&
      new Date(m.created_on).getTime() - new Date(prev.created_on).getTime() < 5 * 60000;
    const tap = m.direction === "in" && m.body ? TAP_LABELS[m.body.trim()] : undefined;
    const who = m.direction === "in" ? null : m.sender === "agent" ? "Team" : "Bot";
    const isHit = hitIndex >= 0 && hits[hitIndex] === m.id;
    rows.push(
      <div
        key={m.id}
        data-mid={m.id}
        className={`bub2 ${m.direction === "in" ? "in" : "out"} ${m.sender === "agent" ? "agent" : ""} ${grouped ? "grouped" : ""} ${isHit ? "hit" : ""}`}
      >
        {!grouped && who && <div className={`who ${m.sender}`}>{who}</div>}
        {tap ? (
          <span className="tapchip">👆 Tapped: {tap}</span>
        ) : m.body ? (
          <RichText text={m.body} find={findTerm} />
        ) : m.template_name ? (
          <span className="tplchip">Template · {m.template_name}</span>
        ) : (
          <span className="muted">[Non-text message]</span>
        )}
        <div className="meta">
          {m.template_name && m.body && <span className="tplmini">template</span>}
          <span title={fmtTime(m.created_on)}>{clock(m.created_on)}</span>
          {m.direction === "out" && <Ticks status={m.message_status} />}
          {m.direction === "in" && m.message_status === "stale" && (
            <span
              className="latechip"
              title="Arrived late, after a newer message was answered. The bot did not reply to it; read it and reply yourself if needed."
            >
              not answered (late)
            </span>
          )}
        </div>
        {m.direction === "out" && NOT_DELIVERED.has(m.message_status) && (
          <div className={`failwhy ${m.message_status === "uncertain" ? "maybe" : ""}`}>
            <b>
              {m.message_status === "uncertain"
                ? "Delivery not confirmed"
                : m.message_status === "frequency_cap"
                  ? "Held back by WhatsApp"
                  : "Not delivered"}
            </b>
            <span>{failureText(m)}</span>
          </div>
        )}
      </div>,
    );
    prev = m;
  }

  return (
    <>
      <ErrorNote error={convs.error} />
      <div className="panel inbox2">
        {/* ---------- list ---------- */}
        <div className="ilist2">
          <div className="ilist2-h">
            <div className="isearch">
              <span aria-hidden>⌕</span>
              <input
                ref={searchRef}
                placeholder="Search name or number  ( / )"
                value={searchText}
                aria-label="Search conversations"
                onChange={(e) => setSearchText(e.target.value)}
              />
              {searchText && (
                <button aria-label="Clear search" onClick={() => setSearchText("")}>
                  ×
                </button>
              )}
            </div>
            <div className="ichips" role="tablist">
              {VIEWS.map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={view === k}
                  className={`ichip ${view === k ? "on" : ""} ${k === "waiting" && (c.waiting ?? 0) > 0 ? "hot" : ""}`}
                  onClick={() => changeView(k)}
                >
                  {label}
                  {c[k] !== undefined && <span className="n">{c[k]}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className={`ilist2-b ${convs.isPlaceholderData ? "loading" : ""}`}>
            {convs.isLoading && (
              <>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="iitem2 skel">
                    <div className="av" />
                    <div className="t">
                      <i />
                      <i />
                    </div>
                  </div>
                ))}
              </>
            )}
            {!convs.isLoading && !list.length && (
              <Empty>
                {q ? `No conversation matches “${q}”.` : "No conversations in this view."}
              </Empty>
            )}
            {list.map((cv) => {
              const person = cv.state === "pause" || cv.state === "escalated";
              const product = productOf(cv);
              return (
                <button
                  key={cv.id}
                  className={`iitem2 ${cv.id === active?.id ? "on" : ""} ${cv.waiting ? "unread" : ""}`}
                  onClick={() => pick(cv.id)}
                >
                  <div className={`av t${avatarTone(cv.customer_id)}`}>
                    {initials(nameOf(cv))}
                    <i
                      className={`st ${cv.state === "pause" ? "crit" : person ? "warn" : cv.state === "opted_out" ? "off" : "ok"}`}
                      title={
                        cv.state === "pause"
                          ? "Paused (safety)"
                          : person
                            ? "With a person"
                            : cv.state === "opted_out"
                              ? "Opted out"
                              : "Bot is handling"
                      }
                    />
                  </div>
                  <div className="t">
                    <div className="l1">
                      <b>{nameOf(cv)}</b>
                      <span className="time">
                        {shortTime(cv.last_message?.created_on ?? cv.last_customer_message_at, now)}
                      </span>
                    </div>
                    <div className="l2">
                      <span className="pv">
                        {cv.last_message ? (
                          <>
                            {cv.last_message.direction === "out" && (
                              <span className="pvwho">
                                {cv.last_message.sender === "agent" ? "Team: " : "Bot: "}
                              </span>
                            )}
                            {TAP_LABELS[cv.last_message.text?.trim()] ??
                              (cv.last_message.text || "—")}
                          </>
                        ) : (
                          <span className="mono">{cv.customer?.wa_number}</span>
                        )}
                      </span>
                      {!!cv.waiting && <span className="badge">{cv.waiting}</span>}
                    </div>
                    <div className="l3">
                      <StatePill state={cv.state} />
                      {product && <span className="tag">{product}</span>}
                      {cv.handled_by && <span className="tag who">👤 {cv.handled_by}</span>}
                      {cv.open_booking && <span className="tag">📅 Booking</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            {list.length >= limit && (
              <div style={{ padding: 12, textAlign: "center" }}>
                <button
                  className="btn sm"
                  disabled={convs.isFetching}
                  onClick={() => setLimit((l) => Math.min(300, l + PAGE))}
                >
                  {limit >= 300
                    ? "Showing the newest 300: search to find older chats"
                    : "Load more"}
                </button>
              </div>
            )}
          </div>
          <div className="ilist2-f small muted">
            <kbd>/</kbd> search · <kbd>j</kbd> <kbd>k</kbd> move · <kbd>Ctrl</kbd>+<kbd>F</kbd> find
          </div>
        </div>

        {/* ---------- thread ---------- */}
        <div className="thread2">
          {!active ? (
            <div className="thread2-empty">
              <div className="big">💬</div>
              <b>Select a conversation</b>
              <span className="muted small">Pick a chat on the left to read and reply.</span>
            </div>
          ) : (
            <>
              <div className="thread2-h">
                <div className={`av av-md t${avatarTone(active.customer_id)}`}>
                  {initials(nameOf(active))}
                </div>
                <div className="who">
                  <b>{nameOf(active)}</b>
                  <div className="small muted">
                    <span className="mono">{active.customer?.wa_number}</span>
                    <button className="linkbtn" onClick={copyNumber} title="Copy the number">
                      copy
                    </button>
                  </div>
                </div>
                {open ? (
                  <span
                    className={`wchip ${windowLeft < 2 * 3600000 ? "warn" : "ok"}`}
                    title="Free-form replies are allowed for 24 hours after the customer's last message"
                  >
                    ⏱ {left(windowLeft)} left
                  </span>
                ) : (
                  <span className="wchip off" title="Only approved templates can be sent now">
                    Window closed
                  </span>
                )}
                <button
                  className={`btn sm icon ${findOpen ? "on" : ""}`}
                  title="Find in this chat (Ctrl+F)"
                  aria-label="Find in this chat"
                  onClick={() => setFindOpen((v) => !v)}
                >
                  ⌕
                </button>
                <button
                  className="btn sm"
                  title="The customer's full record"
                  onClick={() => setRecordFor(active.customer_id)}
                >
                  Record
                </button>
                {canReply && !optedOut && active.state !== "pause" && (
                  <button
                    className={`btn sm icon ${restartBox ? "on" : ""}`}
                    title="Restart chat: the bot starts again from the welcome"
                    aria-label="Restart chat"
                    disabled={restart.isPending}
                    onClick={() =>
                      setRestartBox(restartBox ? null : { forget: true, consent: false })
                    }
                  >
                    ↻
                  </button>
                )}
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
                      className="btn sm pri"
                      disabled={takeOver.isPending}
                      onClick={() => takeOver.mutate(active.id)}
                    >
                      Take over
                    </button>
                  ))}
              </div>

              {findOpen && (
                <div className="findbar">
                  <input
                    autoFocus
                    className="input"
                    placeholder="Find in this chat"
                    value={find}
                    onChange={(e) => {
                      setFind(e.target.value);
                      setFindAt(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && hits.length)
                        setFindAt((i) =>
                          e.shiftKey ? (i - 1 + hits.length) % hits.length : (i + 1) % hits.length,
                        );
                    }}
                  />
                  <span className="small muted mono">
                    {findTerm
                      ? hits.length
                        ? `${hitIndex + 1} of ${hits.length}`
                        : "No match"
                      : ""}
                  </span>
                  <button
                    className="btn sm"
                    disabled={!hits.length}
                    onClick={() => setFindAt((i) => (i - 1 + hits.length) % hits.length)}
                    aria-label="Previous match"
                  >
                    ↑
                  </button>
                  <button
                    className="btn sm"
                    disabled={!hits.length}
                    onClick={() => setFindAt((i) => (i + 1) % hits.length)}
                    aria-label="Next match"
                  >
                    ↓
                  </button>
                  <button className="btn sm ghost" onClick={() => setFindOpen(false)}>
                    Close
                  </button>
                </div>
              )}

              {/* who is answering, and what the bot waits for */}
              <div
                className={`botbar ${active.state === "pause" ? "crit" : withPerson ? "warn" : optedOut ? "off" : "ok"}`}
              >
                {active.state === "pause" ? (
                  <>
                    ⛔ Automation is paused (safety or privacy). Reply only after checking on the
                    customer.
                  </>
                ) : withPerson ? (
                  <>
                    👤{" "}
                    {active.handled_by
                      ? `${active.handled_by} has this chat`
                      : "A person handles this chat"}
                    {" · the bot is quiet until it is handed back"}
                  </>
                ) : optedOut ? (
                  <>🚫 The customer opted out. Automated messages are stopped.</>
                ) : (
                  <>
                    🤖 The bot is handling this chat
                    {active.pending_step && (
                      <>
                        {" · waiting for: "}
                        <b>{active.pending_step}</b>
                      </>
                    )}
                  </>
                )}
              </div>

              {notInView && (
                <div className="notice small">
                  This chat is no longer in this tab (its state changed). It stays open until you
                  pick another one.
                </div>
              )}
              {restartBox && (
                <div className="notice small">
                  <div style={{ marginBottom: 6 }}>
                    <b>Restart this chat?</b> The bot starts again from the welcome message, as for
                    a new customer. Messages so far stay here; scheduled messages are cancelled. A
                    booking request already made is kept.
                  </div>
                  <label className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={restartBox.forget}
                      onChange={(e) => setRestartBox({ ...restartBox, forget: e.target.checked })}
                    />
                    Forget what they told the bot (need, city, spend, plan, age)
                  </label>
                  <label className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={restartBox.consent}
                      onChange={(e) => setRestartBox({ ...restartBox, consent: e.target.checked })}
                    />
                    Ask the health-data consent again
                  </label>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button
                      className="btn sm pri"
                      disabled={restart.isPending}
                      onClick={() => restart.mutate({ id: active.id, ...restartBox })}
                    >
                      {restart.isPending ? "Restarting…" : "Restart chat"}
                    </button>
                    <button className="btn sm" onClick={() => setRestartBox(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {handBackNote !== null && (
                <div className="notice small">
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
                      className="btn sm pri"
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

              <div className="msgs2-wrap">
                <div
                  className="msgs2"
                  ref={msgsRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                    stickToBottom.current = bottom;
                    if (bottom !== atBottom) setAtBottom(bottom);
                    if (bottom && active && (seen.id !== active.id || seen.n !== shown.length))
                      setSeen({ id: active.id, n: shown.length });
                    if (!bottom && seen.id !== active.id)
                      setSeen({ id: active.id, n: shown.length });
                  }}
                >
                  {mayHaveOlder && (
                    <div className="daysep">
                      <button
                        className="btn sm"
                        disabled={loadOlder.isPending}
                        onClick={() => loadOlder.mutate()}
                      >
                        {loadOlder.isPending ? "Loading…" : "Load older messages"}
                      </button>
                    </div>
                  )}
                  {msgs.isLoading && (
                    <div className="daysep">
                      <span>Loading messages…</span>
                    </div>
                  )}
                  {rows}
                  {!msgs.isLoading && !shown.length && (
                    <div className="daysep">
                      <span>No messages yet.</span>
                    </div>
                  )}
                </div>
                {!atBottom && (
                  <button
                    className="jump"
                    onClick={jumpToLatest}
                    aria-label="Jump to the latest message"
                  >
                    {unseen ? <span className="badge">{unseen}</span> : null}↓
                  </button>
                )}
              </div>

              {!canReply ? (
                <div className="notice small">Your role can read chats but not reply.</div>
              ) : optedOut && !active.open_booking ? (
                <div className="notice small">
                  Customer opted out and has no open booking request: messages are blocked.
                </div>
              ) : !open ? (
                <div className="notice small">
                  The 24-hour reply window is closed. Only approved templates can be sent now.
                </div>
              ) : optedOut ? (
                <>
                  <div className="notice small warn">
                    Customer opted out. Reply only about the open booking request.
                  </div>
                  {composer}
                </>
              ) : (
                <>
                  {!withPerson && (
                    <div className="notice small subtle">
                      The bot is answering. Sending a message takes the chat over: the bot pauses
                      until you hand it back.
                    </div>
                  )}
                  {composer}
                </>
              )}
            </>
          )}
        </div>

        {/* ---------- customer ---------- */}
        <aside className="side2">
          {active && (
            <>
              <div className="card2 center">
                <div className={`av av-xl t${avatarTone(active.customer_id)}`}>
                  {initials(nameOf(active))}
                </div>
                <b className="nm">{nameOf(active)}</b>
                <span className="mono small muted">{active.customer?.wa_number}</span>
                <div className="row" style={{ gap: 6, justifyContent: "center", marginTop: 6 }}>
                  {productOf(active) ? (
                    <Pill tone="acc">{productOf(active)}</Pill>
                  ) : (
                    <Pill>No product yet</Pill>
                  )}
                  {active.customer?.language && <Pill dot={false}>{active.customer.language}</Pill>}
                </div>
              </div>

              <div className="card2">
                <div className="eyebrow">24-hour window</div>
                {open ? (
                  <>
                    <div className="wbar">
                      <i style={{ width: `${Math.max(2, (windowLeft / DAY) * 100)}%` }} />
                    </div>
                    <div className="small muted">
                      Open, {left(windowLeft)} left (until{" "}
                      {fmtTime(
                        new Date(
                          new Date(active.last_customer_message_at!).getTime() + DAY,
                        ).toISOString(),
                      )}
                      )
                    </div>
                  </>
                ) : (
                  <div className="small muted">Closed: only approved templates can be sent.</div>
                )}
              </div>

              <div className="card2">
                <div className="eyebrow">What we know</div>
                {record.isLoading ? (
                  <div className="small muted">Loading…</div>
                ) : knownFacts.length ? (
                  <dl className="kv" style={{ marginTop: 8 }}>
                    {knownFacts.map(([k, v]) => (
                      <Fragment key={k}>
                        <dt>{k}</dt>
                        <dd>{String(v)}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : (
                  <div className="small muted">Nothing collected yet.</div>
                )}
                <dl className="kv" style={{ marginTop: 6 }}>
                  <dt>Age</dt>
                  <dd>{active.customer?.age ?? "—"}</dd>
                  <dt>CRM id</dt>
                  <dd className="mono">
                    {active.customer?.crm_customer_id ?? <span className="muted">Not linked</span>}
                  </dd>
                </dl>
              </div>

              <div className="card2">
                <div className="eyebrow">Bookings</div>
                {bookings.length ? (
                  bookings.slice(0, 4).map((b) => {
                    const [label, tone] = BOOKING_TONE[b.status] ?? [String(b.status), "plain"];
                    return (
                      <div key={b.booking_request_id} className="mini">
                        <div>
                          <b>{[b.centre, b.branch].filter(Boolean).join(", ") || "Centre"}</b>
                          <div className="small muted">
                            {b.preferred_date}
                            {b.preferred_time ? ` · ${b.preferred_time}` : ""}
                            {b.specialisation ? ` · ${b.specialisation}` : ""}
                          </div>
                        </div>
                        <Pill tone={tone}>{label}</Pill>
                      </div>
                    );
                  })
                ) : (
                  <div className="small muted">No booking requests.</div>
                )}
              </div>

              <div className="card2">
                <div className="eyebrow">Activation</div>
                {acts.length ? (
                  acts.slice(0, 3).map((a) => (
                    <div key={a.activation_id} className="mini">
                      <div>
                        <b>
                          {a.product === "cut_medi_bills" ? "Cut Medi Bills" : "Oxxy"}
                          {a.plan ? ` · ${a.plan}` : ""}
                        </b>
                        <div className="small muted">
                          {a.billing ?? ""}
                          {a.price != null ? ` · ₹${Number(a.price).toLocaleString("en-IN")}` : ""}
                        </div>
                      </div>
                      <Pill
                        tone={
                          a.payment_status === "paid"
                            ? "ok"
                            : a.payment_status === "failed"
                              ? "crit"
                              : "warn"
                        }
                      >
                        {String(a.payment_status ?? "—")}
                      </Pill>
                    </div>
                  ))
                ) : (
                  <div className="small muted">No activation yet.</div>
                )}
                <button
                  className="btn sm"
                  style={{ marginTop: 10, width: "100%" }}
                  onClick={() => setRecordFor(active.customer_id)}
                >
                  Open the full record
                </button>
              </div>

              <details className="card2">
                <summary className="eyebrow">Rules for this chat</summary>
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
              </details>
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
