import type { ShiftedApprovalRequest, ShiftedApprovalStatus } from '../types';
import { apiClient } from './apiClient';

/** Permission for BLOs to pay Shifted voters. */
export const approvalService = {
  list(status?: ShiftedApprovalStatus): Promise<ShiftedApprovalRequest[]> {
    return apiClient.get<ShiftedApprovalRequest[]>('/shifted-approvals', { params: status ? { status } : undefined }).then((r) => r.data);
  },
  /** BLO: ask the Corporator for permission. */
  request(recordId: string): Promise<{ status: ShiftedApprovalStatus }> {
    return apiClient.post<{ status: ShiftedApprovalStatus }>(`/voters/${encodeURIComponent(recordId)}/shifted-approval/request`).then((r) => r.data);
  },
  /** Corporator / Super Admin: allow or refuse. */
  decide(recordId: string, decision: 'Approved' | 'Rejected'): Promise<void> {
    return apiClient.post(`/voters/${encodeURIComponent(recordId)}/shifted-approval`, { decision }).then(() => undefined);
  },
};
