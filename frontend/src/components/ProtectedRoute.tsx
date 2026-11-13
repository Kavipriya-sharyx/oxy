import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";

interface Props {
  children: ReactElement;
  /** Optional: the permission this route needs */
  perm?: string | null;
}

export default function ProtectedRoute({ children, perm }: Props) {
  const { isLoggedIn } = useAuth();
  const { loading, can } = usePermissions();
  const location = useLocation();

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />;
  if (perm && loading) return <div className="empty">Loading…</div>;
  if (perm && !can(perm)) return <Navigate to="/no-access" replace />;
  return children;
}
