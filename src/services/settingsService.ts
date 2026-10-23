import type { DonationSettings, SettingsResponse } from '../types';
import { apiClient, mockCall, USE_MOCK } from './apiClient';

export type SettingsInput = Omit<DonationSettings, 'currency'>;

export const settingsService = {
  get(): Promise<SettingsResponse> {
    if (USE_MOCK) return mockCall((s, t) => s.getSettings(t));
    return apiClient.get<SettingsResponse>('/settings/donation').then((r) => r.data);
  },
  update(input: SettingsInput): Promise<SettingsResponse> {
    if (USE_MOCK) return mockCall((s, t) => s.updateSettings(t, input));
    return apiClient.put<SettingsResponse>('/settings/donation', input).then((r) => r.data);
  },
};
