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
const BL: Role[] = ['BL_ADMIN'];
const BOTH: Role[] = ['SUPER_ADMIN', 'BL_ADMIN'];

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: BOTH },
  { path: '/administrators', label: 'Administrators', icon: ShieldCheck, roles: SA },
  { path: '/wards', label: 'Wards & Booths', icon: MapPinned, roles: SA },
  { path: '/voters', label: 'Voter Management', icon: Users, roles: SA },
  { path: '/voters', label: 'All Voters', icon: Users, roles: BL },
  { path: '/voters/my-ward', label: 'My Ward Voters', icon: UsersRound, roles: BL },
  { path: '/import', label: 'Import Voters', icon: FileUp, roles: SA },
  { path: '/donations', label: 'Donation Management', icon: HandCoins, roles: BOTH },
  { path: '/donations/history', label: 'Donation History', icon: History, roles: BOTH },
  { path: '/reports', label: 'Reports & Analytics', icon: BarChart3, roles: SA },
  { path: '/reports', label: 'Reports', icon: BarChart3, roles: BL },
  { path: '/audit', label: 'Audit Logs', icon: ClipboardList, roles: SA },
  { path: '/settings', label: 'Settings', icon: Settings, roles: SA },
  { path: '/profile', label: 'My Profile', icon: UserCircle, roles: BOTH },
];

export function navFor(admin: Admin): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(admin.role));
}

/** Page titles used for breadcrumbs. */
export const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/administrators': 'Administrators',
  '/wards': 'Wards & Booths',
  '/voters': 'Voters',
  '/voters/my-ward': 'My Ward Voters',
  '/import': 'Import Voters',
  '/donations': 'Donation Management',
  '/donations/history': 'Donation History',
  '/reports': 'Reports & Analytics',
  '/audit': 'Audit Logs',
  '/settings': 'Settings',
  '/profile': 'My Profile',
};
