import type { DuplicateCheckResult, Paginated, Voter, VoterDetail, VoterInput, VoterListItem, VoterQuery } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export interface DuplicateCheckParams {
  voterId: string;
  fullName: string;
  houseNumber: string;
  wardId: string;
  excludeRecordId?: string;
}

export const voterService = {
  list(q: VoterQuery): Promise<Paginated<VoterListItem>> {
    if (USE_MOCK) return mockCall((s, t) => s.listVoters(t, q));
    return apiClient.get<Paginated<VoterListItem>>('/voters', { params: q }).then((r) => r.data);
  },
  exportAll(q: VoterQuery): Promise<VoterListItem[]> {
    if (USE_MOCK) return mockCall((s, t) => s.exportVoters(t, q));
    return apiClient.get<VoterListItem[]>('/voters/export', { params: q }).then((r) => r.data);
  },
  get(recordId: string): Promise<VoterDetail> {
    if (USE_MOCK) return mockCall((s, t) => s.getVoter(t, recordId));
    return apiClient.get<VoterDetail>(`/voters/${encodeURIComponent(recordId)}`).then((r) => r.data);
  },
  checkDuplicate(p: DuplicateCheckParams): Promise<DuplicateCheckResult> {
    if (USE_MOCK) return mockCall((s, t) => s.checkVoterDuplicate(t, p));
    return apiClient.get<DuplicateCheckResult>('/voters/duplicate-check', { params: p }).then((r) => r.data);
  },
  create(input: VoterInput): Promise<Voter> {
    if (USE_MOCK) return mockCall((s, t) => s.createVoter(t, input));
    return apiClient.post<Voter>('/voters', input).then((r) => r.data);
  },
  update(recordId: string, input: VoterInput): Promise<Voter> {
    if (USE_MOCK) return mockCall((s, t) => s.updateVoter(t, recordId, input));
    return apiClient.put<Voter>(`/voters/${encodeURIComponent(recordId)}`, input).then((r) => r.data);
  },
};
