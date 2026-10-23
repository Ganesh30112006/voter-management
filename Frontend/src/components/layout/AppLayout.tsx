import { FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { WardsProvider } from '../../hooks/useWards';
import { USE_MOCK } from '../../services/apiClient';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import './AppLayout.css';

const COLLAPSE_KEY = 'vms-sidebar-collapsed';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // ignore
      }
      return !c;
    });
  };

  return (
    <WardsProvider>
      <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <div className="app-main">
          <Topbar onOpenMenu={() => setMobileOpen(true)} />
          {USE_MOCK && (
            <div className="dev-banner">
              <FlaskConical size={14} aria-hidden="true" />{' '}
              {import.meta.env.VITE_DEMO_MODE === 'true'
                ? 'Demo mode — sample data, saved only in this browser.'
                : 'Development mode — all figures are mock data.'}
            </div>
          )}
          <main id="main" className="app-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
    </WardsProvider>
  );
}
