import type { DashboardStats, Notification, ReportData, ReportFilters } from '../types';
import { apiClient } from './apiClient';

export const reportService = {
  dashboard(f: ReportFilters): Promise<DashboardStats> {
    return apiClient.get<DashboardStats>('/reports/dashboard', { params: f }).then((r) => r.data);
  },
  report(f: ReportFilters): Promise<ReportData> {
    return apiClient.get<ReportData>('/reports', { params: f }).then((r) => r.data);
  },
  logExport(name: string, format: 'Excel'): Promise<void> {
    return apiClient.post('/reports/exports', { name, format }).then(() => undefined);
  },
  notifications(): Promise<Notification[]> {
    return apiClient.get<Notification[]>('/notifications').then((r) => r.data);
  },
};
