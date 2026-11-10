import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface Props {
  children: ReactElement;
  /** Optional: only these user_role names may open the route. */
  roles?: string[];
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { isLoggedIn, role } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && (!role || !roles.includes(role))) return <Navigate to="/bookings" replace />;
  return children;
}
