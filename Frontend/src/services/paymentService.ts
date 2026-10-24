import type {
  CancelPaymentInput,
  PaymentContext,
  PaymentInput,
  PaymentQuery,
  PaymentTransaction,
  Paginated,
  TransactionDetail,
} from '../types';
import { apiClient } from './apiClient';

export const paymentService = {
  context(): Promise<PaymentContext> {
    return apiClient.get<PaymentContext>('/payments/context').then((r) => r.data);
  },
  /** The server assigns the transaction ID and timestamp and records the logged-in admin. */
  record(input: PaymentInput): Promise<PaymentTransaction> {
    return apiClient
      .post<PaymentTransaction>('/payments', input, { headers: { 'Idempotency-Key': input.idempotencyKey } })
      .then((r) => r.data);
  },
  list(q: PaymentQuery): Promise<Paginated<PaymentTransaction>> {
    return apiClient.get<Paginated<PaymentTransaction>>('/payments', { params: q }).then((r) => r.data);
  },
  exportAll(q: PaymentQuery): Promise<PaymentTransaction[]> {
    return apiClient.get<PaymentTransaction[]>('/payments/export', { params: q }).then((r) => r.data);
  },
  get(id: string): Promise<TransactionDetail> {
    return apiClient.get<TransactionDetail>(`/payments/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  cancel(id: string, input: CancelPaymentInput): Promise<PaymentTransaction> {
    return apiClient.post<PaymentTransaction>(`/payments/${encodeURIComponent(id)}/cancel`, input).then((r) => r.data);
  },
};
