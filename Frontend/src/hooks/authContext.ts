import { createContext } from 'react';
import type { Admin } from '../types';

export interface AuthState {
  admin: Admin | null;
  initializing: boolean;
  /** Set when the user was signed out because the session expired. */
  sessionExpired: boolean;
  login: (identifier: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Kept in its own module so hot reloads of useAuth.tsx (or the services it imports) reuse the same
 * context object; otherwise the mounted provider and the reloaded hooks would use different contexts.
 */
export const AuthContext = createContext<AuthState | null>(null);
