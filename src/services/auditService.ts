import type { AuditLog, AuditQuery, Paginated } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

/** Read-only: the frontend never creates or edits audit entries. */
export const auditService = {
  list(q: AuditQuery): Promise<Paginated<AuditLog>> {
    if (USE_MOCK) return mockCall((s, t) => s.listAudit(t, q));
    return apiClient.get<Paginated<AuditLog>>('/audit-logs', { params: q }).then((r) => r.data);
  },
};
