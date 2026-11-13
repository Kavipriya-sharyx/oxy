import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { landingFor } from "../auth/roles";

export default function NoAccess() {
  const navigate = useNavigate();
  const { role } = useAuth();
  return (
    <Result
      status="403"
      title="No access"
      subTitle="Your role does not have permission to open this page."
      extra={
        <Button type="primary" onClick={() => navigate(landingFor(role), { replace: true })}>
          Go to my home page
        </Button>
      }
    />
  );
}
