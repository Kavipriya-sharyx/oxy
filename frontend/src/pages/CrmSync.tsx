import { Alert, App, Button, Table, Tabs, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listOutbox, listWebhooks, retryOutbox } from "../api/crm.api";
import type { CrmOutboxRow, CrmWebhookEvent } from "../types";

const STATUS_COLOR: Record<string, string> = {
  sent: "green",
  pending: "blue",
  failed: "orange",
  dead: "red",
};

export default function CrmSync() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const outboxQuery = useQuery({ queryKey: ["crm", "outbox"], queryFn: listOutbox });
  const webhooksQuery = useQuery({ queryKey: ["crm", "webhooks"], queryFn: listWebhooks });

  const retry = useMutation({
    mutationFn: (id: string) => retryOutbox(id),
    onSuccess: async () => {
      message.success("Outbox item queued for retry");
      await queryClient.invalidateQueries({ queryKey: ["crm", "outbox"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const outboxColumns: TableColumnsType<CrmOutboxRow> = [
    { title: "Action", dataIndex: "action" },
    {
      title: "Status",
      dataIndex: "sync_status",
      render: (v: string) => <Tag color={STATUS_COLOR[v] ?? "default"}>{v}</Tag>,
    },
    { title: "Attempts", dataIndex: "attempts" },
    { title: "CRM ID", dataIndex: "crm_record_id", render: (v: string | null) => v ?? "-" },
    {
      title: "Last error",
      dataIndex: "last_error",
      ellipsis: true,
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "Action",
      key: "retry",
      render: (_, r) =>
        r.sync_status === "failed" || r.sync_status === "dead" ? (
          <Button
            size="small"
            type="primary"
            loading={retry.isPending && retry.variables === r.id}
            onClick={() => retry.mutate(r.id)}
          >
            Retry now
          </Button>
        ) : (
          "-"
        ),
    },
  ];

  const webhookColumns: TableColumnsType<CrmWebhookEvent> = [
    { title: "Event ID", dataIndex: "event_id" },
    { title: "Type", dataIndex: "event_type", render: (v: string) => <Tag>{v}</Tag> },
    {
      title: "Processed at",
      dataIndex: "processed_at",
      render: (v: string | null) => v ?? "Pending",
    },
    { title: "Error", dataIndex: "error", ellipsis: true, render: (v: string | null) => v ?? "-" },
  ];

  return (
    <>
      <Typography.Title level={3} className="page-title">
        CRM sync
      </Typography.Title>
      {(outboxQuery.isError || webhooksQuery.isError) && (
        <Alert
          type="error"
          showIcon
          message={outboxQuery.error?.message || webhooksQuery.error?.message}
          style={{ marginBottom: 16 }}
        />
      )}
      <Tabs
        items={[
          {
            key: "outbox",
            label: "Outbox queue",
            children: (
              <Table<CrmOutboxRow>
                rowKey="id"
                columns={outboxColumns}
                dataSource={outboxQuery.data ?? []}
                loading={outboxQuery.isLoading}
                scroll={{ x: true }}
              />
            ),
          },
          {
            key: "webhooks",
            label: "Webhook log",
            children: (
              <Table<CrmWebhookEvent>
                rowKey="event_id"
                columns={webhookColumns}
                dataSource={webhooksQuery.data ?? []}
                loading={webhooksQuery.isLoading}
                scroll={{ x: true }}
              />
            ),
          },
        ]}
      />
    </>
  );
}

