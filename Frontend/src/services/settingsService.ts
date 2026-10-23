import type { PaymentSettings, SettingsResponse } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export type SettingsInput = Omit<PaymentSettings, 'currency'>;

export const settingsService = {
  get(): Promise<SettingsResponse> {
    if (USE_MOCK) return mockCall((s, t) => s.getSettings(t));
    return apiClient.get<SettingsResponse>('/settings/payment').then((r) => r.data);
  },
  update(input: SettingsInput): Promise<SettingsResponse> {
    if (USE_MOCK) return mockCall((s, t) => s.updateSettings(t, input));
    return apiClient.put<SettingsResponse>('/settings/payment', input).then((r) => r.data);
  },
};
