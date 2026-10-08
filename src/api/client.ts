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

const requestTokens = async (): Promise<AuthTokens | null> => {
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
  const tokens = response.data;
  // The user may have signed out or signed in again while the request was in
  // flight; writing these tokens would bring the ended session back. The check
  // follows the source the refresh token was read from, and an unreadable
  // keychain rejects the refresh. The dropped pair is not revoked on purpose:
  // /auth/logout also clears the user's push token, which would silence SOS
  // pushes for a session that has just signed in again.
  const liveRefreshToken = authStore().getState().refreshToken;
  const sessionUnchanged = state.refreshToken
    ? liveRefreshToken === refreshToken
    : liveRefreshToken === null &&
      (await secureStorage.getTokens())?.refreshToken === refreshToken;
  if (!sessionUnchanged) {
    throw new Error("session changed during token refresh");
  }
  // Store first, synchronously: nothing may read the rotated-out refresh token
  // once this flight is over.
  authStore().getState().setTokens(tokens);
  try {
    await secureStorage.saveTokens(tokens);
  } catch (error) {
    // The old token is already revoked server-side, so failing the refresh here
    // would only break a session that is valid in memory. revalidateSession
    // writes the live tokens again on the next foreground.
    console.warn(
      "refresh: failed to persist rotated tokens",
      error instanceof Error ? error.message : "unknown error",
    );
  }
  return tokens;
};

let refreshInFlight: Promise<AuthTokens | null> | null = null;

/**
 * The only way to refresh the session. The server rotates the refresh token on
 * every use, so two parallel refreshes with the same token end with the loser
 * rejected as reuse and the user signed out. That happened whenever the 401
 * interceptor overlapped with authStore.refresh() (socket "io server
 * disconnect", useTokenRefresh timer) after a cold start or a long background.
 */
export const refreshSession = (): Promise<AuthTokens | null> => {
  refreshInFlight ??= requestTokens().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
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
        const tokens = await refreshSession();
        if (!tokens) {
          throw error;
        }

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
