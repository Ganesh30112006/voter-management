import { ChevronsLeft, ChevronsRight, Vote, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { navFor } from './navigation';
import './Sidebar.css';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const admin = useCurrentAdmin();
  const items = navFor(admin);

  return (
    <>
      {mobileOpen && <div className="sidebar-overlay" onClick={onCloseMobile} aria-hidden="true" />}
      <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="sidebar-logo">
            <Vote size={20} aria-hidden="true" />
          </span>
          <span className="sidebar-brand-text">Voter Desk</span>
          <button type="button" className="sidebar-close" onClick={onCloseMobile} aria-label="Close menu">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={`${item.path}-${item.label}`}
              to={item.path}
              end
              className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
              onClick={onCloseMobile}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={19} aria-hidden="true" />
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className="sidebar-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight size={18} aria-hidden="true" /> : <ChevronsLeft size={18} aria-hidden="true" />}
          <span className="sidebar-label">Collapse</span>
        </button>
      </aside>
    </>
  );
}
