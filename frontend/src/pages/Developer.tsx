import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiOrigin,
  createApiKey,
  getOverview,
  getPostman,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
} from "../api/developer.api";
import {
  Drawer,
  Empty,
  ErrorNote,
  Field,
  Panel,
  Pill,
  Stat,
  Tabs,
  fmtDate,
  usePageTitle,
} from "../components/ui";
import ApiDocs, { DOC_CSS, STANDALONE_TOKENS } from "../components/ApiDocs";

type DevTab = "setup" | "docs";

/** The integration guide as one self-contained HTML file for the client's developers */
async function downloadGuide(base: string) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(<ApiDocs base={base} interactive={false} />);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Oxxy CRM integration guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Roboto:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" />
<style>${STANDALONE_TOKENS}${DOC_CSS}</style>
</head>
<body><main class="page">${body}</main></body>
</html>
`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "oxxy-crm-integration-guide.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATE_TONE: Record<ApiKeyRow["state"], ["ok" | "warn" | "plain", string]> = {
  active: ["ok", "Active"],
  expired: ["warn", "Expired"],
  revoked: ["plain", "Revoked"],
};

async function copy(text: string, done: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    done("Copied");
  } catch {
    done("Copy failed: select the text and copy it by hand");
  }
}

function CopyLine({ value, onCopied }: { value: string; onCopied: (m: string) => void }) {
  return (
    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
      <code className="mono small" style={{ overflowWrap: "anywhere", flex: 1, minWidth: 0 }}>
        {value}
      </code>
      <button type="button" className="btn sm" onClick={() => copy(value, onCopied)}>
        Copy
      </button>
    </div>
  );
}

// Shows a new key or secret once, with a warning and a copy button
function Secret({
  label,
  value,
  onCopied,
}: {
  label: string;
  value: string;
  onCopied: (m: string) => void;
}) {
  return (
    <div className="panel" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}>
      <div className="panel-b grid" style={{ gap: 8 }}>
        <b>{label}</b>
        <span className="small">
          Copy it now. It is shown only this once; the bot keeps only a fingerprint of it.
        </span>
        <CopyLine value={value} onCopied={onCopied} />
      </div>
    </div>
  );
}

const ago = (iso: string | null) => (iso ? fmtDate(iso) : "Never");

export default function Developer() {
  usePageTitle("Developer", "Admin");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: ["developer", "overview"], queryFn: getOverview });
  const keys = useQuery({ queryKey: ["developer", "keys"], queryFn: listApiKeys });
  const [drawer, setDrawer] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<string>("365");
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [tab, setTab] = useState<DevTab>(() =>
    window.location.hash.startsWith("#doc-") ? "docs" : "setup",
  );

  const origin = apiOrigin();
  const actionsBase = `${origin}/api/v1/Actions`;
  const copied = (m: string) => (m === "Copied" ? message.success(m) : message.error(m));
  const refresh = () => qc.invalidateQueries({ queryKey: ["developer"] });

  const create = useMutation({
    mutationFn: () => createApiKey(name, expiry === "never" ? null : Number(expiry)),
    onSuccess: async (r) => {
      setNewKey({ name: r.name, key: r.key });
      setFormError("");
      await refresh();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: async () => {
      message.success("Key revoked. Calls with it are refused from now on.");
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const postman = useMutation({
    mutationFn: () => getPostman(origin),
    onSuccess: (data) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "oxxy-api.postman_collection.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const closeDrawer = () => {
    setDrawer(false);
    setNewKey(null);
    setName("");
    setExpiry("365");
    setFormError("");
  };

  const askRevoke = (k: ApiKeyRow) =>
    modal.confirm({
      title: `Revoke "${k.name}"?`,
      content:
        "Every system using this key (CRM, voice AI) stops working until it gets a new key. This cannot be undone.",
      okText: "Revoke key",
      okButtonProps: { danger: true },
      onOk: () => revoke.mutateAsync(k.id),
    });

  const ov = overview.data;
  const curl = `curl -H "X-Api-Key: <your key>" "${actionsBase}/Changes?after=0&limit=5"`;
  const insecure = origin.startsWith("http://") && !/localhost|127\.0\.0\.1/.test(origin);

  const guideButtons = (
    <>
      <button
        className="btn"
        onClick={() => downloadGuide(origin).catch((e: Error) => message.error(e.message))}
      >
        Download guide (HTML)
      </button>
      <button className="btn" onClick={() => postman.mutate()} disabled={postman.isPending}>
        Download Postman collection
      </button>
    </>
  );

  return (
    <>
      <div className="row">
        <Tabs<DevTab>
          value={tab}
          onChange={setTab}
          items={[
            ["setup", "Keys and setup"],
            ["docs", "API documentation"],
          ]}
        />
        <span className="spacer" />
        {guideButtons}
      </div>
      {tab === "docs" ? (
        <>
          <style>{DOC_CSS}</style>
          <div className="panel">
            <div className="panel-b">
              <ApiDocs base={origin} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <span className="small muted">
              What the client's developers need to connect their CRM or voice AI to the bot. Give
              keys and secrets through a password manager, never by WhatsApp or email. The full
              guide for their developers is on the API documentation tab.
            </span>
          </div>
          <ErrorNote error={overview.error ?? keys.error} />

          <div className="grid g3">
            <Stat
              label="Active API keys"
              value={ov ? ov.active_keys + (ov.env_key_set ? 1 : 0) : "…"}
              detail={
                ov?.env_key_set
                  ? "including the ACTIONS_API_KEY server key"
                  : "keys made on this page"
              }
            />
            <Stat
              label="How the CRM connects"
              value="Pull"
              detail="the CRM calls this API only: reads the changes feed, sends its updates"
            />
            <Stat
              label="Changes feed"
              value="GET /Changes"
              detail="poll every 30-60 s with the last seq; kept 90 days"
            />
          </div>

          <Panel title="Connection details" note="Same for every key">
            {insecure && (
              <p className="small" style={{ color: "var(--warn)" }}>
                This address is not HTTPS. Give the client an HTTPS address only.
              </p>
            )}
            <dl className="kv">
              <dt>Actions API base URL</dt>
              <dd>
                <CopyLine value={actionsBase} onCopied={copied} />
              </dd>
              <dt>Auth header</dt>
              <dd className="mono small">X-Api-Key: &lt;API key&gt;</dd>
              <dt>Reference</dt>
              <dd className="small">
                The API documentation tab (Download guide) and the Postman collection ·{" "}
                <a href={`${origin}/swagger`} target="_blank" rel="noreferrer">
                  Swagger
                </a>{" "}
                (development servers)
              </dd>
              <dt>Quick test</dt>
              <dd>
                <CopyLine value={curl} onCopied={copied} />
              </dd>
            </dl>
          </Panel>

          <Panel
            title="API keys"
            note="For the CRM, the voice AI and other back-end services"
            actions={
              <button className="btn pri" onClick={() => setDrawer(true)}>
                Generate key
              </button>
            }
            bodyless
          >
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Made</th>
                    <th>Expires</th>
                    <th>Last used</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(keys.data ?? []).map((k) => {
                    const [tone, label] = STATE_TONE[k.state];
                    return (
                      <tr key={k.id}>
                        <td>
                          <b>{k.name}</b>
                          {k.created_by_name && (
                            <div className="small muted">by {k.created_by_name}</div>
                          )}
                        </td>
                        <td className="mono small">{k.prefix}…</td>
                        <td>{fmtDate(k.issued_at)}</td>
                        <td>{k.expires_at ? fmtDate(k.expires_at) : "Never"}</td>
                        <td>{ago(k.last_used_at)}</td>
                        <td>
                          <Pill tone={tone}>{label}</Pill>
                        </td>
                        <td>
                          {k.state !== "revoked" && (
                            <button className="btn sm danger" onClick={() => askRevoke(k)}>
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {keys.data && keys.data.length === 0 && (
                <Empty>
                  No keys yet. Generate one per system and environment, e.g. "Zoho CRM - staging".
                </Empty>
              )}
            </div>
          </Panel>

          <Panel title="Postman collection" note="Every API call">
            <p className="small muted">
              Ready-made requests for the client's developers, with this server's address filled in.
              It has no keys in it: they paste their own.
            </p>
            <button className="btn" onClick={() => postman.mutate()} disabled={postman.isPending}>
              Download collection
            </button>
          </Panel>
        </>
      )}

      {drawer && (
        <Drawer title="Generate API key" onClose={closeDrawer}>
          {newKey ? (
            <div className="grid" style={{ gap: 12 }}>
              <Secret label={newKey.name} value={newKey.key} onCopied={copied} />
              <Field label="Test it">
                <CopyLine value={curl.replace("<your key>", newKey.key)} onCopied={copied} />
              </Field>
              <button className="btn pri" onClick={closeDrawer}>
                I have copied it
              </button>
            </div>
          ) : (
            <form
              className="grid"
              style={{ gap: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Name *" hint="Who uses it and where, e.g. Zoho CRM - production">
                <input
                  className="input"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field
                label="Expires"
                hint="A key that expires is safer; make a new one before it runs out"
              >
                <select
                  className="input"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                >
                  {(ov?.expiry_days ?? [30, 90, 180, 365]).map((d) => (
                    <option key={d} value={String(d)}>
                      In {d} days
                    </option>
                  ))}
                  <option value="never">Never</option>
                </select>
              </Field>
              {formError && (
                <span className="small" style={{ color: "var(--crit)" }}>
                  {formError}
                </span>
              )}
              <button className="btn pri" type="submit" disabled={create.isPending}>
                Generate key
              </button>
            </form>
          )}
        </Drawer>
      )}
    </>
  );
}
