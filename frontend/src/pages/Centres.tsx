import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCentre,
  deleteCentre,
  importCentres,
  listCentres,
  updateCentre,
  type CentreInput,
} from "../api/centres.api";
import type { Centre } from "../types";
import { usePermissions } from "../hooks/usePermissions";
import { Drawer, Empty, ErrorNote, Field, fmtDate, Pill, usePageTitle } from "../components/ui";

const TYPES = ["clinic", "specialist", "multispeciality", "diagnostic"];
const blank: CentreInput = {
  name: "",
  branch: "",
  locality: "",
  city: "",
  latitude: 0,
  longitude: 0,
  centre_type: "clinic",
  specialisations: [],
  is_private: true,
  verified: true,
  active: true,
};

function parseCsv(csv: string) {
  const [header, ...data] = csv.trim().split(/\r?\n/).filter(Boolean);
  const cols = header.split(",").map((c) => c.trim());
  return data.map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
  });
}

export default function Centres() {
  usePageTitle("Centres", "Approved provider directory");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("centres.edit");
  const [form, setForm] = useState<(CentreInput & { id?: string }) | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [error, setError] = useState("");
  const q = useQuery({ queryKey: ["centres"], queryFn: listCentres });

  const done = async (msg: string) => {
    message.success(msg);
    setForm(null);
    setCsv(null);
    setError("");
    await qc.invalidateQueries({ queryKey: ["centres"] });
  };
  const save = useMutation({
    mutationFn: (v: CentreInput & { id?: string }) =>
      v.id ? updateCentre(v.id, v) : createCentre(v),
    onSuccess: (_r, v) => done(v.id ? "Centre updated" : "Centre added"),
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteCentre,
    onSuccess: () => done("Centre removed"),
    onError: (e: Error) => message.error(e.message),
  });
  const importer = useMutation({
    mutationFn: () => importCentres(parseCsv(csv ?? "")),
    onSuccess: (r) => done(`Imported: ${r.created} new, ${r.updated ?? 0} updated, ${r.skipped ?? 0} skipped (no name or city)`),
    onError: (e: Error) => setError(e.message),
  });

  const set = (k: keyof CentreInput, v: unknown) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const askDelete = (c: Centre) =>
    modal.confirm({
      title: `Remove ${c.name}?`,
      content: "The bot stops suggesting it. Booking requests already made keep the centre name.",
      okText: "Remove",
      okButtonProps: { danger: true },
      onOk: () => remove.mutateAsync(c.id),
    });

  return (
    <>
      <div className="row">
        <span className="small muted">
          The bot suggests only active, verified, private centres. Tie-up status is never shown to
          customers.
        </span>
        <span className="spacer" />
        {canEdit && (
          <>
            <button
              className="btn"
              onClick={() =>
                setCsv("name,branch,locality,city,postcode,latitude,longitude,centre_type,specialisations,is_private,verified,verification_source\n")
              }
            >
              Import CSV
            </button>
            <button className="btn pri" onClick={() => setForm({ ...blank })}>
              Add centre
            </button>
          </>
        )}
      </div>
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Centre</th>
                <th>City</th>
                <th>Type</th>
                <th>Specialisations</th>
                <th>Last verified</th>
                <th>Status</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    <div className="small muted">
                      {[c.branch, c.locality].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>{c.city}</td>
                  <td className="small">{c.centre_type ?? "—"}</td>
                  <td className="small">{(c.specialisations ?? []).join(", ") || "—"}</td>
                  <td className="mono small">
                    {fmtDate((c as Centre & { verified_at?: string }).verified_at)}
                  </td>
                  <td>
                    {c.active && c.verified && c.is_private ? (
                      <Pill tone="ok">Active</Pill>
                    ) : (
                      <Pill>Hidden from bot</Pill>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <div
                        className="row"
                        style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}
                      >
                        <button
                          className="btn sm"
                          onClick={() =>
                            setForm({ ...c, specialisations: c.specialisations ?? [] })
                          }
                        >
                          Edit
                        </button>
                        <button className="btn sm danger" onClick={() => askDelete(c)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {q.isLoading && <Empty>Loading…</Empty>}
          {!q.isLoading && !(q.data ?? []).length && <Empty>No centres yet.</Empty>}
        </div>
      </div>

      {form && (
        <Drawer
          title={form.id ? "Edit centre" : "Add centre"}
          onClose={() => {
            setForm(null);
            setError("");
          }}
        >
          <form
            className="grid"
            style={{ gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label="Centre name *">
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <div className="grid g2">
              <Field label="Branch">
                <input
                  className="input"
                  value={form.branch ?? ""}
                  onChange={(e) => set("branch", e.target.value)}
                />
              </Field>
              <Field label="Locality">
                <input
                  className="input"
                  value={form.locality ?? ""}
                  onChange={(e) => set("locality", e.target.value)}
                />
              </Field>
            </div>
            <Field label="City *">
              <input
                className="input"
                required
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <div className="grid g2">
              <Field label="Latitude *">
                <input
                  className="input mono"
                  required
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => set("latitude", Number(e.target.value))}
                />
              </Field>
              <Field label="Longitude *">
                <input
                  className="input mono"
                  required
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => set("longitude", Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Type">
              <select
                className="input"
                value={form.centre_type ?? "clinic"}
                onChange={(e) => set("centre_type", e.target.value)}
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Specialisations" hint="Comma separated, for example orthopaedics, dental">
              <input
                className="input"
                value={(form.specialisations ?? []).join(", ")}
                onChange={(e) => set("specialisations", e.target.value.split(","))}
              />
            </Field>
            {[
              ["is_private", "Private centre (government hospitals are never suggested)"],
              ["verified", "Verified"],
              ["active", "Show this centre to the bot"],
            ].map(([k, l]) => (
              <label key={k} className="row small" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(form[k as keyof CentreInput])}
                  onChange={(e) => set(k as keyof CentreInput, e.target.checked)}
                />
                {l}
              </label>
            ))}
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

      {csv !== null && (
        <Drawer
          title="Import centres (CSV)"
          onClose={() => {
            setCsv(null);
            setError("");
          }}
        >
          <p className="small muted" style={{ margin: 0 }}>
            One centre per line. Use | between specialisations, e.g. cardiology|orthopaedics. The bot suggests a
            centre only when verified is yes (add who checked it in verification_source) and is_private is yes.
            A row with the same name, branch and city updates that centre.
          </p>
          <textarea
            className="input mono"
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          {error && (
            <div className="small" role="alert" style={{ color: "var(--crit)", fontWeight: 600 }}>
              {error}
            </div>
          )}
          <div className="row">
            <button
              className="btn pri"
              disabled={importer.isPending}
              onClick={() => importer.mutate()}
            >
              Import
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}
