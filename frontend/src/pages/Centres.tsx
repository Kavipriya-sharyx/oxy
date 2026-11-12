import { useState } from "react";
import { Alert, App, Button, Input, Modal, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { importCentres, listCentres } from "../api/centres.api";
import type { Centre } from "../types";

export default function Centres() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("name,branch,locality,city,latitude,longitude,specialisations\n");

  const query = useQuery({ queryKey: ["centres"], queryFn: listCentres });

  const importer = useMutation({
    mutationFn: () => {
      const lines = csv.trim().split(/\r?\n/).filter(Boolean);
      const [header, ...data] = lines;
      const cols = header.split(",").map((c) => c.trim());
      const rows = data.map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const obj: Record<string, unknown> = {};
        cols.forEach((c, i) => {
          obj[c] = vals[i] ?? "";
        });
        return obj;
      });
      return importCentres(rows);
    },
    onSuccess: async (res) => {
      message.success(`Imported ${res.created} centres`);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["centres"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const columns: TableColumnsType<Centre> = [
    { title: "Name", dataIndex: "name" },
    { title: "Branch", dataIndex: "branch", render: (v: string | null) => v ?? "-" },
    { title: "Locality", dataIndex: "locality", render: (v: string | null) => v ?? "-" },
    { title: "City", dataIndex: "city" },
    {
      title: "Specialisations",
      dataIndex: "specialisations",
      render: (v: string[] | null) =>
        (v ?? []).map((s) => (
          <Tag key={s} style={{ marginBottom: 2 }}>
            {s}
          </Tag>
        )),
    },
    {
      title: "Verified",
      dataIndex: "verified",
      render: (v: boolean) => <Tag color={v ? "green" : "orange"}>{v ? "Verified" : "Unverified"}</Tag>,
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={3} className="page-title" style={{ margin: 0 }}>
          Centres
        </Typography.Title>
        <Button type="primary" onClick={() => setOpen(true)}>
          Import CSV
        </Button>
      </div>
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Table<Centre>
        rowKey="id"
        columns={columns}
        dataSource={query.data ?? []}
        loading={query.isLoading}
        scroll={{ x: true }}
      />
      <Modal
        title="Import centres (CSV)"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => importer.mutate()}
        confirmLoading={importer.isPending}
      >
        <Typography.Paragraph type="secondary">
          Paste CSV rows (use | between specialisations, e.g. cardiology|orthopaedics).
        </Typography.Paragraph>
        <Input.TextArea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
      </Modal>
    </>
  );
}
