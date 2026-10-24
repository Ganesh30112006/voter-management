import type { AuditLog, AuditQuery, Paginated } from '../types';
import { apiClient } from './apiClient';

/** Read-only: the frontend never creates or edits audit entries. */
export const auditService = {
  list(q: AuditQuery): Promise<Paginated<AuditLog>> {
    return apiClient.get<Paginated<AuditLog>>('/audit-logs', { params: q }).then((r) => r.data);
  },
};
