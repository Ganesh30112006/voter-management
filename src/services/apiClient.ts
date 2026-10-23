import axios, { AxiosError } from 'axios';
import { ApiError, emitSessionExpired, type ApiErrorCode } from './apiError';
import { tokenStorage } from './tokenStorage';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL as string,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function codeFor(status: number): ApiErrorCode {
  if (status === 401) return 'SESSION_EXPIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 400 || status === 422) return 'VALIDATION';
  return 'SERVER';
}

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string; code?: ApiErrorCode; fieldErrors?: Record<string, string> }>) => {
    if (!error.response) {
      return Promise.reject(new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.'));
    }
    const { status, data } = error.response;
    const code = data?.code ?? codeFor(status);
    const isLogin = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLogin) emitSessionExpired();
    return Promise.reject(new ApiError(status, code, data?.message ?? 'Request failed. Please try again.', data?.fieldErrors));
  },
);

type MockServer = typeof import('../mocks/mockServer');

/** Runs a handler against the development mock backend with a small artificial latency. */
export async function mockCall<T>(handler: (server: MockServer, token: string | null) => T): Promise<T> {
  const server = await import('../mocks/mockServer');
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  try {
    // Clone so UI code can never mutate the mock "database" directly.
    return structuredClone(handler(server, tokenStorage.get()));
  } catch (err) {
    if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') emitSessionExpired();
    throw err;
  }
}
