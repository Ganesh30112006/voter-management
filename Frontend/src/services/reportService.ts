import type { DashboardStats, Notification, ReportData, ReportFilters } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export const reportService = {
  dashboard(f: ReportFilters): Promise<DashboardStats> {
    if (USE_MOCK) return mockCall((s, t) => s.dashboard(t, f));
    return apiClient.get<DashboardStats>('/reports/dashboard', { params: f }).then((r) => r.data);
  },
  report(f: ReportFilters): Promise<ReportData> {
    if (USE_MOCK) return mockCall((s, t) => s.report(t, f));
    return apiClient.get<ReportData>('/reports', { params: f }).then((r) => r.data);
  },
  logExport(name: string, format: 'CSV' | 'Excel'): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.logReportExport(t, name, format));
    return apiClient.post('/reports/exports', { name, format }).then(() => undefined);
  },
  notifications(): Promise<Notification[]> {
    if (USE_MOCK) return mockCall((s, t) => s.notifications(t));
    return apiClient.get<Notification[]>('/notifications').then((r) => r.data);
  },
};
