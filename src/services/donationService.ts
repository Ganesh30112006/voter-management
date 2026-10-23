import type {
  CancelDonationInput,
  DonationContext,
  DonationInput,
  DonationQuery,
  DonationTransaction,
  Paginated,
  TransactionDetail,
} from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export const donationService = {
  context(): Promise<DonationContext> {
    if (USE_MOCK) return mockCall((s, t) => s.donationContext(t));
    return apiClient.get<DonationContext>('/donations/context').then((r) => r.data);
  },
  /** The server assigns the transaction ID and timestamp and records the logged-in admin. */
  record(input: DonationInput): Promise<DonationTransaction> {
    if (USE_MOCK) return mockCall((s, t) => s.recordDonation(t, input));
    return apiClient
      .post<DonationTransaction>('/donations', input, { headers: { 'Idempotency-Key': input.idempotencyKey } })
      .then((r) => r.data);
  },
  list(q: DonationQuery): Promise<Paginated<DonationTransaction>> {
    if (USE_MOCK) return mockCall((s, t) => s.listDonations(t, q));
    return apiClient.get<Paginated<DonationTransaction>>('/donations', { params: q }).then((r) => r.data);
  },
  exportAll(q: DonationQuery): Promise<DonationTransaction[]> {
    if (USE_MOCK) return mockCall((s, t) => s.exportDonations(t, q));
    return apiClient.get<DonationTransaction[]>('/donations/export', { params: q }).then((r) => r.data);
  },
  get(id: string): Promise<TransactionDetail> {
    if (USE_MOCK) return mockCall((s, t) => s.getDonation(t, id));
    return apiClient.get<TransactionDetail>(`/donations/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  cancel(id: string, input: CancelDonationInput): Promise<DonationTransaction> {
    if (USE_MOCK) return mockCall((s, t) => s.cancelDonation(t, id, input));
    return apiClient.post<DonationTransaction>(`/donations/${encodeURIComponent(id)}/cancel`, input).then((r) => r.data);
  },
};
