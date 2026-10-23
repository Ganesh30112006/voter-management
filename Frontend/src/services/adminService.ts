import type { AccountStatus, Admin, AdminCreateInput, AdminInput, AdminQuery, Paginated } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export type AdminOption = Pick<Admin, 'id' | 'fullName'>;

export const adminService = {
  list(q: AdminQuery): Promise<Paginated<Admin>> {
    if (USE_MOCK) return mockCall((s, t) => s.listAdmins(t, q));
    return apiClient.get<Paginated<Admin>>('/admins', { params: q }).then((r) => r.data);
  },
  options(): Promise<AdminOption[]> {
    if (USE_MOCK) return mockCall((s, t) => s.adminOptions(t));
    return apiClient.get<AdminOption[]>('/admins/options').then((r) => r.data);
  },
  get(id: string): Promise<Admin> {
    if (USE_MOCK) return mockCall((s, t) => s.getAdmin(t, id));
    return apiClient.get<Admin>(`/admins/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  /** The server generates the sequential BL-n ID. */
  create(input: AdminCreateInput): Promise<Admin> {
    if (USE_MOCK) return mockCall((s, t) => s.createAdmin(t, input));
    return apiClient.post<Admin>('/admins', input).then((r) => r.data);
  },
  update(id: string, input: AdminInput): Promise<Admin> {
    if (USE_MOCK) return mockCall((s, t) => s.updateAdmin(t, id, input));
    return apiClient.put<Admin>(`/admins/${encodeURIComponent(id)}`, input).then((r) => r.data);
  },
  setStatus(id: string, status: AccountStatus): Promise<Admin> {
    if (USE_MOCK) return mockCall((s, t) => s.setAdminStatus(t, id, status));
    return apiClient.patch<Admin>(`/admins/${encodeURIComponent(id)}/status`, { status }).then((r) => r.data);
  },
  setPassword(id: string, password: string): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.setAdminPassword(t, id, password));
    return apiClient.put(`/admins/${encodeURIComponent(id)}/password`, { password }).then(() => undefined);
  },
};
