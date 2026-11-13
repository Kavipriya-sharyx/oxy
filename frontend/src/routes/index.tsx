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
import Users from "../pages/Users";
import NoAccess from "../pages/NoAccess";
import { ROUTE_ROLES, landingFor } from "../auth/roles";
import { useAuth } from "../hooks/useAuth";
import type { ReactElement } from "react";

const guard = (path: string, el: ReactElement) => (
  <ProtectedRoute roles={ROUTE_ROLES[path]}>{el}</ProtectedRoute>
);

export default function AppRoutes() {
  const { role } = useAuth();
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
        <Route path="/live-chat" element={guard("/live-chat", <LiveChat />)} />
        <Route path="/bookings" element={guard("/bookings", <Bookings />)} />
        <Route path="/centres" element={guard("/centres", <Centres />)} />
        <Route path="/plan-catalog" element={guard("/plan-catalog", <PlanCatalog />)} />
        <Route path="/reports" element={guard("/reports", <Reports />)} />
        <Route path="/triggers" element={guard("/triggers", <Triggers />)} />
        <Route path="/crm-sync" element={guard("/crm-sync", <CrmSync />)} />
        <Route path="/privacy" element={guard("/privacy", <PrivacyRequests />)} />
        <Route path="/audit-log" element={guard("/audit-log", <AuditLog />)} />
        <Route path="/users" element={guard("/users", <Users />)} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/settings" element={guard("/settings", <Settings />)} />
      </Route>
      <Route path="*" element={<Navigate to={landingFor(role)} replace />} />
    </Routes>
  );
}
