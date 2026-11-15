import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkCentres,
  createCentre,
  deleteCentre,
  exportCentres,
  geocodeCentre,
  importCentres,
  listCentres,
  updateCentre,
  type CentreInput,
} from "../api/centres.api";
import type { Centre } from "../types";
import { usePermissions } from "../hooks/usePermissions";
import {
  Drawer,
  Empty,
  ErrorNote,
  Field,
  fmtDate,
  Pill,
  Stat,
  usePageTitle,
} from "../components/ui";
import CentresMap, { mapsLink } from "../components/CentresMap";

const TYPES = ["clinic", "specialist", "multispeciality", "diagnostic"];
const blank: CentreInput = {
  name: "",
  branch: "",
  locality: "",
  city: "",
  address: "",
  latitude: 0,
  longitude: 0,
  centre_type: "clinic",
  specialisations: [],
  is_private: true,
  verified: true,
  active: true,
  phone: "",
  opening_hours: "",
};

// Splits one CSV line, honouring "quoted, values" and "" escapes
const STALE_DAYS = 180; // a verification older than this needs doing again
const HEADER =
  "name,branch,locality,city,postcode,address,latitude,longitude,centre_type,specialisations,is_private,verified,verification_source,phone,opening_hours";

const verifiedAge = (iso?: string | null) =>
  iso
    ? Math.floor((Date.now() - new Date(iso.slice(0, 10) + "T00:00:00").getTime()) / 86_400_000)
    : null;
/** Why the bot will not suggest this centre (empty = it will) */
function hiddenWhy(c: Centre): string[] {
  const why: string[] = [];
  if (!c.verified) why.push("Not verified");
  if (!c.is_private) why.push("Government centre");
  if (!c.active) why.push("Switched off");
  return why;
}
const noPoint = (c: Centre) => !c.latitude && !c.longitude;

