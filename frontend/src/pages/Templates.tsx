import { useState, useMemo } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTemplates,
  syncTemplates,
  TEMPLATE_STATUSES,
  updateTemplate,
  type TemplateRow,
} from "../api/ops.api";
import { usePermissions } from "../hooks/usePermissions";
import { Drawer, Empty, ErrorNote, fmtTime, Icon, Panel, Pill, type Tone, usePageTitle } from "../components/ui";

const TONE: Record<string, Tone> = {
  approved: "ok",
  submitted: "info",
  draft: "plain",
  rejected: "crit",
  paused: "warn",
  disabled: "crit",
};

interface TemplateMetaInfo {
  body: string;
  examples?: string[];
  footer?: string;
  quickReplies?: string[];
  purposeSnippet?: string;
}

const TEMPLATE_PREVIEWS: Record<string, TemplateMetaInfo> = {
  lead_intro: {
    body: "Hello {{1}} ji, I am Asha, Oxxy Health's automated assistant. You recently showed interest in saving on healthcare expenses. May I ask one quick question to understand what you need?",
    examples: ["Priya"],
    footer: "Reply STOP to opt out",
    quickReplies: ["Yes, please", "Just send details", "Not now"],
    purposeSnippet: "Playbook 4.1: Consented outbound lead initial outreach",
  },
  booking_confirmed: {
    body: "Good news: your booking request at {{1}} for {{2}} has been confirmed by the Oxxy team. Please carry a photo ID. If you need to change it, reply here.",
    examples: ["KMCH Hospital, Citra", "tomorrow, 10:00 AM"],
    purposeSnippet: "Triggered when sales team confirms the appointment slot",
  },
  booking_rescheduled: {
    body: "Your booking request at {{1}} has been moved to {{2}}. The Oxxy team will contact you if anything else changes. Reply here if the new date does not suit you.",
    examples: ["PSG Hospital, Peelamedu", "20 Nov 2026, 2:30 PM"],
    purposeSnippet: "Triggered when a booking is shifted to a new slot",
  },
  booking_cancelled: {
    body: "Your booking request at {{1}} for {{2}} could not go ahead. Would you like me to suggest another verified centre near you?",
    examples: ["PSG Hospital", "19 Nov 2026"],
    quickReplies: ["Yes", "No"],
    purposeSnippet: "Booking cancelled: offers another verified centre once",
  },
  booking_cancelled_info: {
    body: "Your booking request at {{1}} for {{2}} could not go ahead. If you would like help with another request, just reply here.",
    examples: ["City Care Hospital", "19 Nov 2026"],
    purposeSnippet: "Informs about a cancellation without an immediate rebooking offer",
  },
  activation_confirmed: {
    body: "Thank you. Your payment for {{1}} has been verified. The Oxxy team will guide you regarding activation status and the next service step.",
    examples: ["Oxxy Vital Plan"],
    purposeSnippet: "Sent after payment verification to confirm healthcare membership",
  },
  activation_reminder: {
    body: "Would you like help understanding the plan, completing the official activation, or pausing for now?",
    examples: [],
    purposeSnippet: "Trigger Q: Follow-up reminder if membership payment is pending",
  },
  agreed_follow_up: {
    body: "Hello {{1}} ji. As agreed, I am following up about {{2}} and {{3}}. Would you like to continue with the booking request, activation or a question?",
    examples: ["Priya", "your healthcare checkup", "Oxxy"],
    purposeSnippet: "Trigger N: Automated follow-up at the time agreed with patient",
  },
  conversation_rescue_1: {
    body: "Just checking whether you would like a short answer or prefer to continue later.",
    examples: [],
    footer: "Reply STOP to opt out",
    purposeSnippet: "Playbook 15: First gentle check-in after customer inactivity",
  },
  conversation_rescue_2: {
    body: "I will pause here so I do not disturb you. You can message Oxxy whenever convenient.",
    examples: [],
    footer: "Reply STOP to opt out",
    purposeSnippet: "Playbook 15: Final check-in and conversation auto-pause",
  },
};

