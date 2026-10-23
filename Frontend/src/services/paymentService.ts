import type {
  CancelPaymentInput,
  PaymentContext,
  PaymentInput,
  PaymentQuery,
  PaymentTransaction,
  Paginated,
  TransactionDetail,
} from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export const paymentService = {
  context(): Promise<PaymentContext> {
    if (USE_MOCK) return mockCall((s, t) => s.paymentContext(t));
    return apiClient.get<PaymentContext>('/payments/context').then((r) => r.data);
  },
  /** The server assigns the transaction ID and timestamp and records the logged-in admin. */
  record(input: PaymentInput): Promise<PaymentTransaction> {
    if (USE_MOCK) return mockCall((s, t) => s.recordPayment(t, input));
    return apiClient
      .post<PaymentTransaction>('/payments', input, { headers: { 'Idempotency-Key': input.idempotencyKey } })
      .then((r) => r.data);
  },
  list(q: PaymentQuery): Promise<Paginated<PaymentTransaction>> {
    if (USE_MOCK) return mockCall((s, t) => s.listPayments(t, q));
    return apiClient.get<Paginated<PaymentTransaction>>('/payments', { params: q }).then((r) => r.data);
  },
  exportAll(q: PaymentQuery): Promise<PaymentTransaction[]> {
    if (USE_MOCK) return mockCall((s, t) => s.exportPayments(t, q));
    return apiClient.get<PaymentTransaction[]>('/payments/export', { params: q }).then((r) => r.data);
  },
  get(id: string): Promise<TransactionDetail> {
    if (USE_MOCK) return mockCall((s, t) => s.getPayment(t, id));
    return apiClient.get<TransactionDetail>(`/payments/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  cancel(id: string, input: CancelPaymentInput): Promise<PaymentTransaction> {
    if (USE_MOCK) return mockCall((s, t) => s.cancelPayment(t, id, input));
    return apiClient.post<PaymentTransaction>(`/payments/${encodeURIComponent(id)}/cancel`, input).then((r) => r.data);
  },
};
