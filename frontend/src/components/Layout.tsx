import { Button, Layout as AntLayout, Menu, Tag, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ROUTE_ROLES } from "../auth/roles";

const { Sider, Header, Content } = AntLayout;

const ALL_ITEMS = [
  { key: "/live-chat", label: "Live chat" },
  { key: "/bookings", label: "Bookings" },
  { key: "/centres", label: "Centres" },
  { key: "/plan-catalog", label: "Plan catalogue" },
  { key: "/reports", label: "Reports" },
  { key: "/triggers", label: "Triggers A–R" },
  { key: "/crm-sync", label: "CRM sync" },
  { key: "/users", label: "Users" },
  { key: "/privacy", label: "Privacy requests" },
  { key: "/audit-log", label: "Audit log" },
  { key: "/settings", label: "Settings" },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, role, logout } = useAuth();
  const items = ALL_ITEMS.filter((i) => !!role && ROUTE_ROLES[i.key]?.includes(role));

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
