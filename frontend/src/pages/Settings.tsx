import { useEffect, useState } from "react";
import { Button, Form, Input, Spin, Switch, message } from "antd";
import { Panel, Pill, usePageTitle } from "../components/ui";
import { getSettings, updateSettings, type SettingItem } from "../api/settings.api";

const GROUP_TITLES: Record<SettingItem["group"], string> = {
  whatsapp: "WhatsApp Cloud API",
  ai: "AI Provider & Model Keys",
  crm: "In-house CRM Sync",
};

export default function Settings() {
  usePageTitle("Configuration", "Admin");
  const [form] = Form.useForm();
  const [items, setItems] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const groups: SettingItem["group"][] = ["whatsapp", "ai", "crm"];

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
            <dd>Always pending until the sales team confirms in the CRM</dd>
          </dl>
        </Panel>
        <Panel title="Fixed rules" note="Not editable">
          <dl className="kv">
            <dt>Emergency</dt>
            <dd>
              <span className="mono">112</span> / <span className="mono">108</span>, checked before
              Claude
            </dd>
            <dt>Self-harm</dt>
            <dd>
              Tele-MANAS <span className="mono">14416</span>
            </dd>
            <dt>Quiet hours</dt>
            <dd>Proactive messages only 09:00–21:00 IST</dd>
            <dt>AI model</dt>
            <dd className="mono small">claude-opus-5-5</dd>
            <dt>Order</dt>
            <dd>Guardrails → Claude draft → rule validator → send</dd>
          </dl>
        </Panel>
      </div>
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
                          {item.type !== "boolean" &&
                            (item.isSet ? <Pill tone="ok">Set</Pill> : <Pill>Not set</Pill>)}
                        </span>
                      }
                    >
                      {item.type === "boolean" ? (
                        <Switch />
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