function exportCsv(rows: Centre[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const yn = (b: boolean) => (b ? "yes" : "no");
  const lines = rows.map((c) =>
    [
      c.name,
      c.branch,
      c.locality,
      c.city,
      c.postcode,
      c.address,
      c.latitude,
      c.longitude,
      c.centre_type,
      (c.specialisations ?? []).join("|"),
      yn(c.is_private),
      yn(c.verified),
      c.verification_source,
      c.phone,
      c.opening_hours,
    ]
      .map(esc)
      .join(","),
  );
  const text = "\uFEFF" + [HEADER, ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `centres-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(csv: string) {
  const [header, ...data] = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!header) throw new Error("Choose a CSV file or paste your centres first.");
  const cols = splitLine(header);
  const rows = data.map((line) => {
    const vals = splitLine(line);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
  });
  if (!rows.length)
    throw new Error(
      "Only the header line was found. Add at least one centre on the line below it, or upload a CSV file that has centres.",
    );
  return rows;
}

export default function Centres() {
  usePageTitle("Centres", "Approved provider directory");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("centres.edit");
  const [form, setForm] = useState<(CentreInput & { id?: string }) | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  // "Find on map": the point for the address typed (Google Geocoding), shown before saving
  const locate = useMutation({
    mutationFn: (f: CentreInput) =>
      geocodeCentre(
        [f.address, f.name, f.branch, f.locality, f.city]
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .join(", "),
      ),
    onSuccess: (g) => {
      setForm((f) =>
        f
          ? {
              ...f,
              latitude: g.latitude,
              longitude: g.longitude,
              locality: f.locality || g.locality || "",
              city: f.city || g.city || "",
            }
          : f,
      );
      message[g.approximate ? "warning" : "success"](
        g.approximate
          ? `Only an approximate match: ${g.formatted}. Check the pin, or add the street and area.`
          : `Found: ${g.formatted}`,
      );
    },
    onError: (e: Error) => message.error(e.message),
  });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const q = useQuery({
    queryKey: ["centres", term, city, type, state, page],
    queryFn: () => listCentres({ q: term, city, type, state, page }),
  });
  const rows = q.data?.rows ?? [];
  const sum = q.data?.summary;
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / (q.data?.page_size ?? 50)));
  const filtered = !!(term || city || type || state);
  const bulk = useMutation({
    mutationFn: ({ action }: { action: "hide" | "show" | "verify" | "delete" }) =>
      bulkCentres(picked, action),
    onSuccess: async (r) => {
      message.success(`${r.updated} centre${r.updated === 1 ? "" : "s"} updated`);
      setPicked([]);
      await qc.invalidateQueries({ queryKey: ["centres"] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const askBulk = (action: "hide" | "show" | "verify" | "delete") =>
    modal.confirm({
      title: `${{ hide: "Hide", show: "Show", verify: "Mark as verified", delete: "Delete" }[action]} ${picked.length} centre${picked.length === 1 ? "" : "s"}?`,
      content:
        action === "delete"
          ? "The bot stops suggesting them. Booking requests already made keep the centre name."
          : action === "verify"
            ? "Only if you really checked them. They get today's date as the verification date."
            : "This changes whether the bot suggests them.",
      okText: "Yes",
      okButtonProps: { danger: action === "delete" },
      onOk: () => bulk.mutateAsync({ action }),
    });
  const exporter = useMutation({
    mutationFn: exportCentres,
    onSuccess: (all) => exportCsv(all),
    onError: (e: Error) => message.error(e.message),
  });
  const allPicked = rows.length > 0 && rows.every((c) => picked.includes(c.id));

  const done = async (msg: string) => {
    message.success(msg);
    setForm(null);
    setCsv(null);
    setFileName("");
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
    onSuccess: (r) =>
      done(
        `Imported: ${r.created} new, ${r.updated ?? 0} updated, ${r.skipped ?? 0} skipped (no name or city)`,
      ),
    onError: (e: Error) => setError(e.message),
  });

  // Live preview of whatever is in the CSV box (uploaded file or pasted text)
  const preview = (() => {
    if (!csv || !csv.trim())
      return { rows: [] as Record<string, unknown>[], missing: 0, problem: "" };
    try {
      const rows = parseCsv(csv);
      return { rows, missing: rows.filter((r) => !r.name || !r.city).length, problem: "" };
    } catch (e) {
      return { rows: [] as Record<string, unknown>[], missing: 0, problem: (e as Error).message };
    }
  })();

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
            <button className="btn" onClick={() => setCsv(HEADER + "\n")}>
              Import CSV
            </button>
            <button className="btn pri" onClick={() => setForm({ ...blank })}>
              Add centre
            </button>
          </>
        )}
        <button className="btn" disabled={exporter.isPending} onClick={() => exporter.mutate()}>
          {exporter.isPending ? "Exporting…" : "Export CSV"}
        </button>
        <button className="btn" onClick={() => setShowMap((v) => !v)}>
          {showMap ? "Show the list" : "Show on map"}
        </button>
      </div>
      {showMap && <CentresMap />}
      <div className="grid g4">
        <Stat label="Centres" value={sum?.total ?? "…"} detail="In the directory" />
        <Stat
          label="Suggested by the bot"
          value={sum?.live ?? "…"}
          detail="Active, verified and private"
        />
        <Stat
          label="Hidden from the bot"
          value={sum?.hidden ?? "…"}
          detail="Not verified, switched off or government"
        />
        <Stat
          label="Needs re-verifying"
          value={sum?.stale ?? "…"}
          detail={`Not verified in ${STALE_DAYS} days${sum?.no_point ? ` · ${sum.no_point} without a map point` : ""}`}
        />
      </div>
      <div className="row">
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Search name, branch, area, city or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          style={{ width: "auto" }}
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Any city</option>
          {(q.data?.cities ?? []).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          className="input"
          style={{ width: "auto" }}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Any type</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          className="input"
          style={{ width: "auto" }}
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Any status</option>
          <option value="live">Suggested by the bot</option>
          <option value="hidden">Hidden from the bot</option>
          <option value="stale">Needs re-verifying</option>
          <option value="nopoint">No map point</option>
        </select>
        {filtered && (
          <button
            className="btn sm"
            onClick={() => {
              setSearch("");
              setCity("");
              setType("");
              setState("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {canEdit && picked.length > 0 && (
        <div className="panel">
          <div className="panel-b row">
            <b>{picked.length} selected</b>
            <button className="btn sm" disabled={bulk.isPending} onClick={() => askBulk("show")}>
              Show to bot
            </button>
            <button className="btn sm" disabled={bulk.isPending} onClick={() => askBulk("hide")}>
              Hide from bot
            </button>
            <button className="btn sm" disabled={bulk.isPending} onClick={() => askBulk("verify")}>
              Mark verified
            </button>
            <button
              className="btn sm danger"
              disabled={bulk.isPending}
              onClick={() => askBulk("delete")}
            >
              Delete
            </button>
            <span className="spacer" />
            <button className="btn sm" onClick={() => setPicked([])}>
              Clear selection
            </button>
          </div>
        </div>
      )}
      <ErrorNote error={q.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                {canEdit && (
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allPicked}
                      onChange={(e) => setPicked(e.target.checked ? rows.map((c) => c.id) : [])}
                    />
                  </th>
                )}
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
              {rows.map((c) => (
                <tr key={c.id}>
                  {canEdit && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.name}`}
                        checked={picked.includes(c.id)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td>
                    <b>{c.name}</b>
                    <div className="small muted">
                      {[c.branch, c.locality].filter(Boolean).join(" · ")}
                    </div>
                    {(c.phone || c.opening_hours) && (
                      <div className="small muted">
                        {[c.phone, c.opening_hours].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {noPoint(c) && (
                      <div className="small" style={{ color: "var(--crit)" }}>
                        No map point yet
                      </div>
                    )}
                  </td>
                  <td>{c.city}</td>
                  <td className="small">{c.centre_type ?? "—"}</td>
                  <td className="small">{(c.specialisations ?? []).join(", ") || "—"}</td>
                  <td className="mono small">
                    {fmtDate(c.verified_at)}
                    {(() => {
                      const age = verifiedAge(c.verified_at);
                      if (age == null)
                        return <div style={{ color: "var(--crit)" }}>Never verified</div>;
                      return age > STALE_DAYS ? (
                        <div style={{ color: "var(--crit)", fontWeight: 600 }}>
                          {age} days ago · re-verify
                        </div>
                      ) : (
                        <div className="muted">{age} days ago</div>
                      );
                    })()}
                  </td>
                  <td>
                    {c.active && c.verified && c.is_private ? (
                      <Pill tone="ok">Active</Pill>
                    ) : (
                      <>
                        <Pill>Hidden from bot</Pill>
                        <div className="small muted">{hiddenWhy(c).join(" · ")}</div>
                      </>
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
          {!q.isLoading && !rows.length && (
            <Empty>{filtered ? "No centres match these filters." : "No centres yet."}</Empty>
          )}
        </div>
      </div>

      {pages > 1 && (
        <div className="row">
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹ Previous
          </button>
          <span className="small muted">
            Page {page + 1} of {pages} · {q.data?.total ?? 0} centres
          </span>
          <button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next ›
          </button>
        </div>
      )}

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
            <div className="grid g2">
              <Field label="Phone">
                <input
                  className="input"
                  value={form.phone ?? ""}
                  placeholder="e.g. 0422 4345678"
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="Opening hours">
                <input
                  className="input"
                  value={form.opening_hours ?? ""}
                  placeholder="e.g. Mon-Sat 9am-6pm"
                  onChange={(e) => set("opening_hours", e.target.value)}
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
            <Field
              label="Address"
              hint="Street and area, no commas needed. Used to find the point on the map; leave latitude and longitude empty and it is filled when you save."
            >
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={form.address ?? ""}
                  placeholder="e.g. 12 Avinashi Road, near the bus stand"
                  onChange={(e) => set("address", e.target.value)}
                />
                <button
                  type="button"
                  className="btn sm"
                  disabled={locate.isPending || !form.city}
                  onClick={() => locate.mutate(form)}
                >
                  {locate.isPending ? "Looking…" : "Find on map"}
                </button>
              </div>
            </Field>
            {!!form.latitude && !!form.longitude && (
              <div className="small" style={{ marginBottom: 8 }}>
                <iframe
                  title="Centre on the map"
                  style={{
                    width: "100%",
                    height: 180,
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                  }}
                  loading="lazy"
                  src={`https://maps.google.com/maps?q=${form.latitude},${form.longitude}&z=15&output=embed`}
                />
                <a href={mapsLink(form.latitude, form.longitude)} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>{" "}
                <span className="muted">
                  Is the pin on the right building? If not, correct the numbers below.
                </span>
              </div>
            )}
            <div className="grid g2">
              <Field label="Latitude">
                <input
                  className="input mono"
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => set("latitude", Number(e.target.value))}
                />
              </Field>
              <Field label="Longitude">
                <input
                  className="input mono"
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
            One centre per line. Use | between specialisations, e.g. cardiology|orthopaedics. The
            bot suggests a centre only when verified is yes (add who checked it in
            verification_source) and is_private is yes. A row with the same name, branch and city
            updates that centre.
          </p>
          <div className="row">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCsv(await file.text());
                setFileName(file.name);
                setError("");
                e.target.value = "";
              }}
            />
            <button type="button" className="btn pri" onClick={() => fileRef.current?.click()}>
              Upload CSV file
            </button>
            <a className="btn" href="/centres-sample.csv" download="centres-sample.csv">
              Download sample CSV
            </a>
            {fileName && <span className="small muted">{fileName}</span>}
          </div>
          <textarea
            className="input mono"
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          {preview.rows.length > 0 && (
            <div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
                {preview.rows.length} centre{preview.rows.length === 1 ? "" : "s"} found in the file
                {preview.missing > 0 && (
                  <span style={{ color: "var(--crit)" }}>
                    {" "}
                    · {preview.missing} missing name or city (will be skipped)
                  </span>
                )}
              </div>
              <div
                style={{
                  maxHeight: 220,
                  overflow: "auto",
                  border: "1px solid var(--line, #ddd)",
                  borderRadius: 8,
                }}
              >
                <table className="small" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: 6 }}>#</th>
                      <th style={{ padding: 6 }}>Name</th>
                      <th style={{ padding: 6 }}>Branch</th>
                      <th style={{ padding: 6 }}>City</th>
                      <th style={{ padding: 6 }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} style={!r.name || !r.city ? { color: "var(--crit)" } : undefined}>
                        <td style={{ padding: 6 }}>{i + 1}</td>
                        <td style={{ padding: 6 }}>{String(r.name || "—")}</td>
                        <td style={{ padding: 6 }}>{String(r.branch || "—")}</td>
                        <td style={{ padding: 6 }}>{String(r.city || "—")}</td>
                        <td style={{ padding: 6 }}>{String(r.centre_type || "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(error || preview.problem) && (
            <div className="small" role="alert" style={{ color: "var(--crit)", fontWeight: 600 }}>
              {error || preview.problem}
            </div>
          )}
          <div className="row">
            <button
              className="btn pri"
              disabled={importer.isPending || preview.rows.length === 0}
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
