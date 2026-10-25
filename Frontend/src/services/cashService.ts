import type { BloCash } from '../types';
import { apiClient } from './apiClient';

export const cashService = {
  get(bloId: string): Promise<BloCash> {
    return apiClient.get<BloCash>(`/cash/${encodeURIComponent(bloId)}`).then((r) => r.data);
  },
  /** Corporator only. A negative amount records money taken back. */
  add(bloId: string, amount: number, note: string): Promise<BloCash> {
    return apiClient.post<BloCash>(`/cash/${encodeURIComponent(bloId)}`, { amount, note }).then((r) => r.data);
  },
};
