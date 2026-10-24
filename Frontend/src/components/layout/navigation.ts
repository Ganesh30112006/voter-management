import {
  BarChart3,
  ClipboardList,
  FileUp,
  HandCoins,
  History,
  LayoutDashboard,
  MapPinned,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Admin, Role } from '../../types';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const SA: Role[] = ['SUPER_ADMIN'];
const CORPORATOR: Role[] = ['CORPORATOR'];
const FIELD: Role[] = ['CORPORATOR', 'BLO'];
const MANAGERS: Role[] = ['SUPER_ADMIN', 'CORPORATOR'];
const ALL: Role[] = ['SUPER_ADMIN', 'CORPORATOR', 'BLO'];

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  { path: '/administrators', label: 'Accounts', icon: ShieldCheck, roles: SA },
  { path: '/administrators', label: 'My BLOs', icon: UsersRound, roles: CORPORATOR },
  { path: '/wards', label: 'Wards & Booths', icon: MapPinned, roles: MANAGERS },
  { path: '/voters', label: 'Voter Management', icon: Users, roles: SA },
  { path: '/voters', label: 'My Voters', icon: Users, roles: FIELD },
  { path: '/import', label: 'Import Voters', icon: FileUp, roles: MANAGERS },
  { path: '/payments', label: 'Payment Management', icon: HandCoins, roles: ALL },
  { path: '/payments/history', label: 'Payment History', icon: History, roles: ALL },
  { path: '/reports', label: 'Reports & Analytics', icon: BarChart3, roles: SA },
  { path: '/reports', label: 'Reports', icon: BarChart3, roles: FIELD },
  { path: '/audit', label: 'Audit Logs', icon: ClipboardList, roles: SA },
  { path: '/settings', label: 'Settings', icon: Settings, roles: SA },
  { path: '/profile', label: 'My Profile', icon: UserCircle, roles: ALL },
];

export function navFor(admin: Admin): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(admin.role));
}

/** Page titles used for breadcrumbs. */
export const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/administrators': 'Accounts',
  '/wards': 'Wards & Booths',
  '/voters': 'Voters',
  '/import': 'Import Voters',
  '/payments': 'Payment Management',
  '/payments/history': 'Payment History',
  '/reports': 'Reports & Analytics',
  '/audit': 'Audit Logs',
  '/settings': 'Settings',
  '/profile': 'My Profile',
};
