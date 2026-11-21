import { useEffect, useState } from "react";
import { Button, Form, Input, Select, Spin, Switch, message } from "antd";
import { Panel, Pill, usePageTitle } from "../components/ui";
import { getSettings, updateSettings, type SettingItem } from "../api/settings.api";
import { testMapsKey } from "../api/centres.api";
import ChatOpeningPanel from "../components/ChatOpeningPanel";

const GROUP_TITLES: Record<SettingItem["group"], string> = {
  whatsapp: "WhatsApp Cloud API",
  ai: "AI Provider & Model Keys",
  crm: "CRM push (optional; off = the client's CRM uses the Oxxy API)",
  timings: "Timings (applied at once; empty = default) [CONFIRM with Oxxy]",
  maps: "Maps (Google Maps Platform: nearby centres, distance, address lookup)",
  voice:
    "Voice AI (SharyX): a call 60 seconds after every new enquiry. Result webhook: /api/v1/Voice/Sharyx/Webhook",
};

export default function Settings() {
  usePageTitle("Configuration", "Admin");
  const [form] = Form.useForm();
  const [items, setItems] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "Test the key": one real call per Google API with the SAVED server key
  const [mapsTest, setMapsTest] = useState<Record<string, string> | null>(null);
  const [testing, setTesting] = useState(false);
  const runMapsTest = async () => {
    setTesting(true);
    try {
      setMapsTest(await testMapsKey());
    } catch (e) {
      message.error((e as Error)?.message || "The test could not run");
    } finally {
      setTesting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const list = await getSettings();
      setItems(list);
      const initial: Record<string, string | boolean> = {};
      for (const it of list) initial[it.key] = it.value;
      form.setFieldsValue(initial);
    } catch (e) {
      message.error((e as Error)?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // load once on open (async: the state is set after the request, not during the effect)
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async (values: Record<string, string | boolean>) => {
    setSaving(true);
    try {
      const res = await updateSettings(values);
      setItems(res.items);
      const next: Record<string, string | boolean> = {};
      for (const it of res.items) next[it.key] = it.value;
      form.setFieldsValue(next);
      message.success("Settings saved and applied immediately");
    } catch (e) {
      message.error((e as Error)?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const groups: SettingItem["group"][] = ["whatsapp", "ai", "timings", "voice", "crm", "maps"];

  // the AI model really in use (Claude, OpenAI or Gemini), from the saved settings below
  const val = (k: string) => String(items.find((i) => i.key === k)?.value ?? "");
  const ph = (k: string) => items.find((i) => i.key === k)?.placeholder ?? "";
  const PROVIDER: Record<string, [string, string]> = {
    claude: ["Claude (Anthropic)", "ANTHROPIC_MODEL"],
    openai: ["OpenAI", "OPENAI_MODEL"],
    gemini: ["Gemini (Google)", "GEMINI_MODEL"],
  };
  const modelOf = (p: string) =>
    PROVIDER[p]
      ? `${PROVIDER[p][0]} · ${val(PROVIDER[p][1]) || ph(PROVIDER[p][1]) || "default model"}`
      : "";
  // quiet hours as saved in Timings (defaults 9 and 21)
  const num = (k: string, d: number) => (val(k) ? Number(val(k)) : d);
  const proFrom = num("PROACTIVE_FROM", 9);
  const proUntil = num("PROACTIVE_UNTIL", 21);
  const pad = (h: number) => String(h).padStart(2, "0");
  const preferred = val("LLM_PROVIDER");
  const fallback = val("LLM_FALLBACK");
  const aiModel = loading
    ? "…"
    : (modelOf(preferred) || "Not set") +
      (fallback && fallback !== preferred ? `; fallback ${modelOf(fallback)}` : "; no fallback");

  return (
    <>
      <div className="grid g2">
        <Panel title="Booking window" note="Enforced in code and by a database trigger">
          <dl className="kv">
            <dt>Earliest</dt>
            <dd>Today + 3 calendar days (Asia/Kolkata)</dd>
            <dt>Latest</dt>
            <dd>Same date 6 months later; the month's last day if that date does not exist</dd>
            <dt>Status</dt>
            <dd>Always pending until a sales person confirms (here or through the API)</dd>
          </dl>
        </Panel>
        <Panel title="Fixed rules" note="Not editable">
          <dl className="kv">
            <dt>Emergency</dt>
            <dd>
              <span className="mono">112</span> / <span className="mono">108</span>, checked before
              the AI model
            </dd>
            <dt>Self-harm</dt>
            <dd>
              Tele-MANAS <span className="mono">14416</span>
            </dd>
            <dt>Quiet hours</dt>
            <dd>
              Proactive messages only {pad(proFrom)}:00–{pad(proUntil)}:00 IST (Timings below)
            </dd>
            <dt>AI model</dt>
            <dd className="small">{aiModel}</dd>
            <dt>Order</dt>
            <dd>Guardrails → AI draft → rule validator → send</dd>
          </dl>
        </Panel>
      </div>
      <ChatOpeningPanel />
      <div className="panel">
        <div className="panel-b small">
          Values saved here are stored in the database and used at once, without a restart. Saved
          secrets are shown masked (••••xxxx); leave them as they are to keep them. For production,
          prefer the cloud secret manager for keys.
        </div>
      </div>
      {loading ? (
        <Spin />
      ) : (
        <Form form={form} layout="vertical" onFinish={onSave} requiredMark={false}>
          <div className="grid" style={{ gap: 14 }}>
            {groups.map((grp) => (
              <Panel key={grp} title={GROUP_TITLES[grp]}>
                {grp === "maps" && (
                  <div className="small" style={{ marginBottom: 12 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Server key: enable Geocoding API, Routes API and Places API (New) in Google
                      Cloud, with billing on. Browser key: a second key with Maps JavaScript API,
                      restricted to this site's address. Save first, then test.
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={runMapsTest} loading={testing}>
                        Test the saved server key
                      </Button>
                      {mapsTest &&
                        (["geocoding", "routes", "places"] as const).map((k) => (
                          <span key={k} title={mapsTest[k]}>
                            <Pill tone={mapsTest[k] === "ok" ? "ok" : "crit"}>
                              {k === "geocoding"
                                ? "Geocoding"
                                : k === "routes"
                                  ? "Routes"
                                  : "Places"}
                              : {mapsTest[k] === "ok" ? "working" : mapsTest[k]}
                            </Pill>
                          </span>
                        ))}
                    </div>
                  </div>
                )}
                {items
                  .filter((i) => i.group === grp)
                  .map((item) => (
                    <Form.Item
                      key={item.key}
                      name={item.key}
                      valuePropName={item.type === "boolean" ? "checked" : "value"}
                      label={
                        <span className="row" style={{ gap: 8 }}>
                          <span>{item.label}</span>
                          <span className="mono small muted">{item.key}</span>
                          {item.type === "string" &&
                            (item.isSet ? (
                              <Pill tone="ok">Set</Pill>
                            ) : (
                              <Pill>{grp === "timings" ? "Default" : "Not set"}</Pill>
                            ))}
                        </span>
                      }
                    >
                      {item.type === "boolean" ? (
                        <Switch />
                      ) : item.type === "select" ? (
                        <Select options={item.options ?? []} style={{ maxWidth: 320 }} />
                      ) : item.secret ? (
                        <Input.Password placeholder={item.placeholder || "Enter secret value"} />
                      ) : (
                        <Input placeholder={item.placeholder || ""} />
                      )}
                    </Form.Item>
                  ))}
              </Panel>
            ))}
            <div className="row">
              <Button type="primary" htmlType="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </div>
        </Form>
      )}
    </>
  );
}
