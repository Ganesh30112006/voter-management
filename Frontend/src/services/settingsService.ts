import type { PaymentSettings, SettingsResponse } from '../types';
import { apiClient } from './apiClient';

export type SettingsInput = Omit<PaymentSettings, 'currency'>;

export const settingsService = {
  get(): Promise<SettingsResponse> {
    return apiClient.get<SettingsResponse>('/settings/payment').then((r) => r.data);
  },
  update(input: SettingsInput): Promise<SettingsResponse> {
    return apiClient.put<SettingsResponse>('/settings/payment', input).then((r) => r.data);
  },
};
