import { useState } from "react";
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignableRoles,
  insertUser,
  listUsers,
  toggleUser,
  updateUser,
  type UserInput,
  type UserRow,
} from "../api/users.api";
import { useAuth } from "../hooks/useAuth";
import { ROLE } from "../auth/roles";

const KEY = ["users"];

export default function Users() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { role } = useAuth();
  const [form] = Form.useForm<UserInput>();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [open, setOpen] = useState(false);

  const users = useQuery({ queryKey: KEY, queryFn: listUsers });
  const roles = useQuery({ queryKey: ["roles", "assignable"], queryFn: assignableRoles });

  const done = async (msg: string) => {
    message.success(msg);
    setOpen(false);
    await qc.invalidateQueries({ queryKey: KEY });
  };

  const save = useMutation({
    mutationFn: (v: UserInput) => (editing ? updateUser(editing.id, v) : insertUser(v)),
    onSuccess: () => done(editing ? "User updated" : "User created"),
    onError: (e: Error) => message.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => toggleUser(id),
    onSuccess: () => done("Status changed"),
    onError: (e: Error) => message.error(e.message),
  });

  const openForm = (u: UserRow | null) => {
    setEditing(u);
    form.resetFields();
    if (u) {
      form.setFieldsValue({
        user_role_id: u.user_role_id,
        first_name: u.first_name ?? "",
        last_name: u.last_name ?? undefined,
        email: u.email,
        mobile: u.mobile ?? undefined,
      });
    }
    setOpen(true);
  };

  // Admins may only manage plain Users (the backend enforces this too)
  const canManage = (u: UserRow) => role === ROLE.SuperAdmin || u.user_role?.name === ROLE.User;

  const columns: TableColumnsType<UserRow> = [
    {
      title: "Name",
      key: "name",
      render: (_, u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || "-",
    },
    { title: "Email", dataIndex: "email" },
    { title: "Role", key: "role", render: (_, u) => <Tag color="blue">{u.user_role?.name ?? "-"}</Tag> },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: boolean) => (s ? <Tag color="green">Active</Tag> : <Tag color="red">Suspended</Tag>),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, u) =>
        canManage(u) ? (
          <Space>
            <Button size="small" onClick={() => openForm(u)}>
              Edit
            </Button>
            <Button
              size="small"
              danger={u.status}
              loading={toggle.isPending}
              onClick={() => toggle.mutate(u.id)}
            >
              {u.status ? "Suspend" : "Activate"}
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Users
        </Typography.Title>
        <Button type="primary" onClick={() => openForm(null)}>
          Add user
        </Button>
      </Space>
      {users.isError && <Alert type="error" showIcon message={(users.error as Error).message} />}
      <Table<UserRow> rowKey="id" columns={columns} dataSource={users.data} loading={users.isLoading} />
      <Modal
        title={editing ? "Edit user" : "Add user"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form<UserInput> form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item label="Role" name="user_role_id" rules={[{ required: true }]}>
            <Select options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item label="First name" name="first_name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Last name" name="last_name">
            <Input />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: "email" }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          {!editing && (
            <Form.Item label="Password" name="password" rules={[{ required: true, min: 6 }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
          <Form.Item label="Mobile" name="mobile">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
