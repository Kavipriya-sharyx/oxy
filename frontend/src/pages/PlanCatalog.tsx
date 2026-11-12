import { Alert, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useQuery } from "@tanstack/react-query";
import { listPlanCatalog } from "../api/planCatalog.api";
import type { PlanCatalog as PlanRow } from "../types";

export default function PlanCatalog() {
  const query = useQuery({ queryKey: ["planCatalog"], queryFn: listPlanCatalog });

  const columns: TableColumnsType<PlanRow> = [
    { title: "Product", dataIndex: "product", render: (v: string) => <Tag>{v}</Tag> },
    { title: "Plan", dataIndex: "plan" },
    { title: "Billing", dataIndex: "billing" },
    { title: "Price (excl. GST)", dataIndex: "price", render: (v: number) => `₹${v}` },
    {
      title: "GST",
      dataIndex: "gst_rate",
      render: (v: number) => `${Math.round(Number(v) * 100)}%`,
    },
    {
      title: "Max saving %",
      dataIndex: "max_saving_pct",
      render: (v: number | null) => (v != null ? `${v}%` : "-"),
    },
    {
      title: "Age limit",
      dataIndex: "age_limit",
      render: (v: number | null) => (v != null ? `Up to ${v}` : "No limit"),
    },
    {
      title: "Auto renews",
      dataIndex: "auto_renews",
      render: (v: boolean) => (v ? "Yes" : "No"),
    },
  ];

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Plan catalogue
      </Typography.Title>
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Table<PlanRow>
        rowKey="id"
        columns={columns}
        dataSource={query.data ?? []}
        loading={query.isLoading}
        scroll={{ x: true }}
      />
    </>
  );
}
