import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig, isAxiosError } from "axios";
import { ENV } from "../config/env";
import { secureStorage } from "../stores/secureStorage";
import { AuthTokens } from "../types/auth";

type RetryableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  /** Backoff attempts already consumed (set by the retry interceptor). */
  _retryAttempt?: number;
};

/**
 * Endpoints we treat as life-critical: failures are auto-retried with exponential backoff.
 * Only POSTs are retried, and the server-side handler MUST be idempotent for the retry to be safe
 * (i.e. it must not produce duplicate sessions on the same {userId, attemptId}).
 */
const RETRYABLE_URL_PATTERNS: ReadonlyArray<RegExp> = [
  /\/emergency\/start$/,
  /\/emergency\/[^/]+\/location$/,
];

const MAX_RETRY_ATTEMPTS = 3;
/** 500ms, 1.5s, 4.5s — ~6.5s total before giving up. */
const BACKOFF_BASE_MS = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryableUrl = (url: string | undefined) => {
  if (!url) return false;
  return RETRYABLE_URL_PATTERNS.some((rx) => rx.test(url));
};

const isRetryableError = (error: AxiosError) => {
  if (!error.response) {
    return true;
  }
  const status = error.response.status;
  return status >= 500 || status === 408 || status === 429;
};

export const publicClient = axios.create({
  baseURL: ENV.apiBaseUrl,
  timeout: 15000,
});

export const apiClient = axios.create({
  baseURL: ENV.apiBaseUrl,
  timeout: 15000,
});

let isRefreshing = false;
let queuedRequests: Array<(token: string | null) => void> = [];

const resolveQueue = (token: string | null) => {
  queuedRequests.forEach((cb) => cb(token));
  queuedRequests = [];
};

const shouldLogoutOnRefreshFailure = (error: unknown) => {
  if (!isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403;
};

const authStore = () => require("../stores/authStore").useAuthStore as {
  getState: () => {
    accessToken: string | null;
    refreshToken: string | null;
    setTokens: (tokens: AuthTokens | null) => void;
    logout: () => Promise<void>;
  };
};

const refreshTokens = async (): Promise<AuthTokens | null> => {
  const state = authStore().getState();
  const storedTokens = state.accessToken && state.refreshToken
    ? { accessToken: state.accessToken, refreshToken: state.refreshToken }
    : await secureStorage.getTokens();
  const refreshToken = storedTokens?.refreshToken;
  if (!refreshToken) {
    return null;
  }

  const response = await publicClient.post<AuthTokens>("/auth/refresh", {
    refreshToken,
  });
  return response.data;
};

apiClient.interceptors.request.use((config) => {
  const token = authStore().getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    if (originalRequest && error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queuedRequests.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const tokens = await refreshTokens();
        if (!tokens) {
          throw error;
        }

        authStore().getState().setTokens(tokens);
        await secureStorage.saveTokens(tokens);
        resolveQueue(tokens.accessToken);
        originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Очередь отклоняем ДО выхода. Раньше logout() шёл через apiClient: его
        // собственный 401 вставал в эту очередь, которую разбирали только после
        // logout(), — они ждали друг друга вечно, и приложение зависало
        // (например, сразу после удаления аккаунта). Теперь выход идёт мимо
        // интерцептора, а флаг держим до конца выхода, чтобы параллельное
        // обновление не вписало токены обратно.
        resolveQueue(null);
        if (shouldLogoutOnRefreshFailure(refreshError)) {
          await authStore().getState().logout();
        }
        resolveQueue(null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Auto-retry for SOS-critical endpoints with exponential backoff.
    if (
      originalRequest &&
      isRetryableUrl(originalRequest.url) &&
      isRetryableError(error) &&
      (originalRequest._retryAttempt ?? 0) < MAX_RETRY_ATTEMPTS
    ) {
      const attempt = (originalRequest._retryAttempt ?? 0) + 1;
      originalRequest._retryAttempt = attempt;
      // 500ms, 1500ms, 4500ms (3x growth) — keeps the worst-case wait short for life-critical flows.
      const delay = BACKOFF_BASE_MS * Math.pow(3, attempt - 1);
      await sleep(delay);
      return apiClient(originalRequest) as Promise<AxiosResponse>;
    }

    return Promise.reject(error);
  },
);
