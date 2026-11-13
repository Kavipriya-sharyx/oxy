import { useState } from "react";
import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
  type RoleRow,
} from "../api/roles.api";
import { Drawer, Empty, ErrorNote, Field, Pill, usePageTitle } from "../components/ui";

export default function Roles() {
  usePageTitle("Roles and permissions", "Admin");
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const perms = useQuery({ queryKey: ["permissionCatalog"], queryFn: listPermissions });
  const roles = useQuery({ queryKey: ["roles", "all"], queryFn: listRoles });
  const [form, setForm] = useState<{ id?: string; name: string; copy_from: string } | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["roles"] });
    await qc.invalidateQueries({ queryKey: ["myPermissions"] });
  };
  const onError = (e: Error) => message.error(e.message);
  const toggle = useMutation({
    mutationFn: ({ role, key }: { role: RoleRow; key: string }) =>
      updateRole(role.id, {
        permissions: role.permissions.includes(key)
          ? role.permissions.filter((k) => k !== key)
          : [...role.permissions, key],
      }),
    onSuccess: refresh,
    onError,
  });
  const save = useMutation({
    mutationFn: async (f: { id?: string; name: string; copy_from: string }): Promise<unknown> =>
      f.id
        ? updateRole(f.id, { name: f.name })
        : createRole({ name: f.name, copy_from: f.copy_from || undefined }),
    onSuccess: async (_r, f) => {
      message.success(
        f.id ? "Role renamed" : "Role added. Click a cell to allow or block a permission.",
      );
      setForm(null);
      setError("");
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteRole,
    onSuccess: async () => {
      message.success("Role deleted");
      await refresh();
    },
    onError,
  });
  const askDelete = (r: RoleRow) =>
    modal.confirm({
      title: `Delete the role “${r.name}”?`,
      content: r.users
        ? `${r.users} user(s) still have it. Move them to another role first.`
        : "This cannot be undone.",
      okText: "Delete",
      okButtonProps: { danger: true, disabled: r.users > 0 },
      onOk: () => remove.mutateAsync(r.id),
    });

  const list = roles.data ?? [];
  const groups = [...new Set((perms.data ?? []).map((p) => p.group))];

  return (
    <>
      <div className="row">
        <span className="small muted">
          Click a cell to allow or block. Super Admin always has everything. Built-in roles cannot
          be renamed or deleted, and nobody can remove “Add roles and change permissions” from their
          own role.
        </span>
        <span className="spacer" />
        <button className="btn pri" onClick={() => setForm({ name: "", copy_from: "" })}>
          Add role
        </button>
      </div>
      <ErrorNote error={roles.error || perms.error} />
      <div className="panel">
        <div className="tbl-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Permission</th>
                {list.map((r) => (
                  <th key={r.id}>
                    {r.name}
                    <div
                      className="small muted"
                      style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                    >
                      {r.users} user{r.users === 1 ? "" : "s"}
                    </div>
                    {!r.builtIn && (
                      <div
                        className="row"
                        style={{ gap: 4, justifyContent: "center", marginTop: 4 }}
                      >
                        <button
                          className="btn sm"
                          onClick={() => setForm({ id: r.id, name: r.name, copy_from: "" })}
                        >
                          Rename
                        </button>
                        <button className="btn sm danger" onClick={() => askDelete(r)}>
                          Delete
                        </button>
                      </div>
                    )}
                    {r.locked && (
                      <div style={{ marginTop: 4 }}>
                        <Pill>Locked</Pill>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={`g-${g}`}>
                  <td
                    colSpan={list.length + 1}
                    className="eyebrow"
                    style={{ background: "var(--sunk)" }}
                  >
                    {g}
                  </td>
                </tr>,
                ...(perms.data ?? [])
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <tr key={p.key}>
                      <td>
                        {p.label}
                        <div className="mono small muted">{p.key}</div>
                      </td>
                      {list.map((r) => {
                        const on = r.permissions.includes(p.key);
                        return (
                          <td key={r.id}>
                            <button
                              className="btn sm"
                              style={{ minWidth: 34, justifyContent: "center" }}
                              disabled={r.locked || toggle.isPending}
                              aria-pressed={on}
                              aria-label={`${r.name}: ${p.label} ${on ? "allowed" : "not allowed"}`}
                              onClick={() => toggle.mutate({ role: r, key: p.key })}
                            >
                              {on ? (
                                <span className="tick">✓</span>
                              ) : (
                                <span className="cross">–</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
          {(roles.isLoading || perms.isLoading) && <Empty>Loading…</Empty>}
        </div>
      </div>

      {form && (
        <Drawer
          title={form.id ? "Rename role" : "Add role"}
          onClose={() => {
            setForm(null);
            setError("");
          }}
        >
          <form
            className="grid"
            style={{ gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label="Role name">
              <input
                className="input"
                required
                minLength={2}
                maxLength={40}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            {!form.id && (
              <Field
                label="Start with the permissions of"
                hint="You can change every permission afterwards"
              >
                <select
                  className="input"
                  value={form.copy_from}
                  onChange={(e) => setForm({ ...form, copy_from: e.target.value })}
                >
                  <option value="">No permissions</option>
                  {list.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {error && (
              <div className="small" role="alert" style={{ color: "var(--crit)", fontWeight: 600 }}>
                {error}
              </div>
            )}
            <div className="row">
              <button className="btn pri" disabled={save.isPending}>
                Save
              </button>
              <button type="button" className="btn" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}
