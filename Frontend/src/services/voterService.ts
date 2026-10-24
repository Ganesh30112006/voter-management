import type { DuplicateCheckResult, Paginated, Voter, VoterDetail, VoterInput, VoterListItem, VoterQuery, VoterStatus } from '../types';
import { apiClient } from './apiClient';

export interface DuplicateCheckParams {
  voterId: string;
  fullName: string;
  houseNumber: string;
  wardId: string;
  excludeRecordId?: string;
}

export const voterService = {
  list(q: VoterQuery): Promise<Paginated<VoterListItem>> {
    return apiClient.get<Paginated<VoterListItem>>('/voters', { params: q }).then((r) => r.data);
  },
  exportAll(q: VoterQuery): Promise<VoterListItem[]> {
    return apiClient.get<VoterListItem[]>('/voters/export', { params: q }).then((r) => r.data);
  },
  get(recordId: string): Promise<VoterDetail> {
    return apiClient.get<VoterDetail>(`/voters/${encodeURIComponent(recordId)}`).then((r) => r.data);
  },
  checkDuplicate(p: DuplicateCheckParams): Promise<DuplicateCheckResult> {
    return apiClient.get<DuplicateCheckResult>('/voters/duplicate-check', { params: p }).then((r) => r.data);
  },
  create(input: VoterInput): Promise<Voter> {
    return apiClient.post<Voter>('/voters', input).then((r) => r.data);
  },
  update(recordId: string, input: VoterInput): Promise<Voter> {
    return apiClient.put<Voter>(`/voters/${encodeURIComponent(recordId)}`, input).then((r) => r.data);
  },
  /** Sets the status of many voters by Voter ID (a deaths / shifted list), 1000 per request. */
  async setStatus(
    voterIds: string[],
    status: VoterStatus,
    fileName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<{ updated: number; unchanged: number; notFound: string[] }> {
    const total = { updated: 0, unchanged: 0, notFound: [] as string[] };
    for (let i = 0; i < voterIds.length; i += 1000) {
      const batch = voterIds.slice(i, i + 1000);
      const r = (await apiClient.post<typeof total>('/voters/status', { voterIds: batch, status, fileName })).data;
      total.updated += r.updated;
      total.unchanged += r.unchanged;
      total.notFound.push(...r.notFound);
      onProgress(Math.min(i + 1000, voterIds.length), voterIds.length);
    }
    return total;
  },
};
