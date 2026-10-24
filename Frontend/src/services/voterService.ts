import type { DuplicateCheckResult, Paginated, Voter, VoterDetail, VoterInput, VoterListItem, VoterQuery } from '../types';
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
};
