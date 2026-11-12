import { Alert, Table, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { listPrivacyRequests } from "../api/crm.api";

export default function PrivacyRequests() {
  const query = useQuery({ queryKey: ["privacyRequests"], queryFn: listPrivacyRequests });

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Privacy & data requests
      </Typography.Title>
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Table
        rowKey="id"
        loading={query.isLoading}
        dataSource={query.data ?? []}
        columns={[
          { title: "Customer", key: "c", render: (_, r: any) => r.customer?.first_name ?? "-" },
          { title: "WhatsApp", key: "w", render: (_, r: any) => r.customer?.wa_number ?? r.customer_id },
          { title: "Requested at", dataIndex: "privacy_request_at" },
          {
            title: "Marketing",
            dataIndex: "marketing_consent",
            render: (v: boolean) => <Tag color={v ? "green" : "red"}>{v ? "Allowed" : "Stopped"}</Tag>,
          },
        ]}
      />
    </>
  );
}

