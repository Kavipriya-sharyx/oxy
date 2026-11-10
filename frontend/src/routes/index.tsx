import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import Login from "../pages/Login";
import LiveChat from "../pages/LiveChat";
import Bookings from "../pages/Bookings";
import Centres from "../pages/Centres";
import PlanCatalog from "../pages/PlanCatalog";

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
      </Route>
      <Route path="*" element={<Navigate to="/bookings" replace />} />
    </Routes>
  );
}
