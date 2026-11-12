import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Space, Spin, Switch, Tag, Typography, message } from "antd";
import { getSettings, updateSettings, type SettingItem } from "../api/settings.api";

const GROUP_TITLES: Record<SettingItem["group"], string> = {
  whatsapp: "WhatsApp Cloud API",
  ai: "AI Provider & Model Keys",
  crm: "In-house CRM Sync",
};

export default function Settings() {
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
    } catch (e: any) {
      message.error(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
    } catch (e: any) {
      message.error(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const groups: SettingItem["group"][] = ["whatsapp", "ai", "crm"];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 860 }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Settings &amp; API Configuration
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Database-backed runtime configuration"
        description="Values saved here are stored in PostgreSQL and applied immediately without editing .env or restarting the server. Existing secrets appear masked (••••xxxx); leave them as-is to keep the saved secret."
      />
      {loading ? (
        <Spin />
      ) : (
        <Form form={form} layout="vertical" onFinish={onSave}>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {groups.map((grp) => {
              const groupItems = items.filter((i) => i.group === grp);
              return (
                <Card key={grp} title={GROUP_TITLES[grp]}>
                  {groupItems.map((item) => (
                    <Form.Item
                      key={item.key}
                      name={item.key}
                      valuePropName={item.type === "boolean" ? "checked" : "value"}
                      label={
                        <Space>
                          <span>{item.label}</span>
                          <Typography.Text type="secondary" code>
                            {item.key}
                          </Typography.Text>
                          {item.type !== "boolean" && (
                            <Tag color={item.isSet ? "green" : "default"}>
                              {item.isSet ? "Configured" : "Not set"}
                            </Tag>
                          )}
                        </Space>
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
                </Card>
              );
            })}
            <Button type="primary" htmlType="submit" loading={saving} size="large">
              Save Settings
            </Button>
          </Space>
        </Form>
      )}
    </Space>
  );
}

