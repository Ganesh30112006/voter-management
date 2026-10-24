import type { AccountStatus, Admin, AdminCreateInput, AdminInput, AdminOption, AdminQuery, Paginated } from '../types';
import { apiClient } from './apiClient';

export type { AdminOption };

export const adminService = {
  list(q: AdminQuery): Promise<Paginated<Admin>> {
    return apiClient.get<Paginated<Admin>>('/admins', { params: q }).then((r) => r.data);
  },
  options(): Promise<AdminOption[]> {
    return apiClient.get<AdminOption[]>('/admins/options').then((r) => r.data);
  },
  get(id: string): Promise<Admin> {
    return apiClient.get<Admin>(`/admins/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  /** The server generates the ID: C-n for Corporators, C-n-BLOm for BLOs. */
  create(input: AdminCreateInput): Promise<Admin> {
    return apiClient.post<Admin>('/admins', input).then((r) => r.data);
  },
  update(id: string, input: AdminInput): Promise<Admin> {
    return apiClient.put<Admin>(`/admins/${encodeURIComponent(id)}`, input).then((r) => r.data);
  },
  setStatus(id: string, status: AccountStatus): Promise<Admin> {
    return apiClient.patch<Admin>(`/admins/${encodeURIComponent(id)}/status`, { status }).then((r) => r.data);
  },
  setPassword(id: string, password: string): Promise<void> {
    return apiClient.put(`/admins/${encodeURIComponent(id)}/password`, { password }).then(() => undefined);
  },
};
