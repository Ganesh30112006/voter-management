import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import type { Role } from '../types';

export function FullPageLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} role="status">
      <Loader2 size={28} className="spinner" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function RequireAuth() {
  const { admin, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageLoader />;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Hides pages the admin may not use. The backend still enforces every rule independently. */
export function RequireAccess({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { admin } = useAuth();
  if (!admin) return null;
  if (!roles.includes(admin.role)) return <ForbiddenPage />;
  return <>{children}</>;
}
