import type { Admin, LoginResponse, Session } from '../types';
import { apiClient } from './apiClient';

export const authService = {
  /** `identifier` is a mobile number or a full name. */
  login(identifier: string, password: string, remember: boolean): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/login', { identifier, password, remember }).then((r) => r.data);
  },
  logout(): Promise<void> {
    return apiClient.post('/auth/logout').then(() => undefined);
  },
  me(): Promise<Admin> {
    return apiClient.get<Admin>('/auth/me').then((r) => r.data);
  },
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return apiClient.post('/auth/change-password', { currentPassword, newPassword }).then(() => undefined);
  },
  sessions(): Promise<Session[]> {
    return apiClient.get<Session[]>('/auth/sessions').then((r) => r.data);
  },
  revokeSession(id: string): Promise<void> {
    return apiClient.delete(`/auth/sessions/${encodeURIComponent(id)}`).then(() => undefined);
  },
  revokeOtherSessions(): Promise<number> {
    return apiClient.post<{ revoked: number }>('/auth/sessions/revoke-others').then((r) => r.data.revoked);
  },
};
