import { Alert, Table, Tabs, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { getTriggers } from "../api/crm.api";

export default function Triggers() {
  const query = useQuery({ queryKey: ["triggers"], queryFn: getTriggers });

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Triggers A–R
      </Typography.Title>
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Tabs
        items={[
          {
            key: "catalog",
            label: "Trigger rules (A–R)",
            children: (
              <Table
                rowKey="id"
                loading={query.isLoading}
                dataSource={query.data?.catalog ?? []}
                pagination={false}
                columns={[
                  { title: "ID", dataIndex: "id", render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: "Name", dataIndex: "name" },
                  { title: "Fires when", dataIndex: "when" },
                ]}
              />
            ),
          },
          {
            key: "events",
            label: "Fired events",
            children: (
              <Table
                rowKey="id"
                loading={query.isLoading}
                dataSource={query.data?.events ?? []}
                columns={[
                  { title: "Trigger", dataIndex: "trigger_id", render: (v: string) => <Tag>{v}</Tag> },
                  { title: "Customer", key: "c", render: (_, r: any) => r.customer?.wa_number ?? r.customer_id },
                  { title: "Reason", dataIndex: "reason" },
                  { title: "Suppression", dataIndex: "suppression_reason", render: (v: string | null) => v ?? "-" },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}

