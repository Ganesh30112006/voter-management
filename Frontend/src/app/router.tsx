import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { AdministratorsPage } from '../pages/administrators/AdministratorsPage';
import { AuditLogsPage } from '../pages/audit/AuditLogsPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { PaymentHistoryPage } from '../pages/payments/PaymentHistoryPage';
import { PaymentManagementPage } from '../pages/payments/PaymentManagementPage';
import { NotFoundPage } from '../pages/ForbiddenPage';
import { ImportPage } from '../pages/imports/ImportPage';
import { ReportsPage } from '../pages/reports/ReportsPage';
import { ProfilePage } from '../pages/settings/ProfilePage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { VotersPage } from '../pages/voters/VotersPage';
import { WardsPage } from '../pages/wards/WardsPage';
import type { Role } from '../types';
import { RequireAccess, RequireAuth } from './guards';

const SA: Role[] = ['SUPER_ADMIN'];
const MANAGERS: Role[] = ['SUPER_ADMIN', 'CORPORATOR'];

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'administrators', element: <RequireAccess roles={MANAGERS}><AdministratorsPage /></RequireAccess> },
          { path: 'wards', element: <RequireAccess roles={MANAGERS}><WardsPage /></RequireAccess> },
          { path: 'voters', element: <VotersPage /> },
          { path: 'import', element: <RequireAccess roles={MANAGERS}><ImportPage /></RequireAccess> },
          { path: 'payments', element: <PaymentManagementPage /> },
          { path: 'payments/history', element: <PaymentHistoryPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'audit', element: <RequireAccess roles={SA}><AuditLogsPage /></RequireAccess> },
          { path: 'settings', element: <RequireAccess roles={SA}><SettingsPage /></RequireAccess> },
          { path: 'profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
], {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
