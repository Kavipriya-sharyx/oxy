import { Button, Layout as AntLayout, Menu, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const { Sider, Header, Content } = AntLayout;

const items = [
  { key: "/live-chat", label: "Live chat" },
  { key: "/bookings", label: "Bookings" },
  { key: "/centres", label: "Centres" },
  { key: "/plan-catalog", label: "Plan catalogue" },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, logout } = useAuth();

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AntLayout style={{ minHeight: "100%" }}>
      <Sider breakpoint="lg" collapsedWidth={0}>
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
          {email && <Typography.Text>{email}</Typography.Text>}
          <Button onClick={onLogout}>Logout</Button>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
