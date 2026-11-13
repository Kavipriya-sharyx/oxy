import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAsset, listAssets, updateAsset, type AssetInput, type AssetRow } from "../api/insights.api";
import { Drawer, Empty, ErrorNote, Field, Pill, usePageTitle } from "../components/ui";

// Playbook 17.1 send_approved_asset / 18.1: only content listed and approved here can be sent.
const KINDS = ["website", "document", "comparison", "media", "testimonial", "policy", "article"];
const EMPTY: AssetInput = { code: "", kind: "website", title: "", url: "", language: "en", trigger_id: "", template_name: "" };

export default function Content() {
  usePageTitle("Approved content", "Admin");
  const { message } = App.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["assets"], queryFn: listAssets });
  const [form, setForm] = useState<(AssetInput & { id?: string }) | null>(null);
  const [error, setError] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["assets"] });
  const save = useMutation({
    mutationFn: async (f: AssetInput & { id?: string }): Promise<unknown> => {
      const { id, ...v } = f;
      const body = { ...v, trigger_id: v.trigger_id || null, template_name: v.template_name || null };
      return id ? updateAsset(id, body) : createAsset(body);
    },
    onSuccess: async (_r, f) => {
      message.success(f.id ? "Saved. A changed title or link needs approval again." : "Added. Approve it before it can be sent.");
      setForm(null);
      setError("");
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const approve = useMutation({
    mutationFn: (a: AssetRow) => updateAsset(a.id, { approved: !a.approved }),
    onSuccess: refresh,
    onError: (e: Error) => message.error(e.message),
  });

  const set = (k: keyof AssetInput) => (e: { target: { value: string } }) => setForm({ ...form!, [k]: e.target.value });

  return (
    <>
      <div className="row">
        <span className="small muted">
          The bot, the CRM and the voice AI can send only approved, in-date items from this list, once per journey.
          Changing a title or link removes the approval.
        </span>
        <span className="spacer" />
        <button className="btn pri" onClick={() => setForm({ ...EMPTY })}>
          Add content
        </button>
      </div>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Content</th>
                <th>Kind</th>
                <th>Trigger</th>
                <th>Language</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.title}</b>
                    <div className="small muted mono" style={{ overflowWrap: "anywhere" }}>
                      {a.code} · {a.url}
                    </div>
                  </td>
                  <td>{a.kind}</td>
                  <td className="mono">{a.trigger_id ?? "—"}</td>
                  <td>{a.language}</td>
                  <td>{a.approved ? <Pill tone="ok">Approved</Pill> : <Pill tone="warn">Not approved</Pill>}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => setForm({ ...a, trigger_id: a.trigger_id ?? "", template_name: a.template_name ?? "" })}>
                        Edit
                      </button>
                      <button className="btn sm" disabled={approve.isPending} onClick={() => approve.mutate(a)}>
                        {a.approved ? "Withdraw" : "Approve"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {q.data && !q.data.length && <Empty>No content yet.</Empty>}
        </div>
      </div>

      {form && (
        <Drawer title={form.id ? "Edit content" : "Add content"} onClose={() => { setForm(null); setError(""); }}>
          <form
            className="grid"
            style={{ gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label="Code" hint="Short unique name, e.g. trust_pack_en">
              <input className="input" required maxLength={80} value={form.code ?? ""} onChange={set("code")} disabled={!!form.id} />
            </Field>
            <Field label="Title">
              <input className="input" required maxLength={200} value={form.title ?? ""} onChange={set("title")} />
            </Field>
            <Field label="Link" hint="Official https:// link only">
              <input className="input" required type="url" pattern="https://.*" value={form.url ?? ""} onChange={set("url")} />
            </Field>
            <Field label="Kind">
              <select className="input" value={form.kind ?? "website"} onChange={set("kind")}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Language">
              <select className="input" value={form.language ?? "en"} onChange={set("language")}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="hinglish">Hinglish</option>
              </select>
            </Field>
            <Field label="Trigger (A–R)" hint="Optional: the trigger this content belongs to">
              <input className="input" maxLength={1} value={form.trigger_id ?? ""} onChange={set("trigger_id")} />
            </Field>
            <Field label="WhatsApp template" hint="Approved template for sends outside the 24-hour window">
              <input className="input" maxLength={120} value={form.template_name ?? ""} onChange={set("template_name")} />
            </Field>
            {error && (
              <div className="small" role="alert" style={{ color: "var(--crit)", fontWeight: 600 }}>
                {error}
              </div>
            )}
            <div className="row">
              <button className="btn pri" disabled={save.isPending}>
                Save
              </button>
              <button type="button" className="btn" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}
