import type { Booth, Ward, WardSummary } from '../types';
import { apiClient } from './apiClient';

export interface WardInput {
  number: number;
  name: string;
}

export interface BoothInput {
  wardId: string;
  number: number;
  name: string;
}

export const wardService = {
  list(): Promise<{ wards: Ward[]; booths: Booth[] }> {
    return apiClient.get<{ wards: Ward[]; booths: Booth[] }>('/wards').then((r) => r.data);
  },
  summaries(): Promise<WardSummary[]> {
    return apiClient.get<WardSummary[]>('/wards/summary').then((r) => r.data);
  },
  createWard(input: WardInput): Promise<Ward> {
    return apiClient.post<Ward>('/wards', input).then((r) => r.data);
  },
  updateWard(id: string, input: WardInput): Promise<Ward> {
    return apiClient.put<Ward>(`/wards/${encodeURIComponent(id)}`, input).then((r) => r.data);
  },
  createBooth(input: BoothInput): Promise<Booth> {
    return apiClient.post<Booth>('/booths', input).then((r) => r.data);
  },
  updateBooth(id: string, input: Omit<BoothInput, 'wardId'>): Promise<Booth> {
    return apiClient.put<Booth>(`/booths/${encodeURIComponent(id)}`, input).then((r) => r.data);
  },
  setWardAmount(wardId: string, amount: number | null): Promise<void> {
    return apiClient.put(`/wards/${encodeURIComponent(wardId)}/payment-amount`, { amount }).then(() => undefined);
  },
  /** Deletes every voter of a ward (Super Admin). Paid voters are kept unless `includePaid`; then they go with their payments. */
  deleteVoters(wardId: string, includePaid: boolean): Promise<{ deleted: number; paidDeleted: number; keptPaid: number }> {
    return apiClient
      .delete<{ deleted: number; paidDeleted: number; keptPaid: number }>(`/wards/${encodeURIComponent(wardId)}/voters`, { params: { includePaid } })
      .then((r) => r.data);
  },
  setWardAdmins(wardId: string, adminIds: string[]): Promise<void> {
    return apiClient.put(`/wards/${encodeURIComponent(wardId)}/admins`, { adminIds }).then(() => undefined);
  },
  setBoothAdmins(boothId: string, adminIds: string[]): Promise<void> {
    return apiClient.put(`/booths/${encodeURIComponent(boothId)}/admins`, { adminIds }).then(() => undefined);
  },
};
