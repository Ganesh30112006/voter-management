import type { Booth, Ward, WardSummary } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

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
    if (USE_MOCK) return mockCall((s, t) => s.listWards(t));
    return apiClient.get<{ wards: Ward[]; booths: Booth[] }>('/wards').then((r) => r.data);
  },
  summaries(): Promise<WardSummary[]> {
    if (USE_MOCK) return mockCall((s, t) => s.wardSummaries(t));
    return apiClient.get<WardSummary[]>('/wards/summary').then((r) => r.data);
  },
  createWard(input: WardInput): Promise<Ward> {
    if (USE_MOCK) return mockCall((s, t) => s.createWard(t, input));
    return apiClient.post<Ward>('/wards', input).then((r) => r.data);
  },
  updateWard(id: string, input: WardInput): Promise<Ward> {
    if (USE_MOCK) return mockCall((s, t) => s.updateWard(t, id, input));
    return apiClient.put<Ward>(`/wards/${encodeURIComponent(id)}`, input).then((r) => r.data);
  },
  createBooth(input: BoothInput): Promise<Booth> {
    if (USE_MOCK) return mockCall((s, t) => s.createBooth(t, input));
    return apiClient.post<Booth>('/booths', input).then((r) => r.data);
  },
  updateBooth(id: string, input: Omit<BoothInput, 'wardId'>): Promise<Booth> {
    if (USE_MOCK) return mockCall((s, t) => s.updateBooth(t, id, input));
    return apiClient.put<Booth>(`/booths/${encodeURIComponent(id)}`, input).then((r) => r.data);
  },
  setWardAdmins(wardId: string, adminIds: string[]): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.setWardAdmins(t, wardId, adminIds));
    return apiClient.put(`/wards/${encodeURIComponent(wardId)}/admins`, { adminIds }).then(() => undefined);
  },
  setBoothAdmins(boothId: string, adminIds: string[]): Promise<void> {
    if (USE_MOCK) return mockCall((s, t) => s.setBoothAdmins(t, boothId, adminIds));
    return apiClient.put(`/booths/${encodeURIComponent(boothId)}/admins`, { adminIds }).then(() => undefined);
  },
};
