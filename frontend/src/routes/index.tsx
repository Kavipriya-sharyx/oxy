import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import Login from "../pages/Login";
import LiveChat from "../pages/LiveChat";
import Bookings from "../pages/Bookings";
import Centres from "../pages/Centres";
import PlanCatalog from "../pages/PlanCatalog";
import CrmSync from "../pages/CrmSync";
import AuditLog from "../pages/AuditLog";
import Reports from "../pages/Reports";
import Triggers from "../pages/Triggers";
import PrivacyRequests from "../pages/PrivacyRequests";
import Settings from "../pages/Settings";
import Developer from "../pages/Developer";
import FollowUps from "../pages/FollowUps";
import Templates from "../pages/Templates";
import GoLive from "../pages/GoLive";
import Content from "../pages/Content";
import Users from "../pages/Users";
import NoAccess from "../pages/NoAccess";
import Dashboard from "../pages/Dashboard";
import Flows from "../pages/Flows";
import Escalations from "../pages/Escalations";
import Activations from "../pages/Activations";
import { ROUTE_PERMS, landingFor } from "../auth/roles";
import { usePermissions } from "../hooks/usePermissions";
import Roles from "../pages/Roles";
import { useAuth } from "../hooks/useAuth";
import type { ReactElement } from "react";

const guard = (path: string, el: ReactElement) => (
  <ProtectedRoute perm={ROUTE_PERMS[path]}>{el}</ProtectedRoute>
);

// After sign-in (and for unknown URLs): the first page this user's permissions allow
function Landing() {
  const { isLoggedIn } = useAuth();
  const { loading, perms } = usePermissions();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (loading) return <div className="empty">Loading…</div>;
  return <Navigate to={landingFor(perms)} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={guard("/dashboard", <Dashboard />)} />
        <Route path="/flows" element={guard("/flows", <Flows />)} />
        <Route path="/flows/:id" element={guard("/flows", <Flows />)} />
        <Route path="/live-chat" element={guard("/live-chat", <LiveChat />)} />
        <Route path="/escalations" element={guard("/escalations", <Escalations />)} />
        <Route path="/activations" element={guard("/activations", <Activations />)} />
        <Route path="/bookings" element={guard("/bookings", <Bookings />)} />
        <Route path="/centres" element={guard("/centres", <Centres />)} />
        <Route path="/plan-catalog" element={guard("/plan-catalog", <PlanCatalog />)} />
        <Route path="/reports" element={guard("/reports", <Reports />)} />
        <Route path="/triggers" element={guard("/triggers", <Triggers />)} />
        <Route path="/crm-sync" element={guard("/crm-sync", <CrmSync />)} />
        <Route path="/privacy" element={guard("/privacy", <PrivacyRequests />)} />
        <Route path="/audit-log" element={guard("/audit-log", <AuditLog />)} />
        <Route path="/users" element={guard("/users", <Users />)} />
        <Route path="/roles" element={guard("/roles", <Roles />)} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/settings" element={guard("/settings", <Settings />)} />
        <Route path="/developer" element={guard("/developer", <Developer />)} />
        <Route path="/content" element={guard("/content", <Content />)} />
        <Route path="/follow-ups" element={guard("/follow-ups", <FollowUps />)} />
        <Route path="/templates" element={guard("/templates", <Templates />)} />
        <Route path="/go-live" element={guard("/go-live", <GoLive />)} />
      </Route>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
