import { useState } from "react";
import { Alert, App, Button, Card, Descriptions, Empty, Input, List, Space, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  handBackConversation,
  listConversations,
  listMessages,
  replyToConversation,
  takeOverConversation,
} from "../api/conversations.api";
import type { Conversation, Message } from "../types";

const STATE_COLOR: Record<string, string> = {
  pause: "red",
  escalated: "orange",
  opted_out: "default",
  booking_recorded: "green",
};

export default function LiveChat() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");

  const convsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
    refetchInterval: 5000,
  });

  const convs = (convsQuery.data ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.customer?.first_name ?? "").toLowerCase().includes(q) ||
      (c.customer?.wa_number ?? "").toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    );
  });

  const active: Conversation | undefined =
    convs.find((c) => c.id === selectedId) ?? convs[0];

  const msgsQuery = useQuery({
    queryKey: ["messages", active?.id],
    queryFn: () => listMessages(active!.id),
    enabled: !!active?.id,
    refetchInterval: 4000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (active?.id) await queryClient.invalidateQueries({ queryKey: ["messages", active.id] });
  };

  const takeOver = useMutation({
    mutationFn: (id: string) => takeOverConversation(id),
    onSuccess: async () => {
      message.success("Conversation paused for agent");
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const handBack = useMutation({
    mutationFn: (id: string) => handBackConversation(id),
    onSuccess: async () => {
      message.success("Handed back to bot");
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const sendReply = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => replyToConversation(id, body),
    onSuccess: async () => {
      setDraft("");
      await refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const isPausedOrEscalated = active?.state === "pause" || active?.state === "escalated";

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Live chat
      </Typography.Title>
      {convsQuery.isError && (
        <Alert type="error" showIcon message={convsQuery.error.message} style={{ marginBottom: 16 }} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 280px", gap: 16, minHeight: 540 }}>
        <Card
          title="Conversations"
          size="small"
          bodyStyle={{ padding: 8, maxHeight: 540, overflowY: "auto" }}
        >
          <Input.Search
            placeholder="Search name, phone, state"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
            allowClear
          />
          <List
            loading={convsQuery.isLoading}
            dataSource={convs}
            renderItem={(c) => (
              <List.Item
                onClick={() => setSelectedId(c.id)}
                style={{
                  cursor: "pointer",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: c.id === active?.id ? "#e6f4ff" : undefined,
                }}
              >
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <Typography.Text strong ellipsis>
                      {c.customer?.first_name || c.customer?.wa_number || c.customer_id}
                    </Typography.Text>
                    <Tag color={STATE_COLOR[c.state] ?? "blue"}>{c.state}</Tag>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {c.customer?.wa_number}
                  </Typography.Text>
                </div>
              </List.Item>
            )}
          />
        </Card>

        <Card
          title={
            active
              ? `${active.customer?.first_name || "Customer"} (${active.customer?.wa_number ?? "-"})`
              : "Messages"
          }
          size="small"
          extra={
            active && (
              <Space>
                {!isPausedOrEscalated ? (
                  <Button
                    type="primary"
                    danger
                    size="small"
                    loading={takeOver.isPending}
                    onClick={() => takeOver.mutate(active.id)}
                  >
                    Take over
                  </Button>
                ) : (
                  <Button
                    size="small"
                    loading={handBack.isPending}
                    onClick={() => handBack.mutate(active.id)}
                  >
                    Hand back to bot
                  </Button>
                )}
              </Space>
            )
          }
          bodyStyle={{ display: "flex", flexDirection: "column", height: 500, padding: 12 }}
        >
          {!active ? (
            <Empty description="Select a conversation" />
          ) : (
            <>
              <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
                {(msgsQuery.data ?? []).map((m: Message) => {
                  const isIn = m.direction === "in";
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: isIn ? "flex-start" : "flex-end",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: isIn ? "#f5f5f5" : "#d9f7be",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                          {m.sender}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          {m.body || (m.template_name ? `[Template: ${m.template_name}]` : "[Non-text]")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  placeholder="Type a WhatsApp reply (within 24h window)..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPressEnter={() => {
                    if (draft.trim()) sendReply.mutate({ id: active.id, body: draft.trim() });
                  }}
                />
                <Button
                  type="primary"
                  loading={sendReply.isPending}
                  disabled={!draft.trim()}
                  onClick={() => sendReply.mutate({ id: active.id, body: draft.trim() })}
                >
                  Send
                </Button>
              </Space.Compact>
            </>
          )}
        </Card>

        <Card title="Customer details" size="small">
          {!active ? (
            <Empty description="No selection" />
          ) : (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Name">{active.customer?.first_name ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="WhatsApp">{active.customer?.wa_number ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Language">{active.customer?.language ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Age">{active.customer?.age ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="State">
                <Tag color={STATE_COLOR[active.state] ?? "blue"}>{active.state}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Product">
                {active.customer?.active_product ?? active.selected_product ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Recommended">
                {active.recommended_plan ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="CRM ID">
                {active.customer?.crm_customer_id ?? "Pending sync"}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      </div>
    </>
  );
}
