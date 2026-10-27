import { Bell, ChevronDown, LogOut, Menu, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useCurrentAdmin } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { errorMessage } from '../../services/apiError';
import { adminService, type AdminOption } from '../../services/adminService';
import { reportService } from '../../services/reportService';
import { teamView, useTeamView } from '../../services/teamView';
import type { Notification } from '../../types';
import { formatDateTime } from '../../utils/format';
import { ROLE_LABELS } from '../../utils/permissions';
import { Spinner } from '../common/States';
import { Breadcrumbs } from './Breadcrumbs';
import './Topbar.css';

const SEEN_KEY = 'vms-notifications-seen';

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => {
    let active = true;
    const load = () =>
      reportService
        .notifications()
        .then((n) => {
          if (active) {
            setItems(n);
            setError(null);
          }
        })
        .catch((e) => active && setError(errorMessage(e)));
    load();
    const id = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const unread = (items ?? []).filter((n) => n.timestamp > seen).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && items?.length) {
      const latest = items[0].timestamp;
      setSeen(latest);
      try {
        localStorage.setItem(SEEN_KEY, latest);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="icon-btn topbar-bell" onClick={toggle} aria-label={`Notifications${unread ? `, ${unread} new` : ''}`} aria-expanded={open}>
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown-menu notifications-menu">
          <p className="dropdown-title">Notifications</p>
          {error && <p className="dropdown-empty">{error}</p>}
          {!error && items === null && (
            <div className="dropdown-empty">
              <Spinner label="Loading…" />
            </div>
          )}
          {!error && items?.length === 0 && <p className="dropdown-empty">No notifications yet.</p>}
          {items?.map((n) => (
            <div key={n.id} className="notification-item">
              <p className="notification-title">{n.title}</p>
              <p className="notification-body">{n.body}</p>
              <p className="notification-time">{formatDateTime(n.timestamp)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const admin = useCurrentAdmin();
  const { logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const initials = admin.fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const onLogout = async () => {
    setOpen(false);
    const ok = await confirm({ title: 'Log out?', message: 'You will need to sign in again to continue.', confirmLabel: 'Log out' });
    if (!ok) return;
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="profile-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="profile-text">
          <span className="profile-name">{admin.fullName}</span>
          <span className="profile-role">
            {admin.id} · {ROLE_LABELS[admin.role]}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="profile-chevron" />
      </button>
      {open && (
        <div className="dropdown-menu" role="menu">
          <Link to="/profile" className="dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
            <UserCircle size={16} aria-hidden="true" /> My Profile
          </Link>
          <button type="button" className="dropdown-item danger" role="menuitem" onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Super Admin: whose view to show. Each Corporator (with its BLOs) has its own changes to the shared voter list,
 * its own payments and permissions; "All Corporators" shows the shared list and every team's payments.
 */
function TeamPicker() {
  const team = useTeamView();
  const [corporators, setCorporators] = useState<AdminOption[]>([]);
  useEffect(() => {
    adminService
      .options()
      .then((list) => {
        const found = list.filter((a) => a.role === 'CORPORATOR');
        setCorporators(found);
        // A Corporator that was deleted is no longer offered.
        if (team && !found.some((c) => c.id === team)) teamView.set('');
      })
      .catch(() => setCorporators([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="team-picker">
      <span className="small muted">Viewing</span>
      <select className="select" value={team} onChange={(e) => teamView.set(e.target.value)} aria-label="Corporator to view">
        <option value="">All Corporators</option>
        {corporators.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id} – {c.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const admin = useCurrentAdmin();
  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar-menu" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={22} aria-hidden="true" />
      </button>
      <Breadcrumbs />
      <div className="spacer" />
      {admin.role === 'SUPER_ADMIN' && <TeamPicker />}
      <Notifications />
      <ProfileMenu />
    </header>
  );
}