function formatPreviewBody(body: string, examples?: string[], useSample = false): React.ReactNode {
  if (!body) return null;
  const parts = body.split(/(\{\{\d+\}\})/g);
  return parts.map((part, i) => {
    const match = part.match(/^\{\{(\d+)\}\}$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      const exampleVal = examples && examples[idx] ? examples[idx] : null;
      if (useSample && exampleVal) {
        return (
          <span
            key={i}
            className="param-chip"
            style={{
              background: "rgba(3, 162, 151, 0.16)",
              color: "var(--heading)",
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 4,
              border: "1px solid rgba(3, 162, 151, 0.35)",
              display: "inline-block",
              margin: "0 2px",
            }}
          >
            {exampleVal}
          </span>
        );
      }
      return (
        <span
          key={i}
          className="param-chip"
          style={{
            background: "rgba(224, 159, 62, 0.2)",
            color: "#92400e",
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 4,
            border: "1px solid rgba(224, 159, 62, 0.45)",
            display: "inline-block",
            margin: "0 2px",
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function Templates() {
  usePageTitle("WhatsApp templates", "Control · status in Meta");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const edit = can("settings.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [showSampleData, setShowSampleData] = useState<boolean>(true);
  const [noteEdit, setNoteEdit] = useState<string>("");

  const q = useQuery({ queryKey: ["templates"], queryFn: listTemplates });
  const done = async () => qc.invalidateQueries({ queryKey: ["templates"] });

  const sync = useMutation({
    mutationFn: syncTemplates,
    onSuccess: async (r) => {
      message.success(`Read ${r.seen} templates from Meta (${r.added} new).`);
      await done();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const save = useMutation({
    mutationFn: ({ id, meta_status, note }: { id: string; meta_status?: string; note?: string }) =>
      updateTemplate(id, { meta_status, note }),
    onSuccess: async () => {
      message.success("Template updated successfully");
      await done();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const rows = q.data ?? [];

  // Metrics
  const totalCount = rows.length;
  const approvedCount = rows.filter((r) => r.meta_status === "approved").length;
  const submittedCount = rows.filter((r) => r.meta_status === "submitted" || r.meta_status === "draft").length;
  const issueCount = rows.filter((r) => ["rejected", "paused", "disabled"].includes(r.meta_status)).length;
  const utilityCount = rows.filter((r) => (r.category ?? "").toUpperCase() === "UTILITY").length;
  const marketingCount = rows.filter((r) => (r.category ?? "").toUpperCase() === "MARKETING").length;

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.category) set.add(r.category.toUpperCase());
    });
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const qText = search.trim().toLowerCase();
      const matchSearch =
        !qText ||
        r.name.toLowerCase().includes(qText) ||
        (r.purpose && r.purpose.toLowerCase().includes(qText)) ||
        (r.category && r.category.toLowerCase().includes(qText)) ||
        r.language.toLowerCase().includes(qText);

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "approved" && r.meta_status === "approved") ||
        (statusFilter === "submitted" && (r.meta_status === "submitted" || r.meta_status === "draft")) ||
        (statusFilter === "issues" && ["rejected", "paused", "disabled"].includes(r.meta_status)) ||
        r.meta_status === statusFilter;

      const matchCat =
        categoryFilter === "all" || (r.category ?? "").toUpperCase() === categoryFilter.toUpperCase();

      return matchSearch && matchStatus && matchCat;
    });
  }, [rows, search, statusFilter, categoryFilter]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Copied "${text}" to clipboard`);
  };

  const openDrawer = (tpl: TemplateRow) => {
    setSelectedTemplate(tpl);
    setNoteEdit(tpl.note ?? "");
  };

  const selectedMeta = selectedTemplate ? TEMPLATE_PREVIEWS[selectedTemplate.name] : null;

  return (
    <>
      {/* Top Metric Cards */}
      <div className="tpl-stats-row">
        <div className="tpl-stat-card">
          <div className="d">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)" }} />
            Total Registered
          </div>
          <div className="v">{totalCount}</div>
          <div className="small muted">
            {utilityCount} Utility · {marketingCount} Marketing
          </div>
        </div>

        <div className="tpl-stat-card">
          <div className="d">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ok)" }} />
            Approved & Deliverable
          </div>
          <div className="v" style={{ color: "var(--ok)" }}>
            {approvedCount}
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ok)" }}>
              {totalCount > 0 ? `${Math.round((approvedCount / totalCount) * 100)}%` : "0%"}
            </span>
          </div>
          <div className="small muted">Allowed outside 24h session window</div>
        </div>

        <div className="tpl-stat-card">
          <div className="d">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />
            In Review / Draft
          </div>
          <div className="v" style={{ color: submittedCount ? "var(--warn)" : "var(--muted)" }}>
            {submittedCount}
          </div>
          <div className="small muted">Awaiting review in Meta WABA</div>
        </div>

        <div className="tpl-stat-card">
          <div className="d">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" }} />
            Issues / Blocked
          </div>
          <div className="v" style={{ color: issueCount ? "var(--crit)" : "var(--muted)" }}>
            {issueCount}
          </div>
          <div className="small muted">Rejected, paused or disabled</div>
        </div>
      </div>

      {/* Meta WhatsApp 24-Hour Policy Notice */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-b small tpl-notice-banner">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {issueCount > 0 ? (
              <Pill tone="warn">{issueCount} blocked in Meta</Pill>
            ) : (
              <Pill tone="ok">Meta Compliance Active</Pill>
            )}
          </div>
          <div className="tpl-notice-text">
            <b>24-Hour Customer Care Window:</b> Inside 24 hours of the customer&apos;s last inbound message, any normal
            session message can be sent. Outside this window, Meta strictly requires an <b>Approved Template</b> (e.g.
            follow-ups, booking updates, payment reminders). Unapproved templates are skipped by the pipeline to safeguard
            your WhatsApp Business phone number quality rating.
          </div>
          {edit && (
            <button
              className="btn sm"
              style={{ flexShrink: 0 }}
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              <Icon name="sync" />
              {sync.isPending ? "Reading from Meta…" : "Sync from Meta"}
            </button>
          )}
        </div>
      </div>

      <ErrorNote error={q.error} />

      {/* Filter and View Controls */}
      <div className="tpl-filter-bar">
        <div className="tpl-search-box">
          <span className="muted" style={{ display: "inline-flex" }}>
            <Icon name="dash" />
          </span>
          <input
            type="text"
            placeholder="Search templates by name, purpose, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
              onClick={() => setSearch("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Tabs (Scrollable on small mobile screens) */}
        <div className="tpl-tabs-wrap">
          <div className="tpl-tabs">
            <button
              className={`tpl-tab-btn ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({totalCount})
            </button>
            <button
              className={`tpl-tab-btn ${statusFilter === "approved" ? "active" : ""}`}
              onClick={() => setStatusFilter("approved")}
            >
              Approved ({approvedCount})
            </button>
            <button
              className={`tpl-tab-btn ${statusFilter === "submitted" ? "active" : ""}`}
              onClick={() => setStatusFilter("submitted")}
            >
              In Review ({submittedCount})
            </button>
            <button
              className={`tpl-tab-btn ${statusFilter === "issues" ? "active" : ""}`}
              onClick={() => setStatusFilter("issues")}
            >
              Issues ({issueCount})
            </button>
          </div>
        </div>

        {/* Category Filter and View Mode Switcher */}
        <div className="tpl-controls-right">
          <select
            className="input"
            style={{ fontSize: 12, padding: "5px 10px", height: "auto" }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* View Toggle */}
          <div className="tpl-tabs">
            <button
              className={`tpl-tab-btn ${viewMode === "cards" ? "active" : ""}`}
              onClick={() => setViewMode("cards")}
              title="Cards & Visual Preview"
            >
              <Icon name="card" /> Cards
            </button>
            <button
              className={`tpl-tab-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Compact Table"
            >
              <Icon name="log" /> Table
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === "cards" ? (
        <div className="tpl-cards-grid">
          {filtered.map((r) => {
            const preview = TEMPLATE_PREVIEWS[r.name];
            const isApproved = r.meta_status === "approved";
            const sampleText = preview?.body
              ? formatPreviewBody(preview.body, preview.examples, true)
              : r.purpose ?? "WhatsApp approved business template.";

            return (
              <div key={r.id} className="tpl-card">
                {/* Card Top / Badges */}
                <div className="tpl-card-head">
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: 4,
                        background:
                          (r.category ?? "").toUpperCase() === "MARKETING"
                            ? "var(--info-soft)"
                            : "var(--accent-soft)",
                        color:
                          (r.category ?? "").toUpperCase() === "MARKETING"
                            ? "var(--info)"
                            : "var(--accent)",
                      }}
                    >
                      {r.category ?? "TEMPLATE"}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        padding: "1px 5px",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 4,
                      }}
                    >
                      {r.language}
                    </span>
                  </div>
                  <Pill tone={TONE[r.meta_status] ?? "plain"}>{r.meta_status}</Pill>
                </div>

                {/* Card Body */}
                <div className="tpl-card-body">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                    <div className="tpl-card-title">
                      <span>{r.name}</span>
                      <button
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--muted)",
                          padding: 2,
                        }}
                        title="Copy template name"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(r.name);
                        }}
                      >
                        <Icon name="doc" />
                      </button>
                    </div>
                  </div>

                  <div className="tpl-card-desc">
                    {r.purpose || preview?.purposeSnippet || "Automated WhatsApp communication."}
                  </div>

                  {/* WhatsApp Bubble Preview */}
                  <div
                    className="tpl-wa-bubble"
                    style={{
                      opacity: isApproved ? 1 : 0.85,
                      borderColor: isApproved ? "var(--line)" : "var(--crit)",
                    }}
                  >
                    <div style={{ wordBreak: "break-word" }}>
                      {preview?.body ? (
                        formatPreviewBody(preview.body, preview.examples, true)
                      ) : (
                        <span>{sampleText}</span>
                      )}
                    </div>
                    {preview?.footer && (
                      <div className="small muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {preview.footer}
                      </div>
                    )}
                    <div className="wa-meta">
                      <span>12:00 PM</span>
                      <span style={{ color: "#53bdeb", fontWeight: 700 }}>✓✓</span>
                    </div>

                    {/* Quick Replies */}
                    {preview?.quickReplies && preview.quickReplies.length > 0 && (
                      <div className="tpl-wa-btns">
                        {preview.quickReplies.map((btn) => (
                          <div key={btn} className="tpl-wa-btn">
                            <span style={{ fontSize: 11 }}>↩</span> {btn}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="tpl-card-foot">
                  <div className="small muted" style={{ fontSize: 11 }}>
                    {r.last_synced_at ? `Synced ${fmtTime(r.last_synced_at)}` : "Not synced"}
                  </div>
                  <div className="tpl-card-foot-actions">
                    {edit && (
                      <select
                        className="input"
                        style={{ fontSize: 11.5, padding: "3px 8px", height: "auto" }}
                        value={r.meta_status}
                        disabled={save.isPending}
                        onChange={(e) => save.mutate({ id: r.id, meta_status: e.target.value })}
                      >
                        {TEMPLATE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                    <button className="btn sm" style={{ padding: "3px 10px" }} onClick={() => openDrawer(r)}>
                      Preview
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Enhanced Table View */
        <Panel bodyless>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Template Name</th>
                  <th>Category</th>
                  <th>Lang</th>
                  <th>Purpose / Flow</th>
                  <th>Status</th>
                  <th>Last Sync</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        <b className="mono small">{r.name}</b>
                        <button
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--muted)",
                            padding: 0,
                          }}
                          onClick={() => copyToClipboard(r.name)}
                          title="Copy name"
                        >
                          <Icon name="doc" />
                        </button>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            (r.category ?? "").toUpperCase() === "MARKETING"
                              ? "var(--info-soft)"
                              : "var(--accent-soft)",
                          color:
                            (r.category ?? "").toUpperCase() === "MARKETING"
                              ? "var(--info)"
                              : "var(--accent)",
                        }}
                      >
                        {r.category ?? "—"}
                      </span>
                    </td>
                    <td className="mono small">{r.language}</td>
                    <td className="small" style={{ maxWidth: 320 }}>
                      {r.purpose ?? "—"}
                    </td>
                    <td>
                      {edit ? (
                        <select
                          className="input"
                          style={{ fontSize: 12, padding: "4px 8px" }}
                          value={r.meta_status}
                          disabled={save.isPending}
                          onChange={(e) => save.mutate({ id: r.id, meta_status: e.target.value })}
                        >
                          {TEMPLATE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Pill tone={TONE[r.meta_status] ?? "plain"}>{r.meta_status}</Pill>
                      )}
                    </td>
                    <td className="small muted">{r.last_synced_at ? fmtTime(r.last_synced_at) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn sm" onClick={() => openDrawer(r)}>
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {q.isLoading && <Empty>Loading templates…</Empty>}
      {!q.isLoading && !filtered.length && (
        <Empty>No templates match your search & filter criteria.</Empty>
      )}

      {/* Interactive WhatsApp Mobile Mockup & Detail Drawer */}
      {selectedTemplate && (
        <Drawer
          title={`WhatsApp Template: ${selectedTemplate.name}`}
          onClose={() => setSelectedTemplate(null)}
        >
          {/* Top Info Bar */}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
            <Pill tone={TONE[selectedTemplate.meta_status] ?? "plain"}>
              {selectedTemplate.meta_status.toUpperCase()}
            </Pill>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              {selectedTemplate.category ?? "UTILITY"}
            </span>
            <span className="mono small muted">Language: {selectedTemplate.language}</span>
            <span className="spacer" />
            <button
              className="btn sm"
              onClick={() => setShowSampleData(!showSampleData)}
              title="Toggle between real preview data and placeholder markers"
            >
              {showSampleData ? "View {{Variables}}" : "View Sample Data"}
            </button>
          </div>

          {/* Section Heading */}
          <div style={{ flexShrink: 0, marginTop: 4 }}>
            <div
              className="small muted"
              style={{
                fontWeight: 600,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontSize: 11,
              }}
            >
              <span>📱</span> WhatsApp Message Mockup
            </div>

            {/* Realistic WhatsApp Phone Mockup */}
            <div className="tpl-phone-mockup" style={{ flexShrink: 0 }}>
              {/* Phone Top Header */}
              <div className="tpl-phone-header">
                <div className="tpl-phone-avatar">O</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                    Oxxy Health
                    <span style={{ color: "#25D366", fontSize: 12 }}>✓</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#d2e7e2" }}>Verified Business Account</div>
                </div>
              </div>

              {/* Chat Body Mockup */}
              <div className="tpl-phone-body" style={{ flexShrink: 0 }}>
                <div style={{ textAlign: "center", margin: "2px 0 6px" }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      background: "rgba(0, 0, 0, 0.08)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      color: "var(--muted)",
                    }}
                  >
                    TODAY
                  </span>
                </div>

                {/* Chat Speech Bubble */}
                <div className="tpl-wa-bubble" style={{ background: "#d9f1ed", border: "1px solid #bce1db" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                    Oxxy Support
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>
                    {selectedMeta?.body ? (
                      formatPreviewBody(selectedMeta.body, selectedMeta.examples, showSampleData)
                    ) : (
                      <span>{selectedTemplate.purpose ?? "Approved WhatsApp Business Message"}</span>
                    )}
                  </div>

                  {selectedMeta?.footer && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {selectedMeta.footer}
                    </div>
                  )}

                  <div className="wa-meta">
                    <span>12:30 PM</span>
                    <span style={{ color: "#53bdeb", fontWeight: 700 }}>✓✓</span>
                  </div>

                  {/* Quick Reply Buttons */}
                  {selectedMeta?.quickReplies && selectedMeta.quickReplies.length > 0 && (
                    <div className="tpl-wa-btns" style={{ marginTop: 8 }}>
                      {selectedMeta.quickReplies.map((btn) => (
                        <div
                          key={btn}
                          className="tpl-wa-btn"
                          style={{ background: "#ffffff", color: "var(--brand)", fontWeight: 600 }}
                        >
                          <span style={{ fontSize: 11 }}>↩</span> {btn}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Details & Configuration Panel */}
          <div className="panel" style={{ marginTop: 12, flexShrink: 0 }}>
            <div className="panel-h">
              <h2>Template Details & Actions</h2>
            </div>
            <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="small muted">Purpose & Automation Trigger</div>
                <div style={{ fontSize: 13, marginTop: 2, fontWeight: 500 }}>
                  {selectedTemplate.purpose || selectedMeta?.purposeSnippet || "Automated Oxxy flow."}
                </div>
              </div>

              <div className="grid g2" style={{ gap: 10 }}>
                <div>
                  <div className="small muted">Meta Template ID</div>
                  <div className="mono small" style={{ marginTop: 2 }}>
                    {selectedTemplate.meta_id ?? "Managed in Meta WABA"}
                  </div>
                </div>
                <div>
                  <div className="small muted">Last Synced</div>
                  <div className="small" style={{ marginTop: 2 }}>
                    {selectedTemplate.last_synced_at ? fmtTime(selectedTemplate.last_synced_at) : "Never synced"}
                  </div>
                </div>
              </div>

              {edit && (
                <div>
                  <div className="small muted" style={{ marginBottom: 4 }}>
                    Meta Status Override
                  </div>
                  <select
                    className="input"
                    style={{ width: "100%" }}
                    value={selectedTemplate.meta_status}
                    disabled={save.isPending}
                    onChange={(e) => {
                      const newStatus = e.target.value;
                      setSelectedTemplate({ ...selectedTemplate, meta_status: newStatus });
                      save.mutate({ id: selectedTemplate.id, meta_status: newStatus });
                    }}
                  >
                    {TEMPLATE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Internal Notes */}
              <div>
                <div className="small muted" style={{ marginBottom: 4 }}>
                  Operations / Compliance Notes
                </div>
                <textarea
                  className="input"
                  style={{ width: "100%", height: 75, resize: "vertical", fontFamily: "var(--font-ui)" }}
                  placeholder="Add internal instructions, approval notes or guidelines for this template…"
                  value={noteEdit}
                  onChange={(e) => setNoteEdit(e.target.value)}
                />
                {edit && (
                  <button
                    className="btn sm"
                    style={{ marginTop: 6 }}
                    disabled={save.isPending}
                    onClick={() => save.mutate({ id: selectedTemplate.id, note: noteEdit })}
                  >
                    Save Note
                  </button>
                )}
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}
