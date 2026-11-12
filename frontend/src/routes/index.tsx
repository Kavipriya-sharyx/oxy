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
        <Route path="/live-chat" element={<LiveChat />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/centres" element={<Centres />} />
        <Route path="/plan-catalog" element={<PlanCatalog />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/triggers" element={<Triggers />} />
        <Route path="/crm-sync" element={<CrmSync />} />
        <Route path="/privacy" element={<PrivacyRequests />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/bookings" replace />} />
    </Routes>
  );
}
