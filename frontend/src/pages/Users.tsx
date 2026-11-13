import { useState } from "react";
import { App, Button, Form, Input, Select } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignableRoles,
  insertUser,
  listUsers,
  toggleUser,
  deleteUser,
  updateUser,
  type UserInput,
  type UserRow,
} from "../api/users.api";
import { useAuth } from "../hooks/useAuth";
import { ROLE } from "../auth/roles";
import { Drawer, Empty, ErrorNote, Pill, usePageTitle } from "../components/ui";

const KEY = ["users"];

export default function Users() {
  usePageTitle("Users", "Admin");
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

  // Super Admins can only be changed by a Super Admin (the backend enforces this too)
  const canManage = (u: UserRow) =>
    role === ROLE.SuperAdmin || u.user_role?.name !== ROLE.SuperAdmin;
  const { modal } = App.useApp();
  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => done("User deleted"),
    onError: (e: Error) => message.error(e.message),
  });
  const askDelete = (u: UserRow) =>
    modal.confirm({
      title: `Delete ${u.email}?`,
      content:
        "This cannot be undone. If the user already confirmed bookings or owns tasks, suspend them instead.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => remove.mutateAsync(u.id),
    });

  return (
    <>
      <div className="row">
        <span className="small muted">
          {users.data?.length ?? 0} staff accounts. Customers never get a console login.
        </span>
        <span className="spacer" />
        <button className="btn pri" onClick={() => openForm(null)}>
          Add user
        </button>
      </div>
      <ErrorNote error={users.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</b>
                    <div className="small muted">{u.email}</div>
                  </td>
                  <td>{u.user_role?.name ?? "—"}</td>
                  <td>{u.status ? <Pill tone="ok">Active</Pill> : <Pill>Suspended</Pill>}</td>
                  <td>
                    {canManage(u) && (
                      <div
                        className="row"
                        style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}
                      >
                        <button className="btn sm" onClick={() => openForm(u)}>
                          Edit
                        </button>
                        <button
                          className="btn sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(u.id)}
                        >
                          {u.status ? "Suspend" : "Activate"}
                        </button>
                        <button className="btn sm danger" onClick={() => askDelete(u)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.isLoading && <Empty>Loading…</Empty>}
        </div>
      </div>
      {open && (
        <Drawer title={editing ? "Edit user" : "Add user"} onClose={() => setOpen(false)}>
          <Form<UserInput>
            form={form}
            layout="vertical"
            onFinish={(v) => save.mutate(v)}
            requiredMark={false}
          >
            <Form.Item label="Role" name="user_role_id" rules={[{ required: true }]}>
              <Select options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
            </Form.Item>
            <Form.Item label="First name" name="first_name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Last name" name="last_name">
              <Input />
            </Form.Item>
            <Form.Item label="Work email" name="email" rules={[{ required: true, type: "email" }]}>
              <Input disabled={!!editing} />
            </Form.Item>
            {!editing && (
              <Form.Item label="Password" name="password" rules={[{ required: true, min: 8 }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            )}
            <Form.Item label="Mobile" name="mobile">
              <Input />
            </Form.Item>
            <div className="row">
              <Button type="primary" htmlType="submit" loading={save.isPending}>
                Save
              </Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </Form>
        </Drawer>
      )}
    </>
  );
}
