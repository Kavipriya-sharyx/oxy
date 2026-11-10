import { Alert, App, Button, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmBooking, getPendingBookings } from "../api/bookings.api";
import type { Booking } from "../types";

const QUERY_KEY = ["bookings", "pending"];

export default function Bookings() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getPendingBookings });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmBooking(id),
    onSuccess: async () => {
      message.success("Booking confirmed");
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const columns: TableColumnsType<Booking> = [
    { title: "Customer", key: "customer", render: (_, b) => b.customer?.first_name ?? "-" },
    { title: "WhatsApp", key: "wa", render: (_, b) => b.customer?.wa_number ?? "-" },
    {
      title: "Centre",
      key: "centre",
      render: (_, b) =>
        b.centre ? `${b.centre.name}${b.centre.branch ? `, ${b.centre.branch}` : ""}` : "-",
    },
    {
      title: "Specialisation",
      dataIndex: "specialisation",
      render: (v: string | null) => v ?? "-",
    },
    { title: "Preferred date", dataIndex: "preferred_date" },
    {
      title: "Preferred time",
      dataIndex: "preferred_time",
      render: (v: string | null) => v ?? "-",
    },
    {
      title: "Status",
      dataIndex: "booking_status",
      render: (v: string) => <Tag color="orange">{v.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_, b) => (
        <Button
          type="primary"
          loading={confirm.isPending && confirm.variables === b.id}
          onClick={() => confirm.mutate(b.id)}
        >
          Confirm
        </Button>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Bookings
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Booking is pending until the sales team confirms"
        style={{ marginBottom: 16 }}
      />
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Table<Booking>
        rowKey="id"
        columns={columns}
        dataSource={query.data ?? []}
        loading={query.isLoading}
        scroll={{ x: true }}
      />
    </>
  );
}
