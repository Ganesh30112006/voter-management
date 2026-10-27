import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onSessionExpired } from '../services/apiError';
import { authService } from '../services/authService';
import { teamView } from '../services/teamView';
import { tokenStorage } from '../services/tokenStorage';
import type { Admin } from '../types';
import { AuthContext, type AuthState } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let active = true;
    if (!tokenStorage.get()) {
      setInitializing(false);
      return;
    }
    authService
      .me()
      .then((a) => active && setAdmin(a))
      .catch(() => tokenStorage.clear())
      .finally(() => active && setInitializing(false));
    return () => {
      active = false;
    };
  }, []);

  const adminRef = useRef<Admin | null>(null);
  adminRef.current = admin;

  useEffect(
    () =>
      onSessionExpired(() => {
        tokenStorage.clear();
        if (adminRef.current) setSessionExpired(true);
        setAdmin(null);
      }),
    [],
  );

  const login = useCallback(async (identifier: string, password: string, remember: boolean) => {
    const res = await authService.login(identifier, password, remember);
    tokenStorage.set(res.token, remember);
    setSessionExpired(false);
    setAdmin(res.admin);
  }, []);

  const logout = useCallback(async () => {
    teamView.set('');
    try {
      await authService.logout();
    } catch {
      // The local session is cleared regardless.
    }
    tokenStorage.clear();
    setSessionExpired(false);
    setAdmin(null);
  }, []);

  const refresh = useCallback(async () => {
    setAdmin(await authService.me());
  }, []);

  const value = useMemo(
    () => ({ admin, initializing, sessionExpired, login, logout, refresh }),
    [admin, initializing, sessionExpired, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For pages rendered behind RequireAuth, where an admin is guaranteed. */
export function useCurrentAdmin(): Admin {
  const { admin } = useAuth();
  if (!admin) throw new Error('No authenticated admin');
  return admin;
}
