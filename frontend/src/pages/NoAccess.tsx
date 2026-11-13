import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { landingFor } from "../auth/roles";
import { usePermissions } from "../hooks/usePermissions";
import { usePageTitle } from "../components/ui";

export default function NoAccess() {
  usePageTitle("No access");
  const navigate = useNavigate();
  const { role } = useAuth();
  const { perms } = usePermissions();
  return (
    <div className="panel empty">
      <p>The {role ?? "current"} role cannot open this screen. Ask an Admin if you need it.</p>
      <button className="btn pri" onClick={() => navigate(landingFor(perms), { replace: true })}>
        Go to my home page
      </button>
    </div>
  );
}
