import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { login as loginRequest } from "../api/auth.api";
import { useAuth } from "../hooks/useAuth";

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const navigate = useNavigate();
  const { isLoggedIn, login } = useAuth();

  const mutation = useMutation({
    mutationFn: (v: LoginForm) => loginRequest(v.email, v.password),
    onSuccess: (token) => {
      login(token);
      navigate("/bookings", { replace: true });
    },
  });

  if (isLoggedIn && !mutation.isSuccess) return <Navigate to="/bookings" replace />;

  return (
    <div className="login-wrap">
      <Card className="login-card">
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Oxxy Sales Console
        </Typography.Title>
        {mutation.isError && (
          <Alert
            type="error"
            showIcon
            message={mutation.error.message}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form<LoginForm> layout="vertical" onFinish={(v) => mutation.mutate(v)}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Enter your password" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={mutation.isPending}>
            Log in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
