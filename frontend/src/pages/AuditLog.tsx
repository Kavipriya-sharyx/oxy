import { useState } from "react";
import { Alert, Input, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "../api/crm.api";
import type { AuditLogRow } from "../types";

export default function AuditLog() {
  const [action, setAction] = useState("");
  const [table, setTable] = useState("");

  const query = useQuery({
    queryKey: ["auditLogs", action, table],
    queryFn: () => listAuditLogs(action || undefined, table || undefined),
  });

  const columns: TableColumnsType<AuditLogRow> = [
    { title: "Time", dataIndex: "created_on" },
    { title: "Action", dataIndex: "action", render: (v: string) => <Tag>{v}</Tag> },
    { title: "Table", dataIndex: "table_name" },
    { title: "Record ID", dataIndex: "record_id" },
  ];

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Audit log
      </Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Filter by action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          allowClear
        />
        <Input
          placeholder="Filter by table"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          allowClear
        />
      </Space>
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Table<AuditLogRow>
        rowKey="id"
        columns={columns}
        dataSource={query.data ?? []}
        loading={query.isLoading}
        scroll={{ x: true }}
      />
    </>
  );
}

