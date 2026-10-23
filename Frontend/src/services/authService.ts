import type { Admin, LoginResponse, Session } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return `${browser} on ${os}`;
}

export const authService = {
  login(mobile: string, password: string, remember: boolean): Promise<LoginResponse> {
    if (USE_MOCK) return mockCall((s) => s.login(mobile, password, remember, deviceLabel()));
    return apiClient.post<LoginResponse>('/auth/login', { mobile, password, remember }).then((r) => r.data);
  },
  logout(): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.logout(t));
    return apiClient.post('/auth/logout').then(() => undefined);
  },
  me(): Promise<Admin> {
    if (USE_MOCK) return mockCall((s, t) => s.me(t));
    return apiClient.get<Admin>('/auth/me').then((r) => r.data);
  },
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.changePassword(t, currentPassword, newPassword));
    return apiClient.post('/auth/change-password', { currentPassword, newPassword }).then(() => undefined);
  },
  sessions(): Promise<Session[]> {
    if (USE_MOCK) return mockCall((s, t) => s.listSessions(t));
    return apiClient.get<Session[]>('/auth/sessions').then((r) => r.data);
  },
  revokeSession(id: string): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.revokeSession(t, id));
    return apiClient.delete(`/auth/sessions/${encodeURIComponent(id)}`).then(() => undefined);
  },
  revokeOtherSessions(): Promise<number> {
    if (USE_MOCK) return mockCall((s, t) => s.revokeOtherSessions(t));
    return apiClient.post<{ revoked: number }>('/auth/sessions/revoke-others').then((r) => r.data.revoked);
  },
};
