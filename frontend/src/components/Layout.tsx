import { Button, Layout as AntLayout, Menu, Tag, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const { Sider, Header, Content } = AntLayout;

const ALL_ITEMS = [
  { key: "/live-chat", label: "Live chat", roles: ["agent", "supervisor", "admin", "super admin"] },
  { key: "/bookings", label: "Bookings", roles: ["agent", "supervisor", "admin", "super admin"] },
  { key: "/centres", label: "Centres", roles: ["agent", "supervisor", "admin", "super admin"] },
  { key: "/plan-catalog", label: "Plan catalogue", roles: ["agent", "supervisor", "admin", "super admin"] },
  { key: "/reports", label: "Reports", roles: ["supervisor", "admin", "super admin"] },
  { key: "/triggers", label: "Triggers A–R", roles: ["admin", "super admin"] },
  { key: "/crm-sync", label: "CRM sync", roles: ["supervisor", "admin", "super admin"] },
  { key: "/privacy", label: "Privacy requests", roles: ["admin", "super admin"] },
  { key: "/audit-log", label: "Audit log", roles: ["admin", "super admin"] },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, role, logout } = useAuth();
  const items = ALL_ITEMS.filter((i) => !role || i.roles.includes(role.toLowerCase())).map(
    ({ key, label }) => ({ key, label }),
  );

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0} style={{ minHeight: "100vh" }}>
        <Typography.Title
          level={4}
          style={{ color: "#fff", textAlign: "center", margin: "16px 0" }}
        >
          Oxxy
        </Typography.Title>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: "#fff",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 12,
          }}
        >
          {role && <Tag color="blue">{role}</Tag>}
          {email && <Typography.Text>{email}</Typography.Text>}
          <Button onClick={onLogout}>Logout</Button>
        </Header>
        <Content style={{ margin: 24, flex: 1 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
