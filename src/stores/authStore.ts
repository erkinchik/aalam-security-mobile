import { create } from "zustand";
import { isAxiosError } from "axios";
import { AuthTokens } from "../types/auth";
import { UserProfile } from "../types/user";
import { authApi } from "../api/modules/auth";
import { usersApi } from "../api/modules/users";
import { secureStorage } from "./secureStorage";
import { useUserSessionStore } from "./userSessionStore";
import { useOperatorStore } from "./operatorStore";
import { useEmergencyStore } from "./emergencyStore";
import { queryClient } from "../queryClient";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  role: UserProfile["role"] | null;
  isBootstrapped: boolean;
  isAuthenticated: boolean;
  bootstrap: () => Promise<void>;
  revalidateSession: (preloadedTokens?: AuthTokens | null) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, phone: string) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  setTokens: (tokens: AuthTokens | null) => void;
  setUser: (user: UserProfile) => void;
  refreshMe: () => Promise<UserProfile | null>;
}

const toTokenState = (tokens: AuthTokens | null) => ({
  accessToken: tokens?.accessToken ?? null,
  refreshToken: tokens?.refreshToken ?? null,
});

const isInvalidRefreshError = (error: unknown) => {
  if (!isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403;
};

const NETWORK_TIMEOUT_MS = 8000;

/**
 * Races a promise against a hard timeout. In the foreground the JS timer always
 * fires, so this guarantees a session check settles even when the underlying
 * native request hangs on a stale connection (cold start after long idle) and
 * the axios timeout isn't honored.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}-timeout`)), ms),
    ),
  ]);

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  role: null,
  isBootstrapped: false,
  isAuthenticated: false,
  bootstrap: async () => {
    const tokens = await secureStorage.getTokens();

    // No stored session at all — go straight to the auth flow.
    if (!tokens?.refreshToken) {
      await Promise.all([secureStorage.clearTokens(), secureStorage.clearUser()]);
      set({ isBootstrapped: true });
      return;
    }

    // Offline-first: with a cached profile on disk, let the user in IMMEDIATELY.
    // Startup must never block on the network — a stale/dead connection after
    // long inactivity used to wedge /users/me forever and freeze the app on the
    // loading screen.
    const cachedUser = await secureStorage.getUser();
    if (cachedUser) {
      set({
        ...toTokenState(tokens),
        user: cachedUser,
        role: cachedUser.role,
        isAuthenticated: true,
        isBootstrapped: true,
      });
      await useUserSessionStore.getState().hydrate();
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    }

    // Validate / refresh the session in the background. This unblocks startup
    // when there is no cached profile and otherwise keeps the cached session
    // fresh. It never freezes the UI (see withTimeout / revalidateSession).
    void get().revalidateSession(tokens);
  },
  revalidateSession: async (preloadedTokens) => {
    const tokens = preloadedTokens ?? (await secureStorage.getTokens());
    if (!tokens?.refreshToken) {
      await Promise.all([secureStorage.clearTokens(), secureStorage.clearUser()]);
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        role: null,
        isAuthenticated: false,
        isBootstrapped: true,
      });
      return;
    }

    try {
      // apiClient transparently refreshes on 401, so a single /users/me call
      // covers both the valid-token and expired-token cases. The timeout
      // guarantees this settles even if the native socket is wedged.
      const me = await withTimeout(
        usersApi.me(tokens.accessToken || undefined),
        NETWORK_TIMEOUT_MS,
        "revalidate",
      );
      await secureStorage.saveUser(me);
      // The 401 interceptor may have rotated the tokens — prefer the live store
      // values over the ones we loaded so we never revert to a stale token.
      const current = get();
      const effectiveTokens =
        current.accessToken && current.refreshToken
          ? { accessToken: current.accessToken, refreshToken: current.refreshToken }
          : tokens;
      set({
        ...toTokenState(effectiveTokens),
        user: me,
        role: me.role,
        isAuthenticated: true,
        isBootstrapped: true,
      });
      await useUserSessionStore.getState().hydrate();
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    } catch (error) {
      if (isInvalidRefreshError(error)) {
        // The session is genuinely invalid (refresh rejected) — sign out.
        // Всё, что чистит обычный выход: иначе следующий пользователь на телефоне
        // наследовал чужую тревогу, вызовы, точку и флаг подписки.
        await Promise.allSettled([
          secureStorage.clearTokens(),
          secureStorage.clearUser(),
          useUserSessionStore.getState().reset(),
          useEmergencyStore.getState().reset(),
        ]);
        queryClient.clear();
        useOperatorStore.getState().reset();
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          role: null,
          isAuthenticated: false,
          isBootstrapped: true,
        });
        return;
      }
      // Network error or timeout: keep any cached session intact and just make
      // sure the app is unblocked. We revalidate again on the next foreground.
      set({ isBootstrapped: true });
    }
  },
  login: async (email: string, password: string) => {
    const tokens = await authApi.login({ email, password });
    const me = await usersApi.me(tokens.accessToken);
    await Promise.all([secureStorage.saveTokens(tokens), secureStorage.saveUser(me)]);
    set({
      ...toTokenState(tokens),
      user: me,
      role: me.role,
      isAuthenticated: true,
    });
    await useUserSessionStore.getState().hydrate();
    void queryClient.invalidateQueries({ queryKey: ["organizations"] });
  },
  register: async (email: string, password: string, phone: string) => {
    const tokens = await authApi.register({ email, password, phone });
    const me = await usersApi.me(tokens.accessToken);
    await Promise.all([secureStorage.saveTokens(tokens), secureStorage.saveUser(me)]);
    set({
      ...toTokenState(tokens),
      user: me,
      role: me.role,
      isAuthenticated: true,
    });
    await useUserSessionStore.getState().hydrate();
    void queryClient.invalidateQueries({ queryKey: ["organizations"] });
  },
  refresh: async () => {
    const current = get();
    if (!current.refreshToken) {
      return false;
    }
    try {
      const tokens = await authApi.refresh({ refreshToken: current.refreshToken });
      await secureStorage.saveTokens(tokens);
      set({ ...toTokenState(tokens), isAuthenticated: true });
      return true;
    } catch (error) {
      if (isInvalidRefreshError(error)) {
        await get().logout();
      }
      return false;
    }
  },
  logout: async () => {
    const { refreshToken, accessToken } = get();
    if (refreshToken && accessToken) {
      try {
        try {
          await authApi.logout({ refreshToken }, accessToken);
        } catch (error) {
          // Токен доступа мог истечь. Без повтора сервер не отзовёт сессию и не
          // сотрёт push-токен — вышедшему оператору продолжали бы приходить SOS.
          if (!isAxiosError(error) || error.response?.status !== 401) throw error;
          const fresh = await authApi.refresh({ refreshToken });
          await authApi.logout({ refreshToken: fresh.refreshToken }, fresh.accessToken);
        }
      } catch (error) {
        // Локальный выход всё равно доводим до конца, но молчать нельзя: именно
        // этот запрос отзывает refresh-токен и гасит push-токен на сервере.
        console.warn("logout: сервер не подтвердил выход", error);
      }
    }
    // Тревога тоже сбрасывается: если это был принудительный выход посреди SOS,
    // после входа она восстановится с сервера (useRestoreActiveEmergency).
    // allSettled: сбой одного хранилища не должен оставить пользователя «вошедшим».
    const cleanup = await Promise.allSettled([
      secureStorage.clearTokens(),
      secureStorage.clearUser(),
      useUserSessionStore.getState().reset(),
      useEmergencyStore.getState().reset(),
    ]);
    cleanup.forEach((result) => {
      if (result.status === "rejected") {
        console.warn("logout: не удалось очистить локальные данные", result.reason);
      }
    });

    queryClient.clear();
    useOperatorStore.getState().reset();

    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      role: null,
      isAuthenticated: false,
    });
  },
  setTokens: (tokens: AuthTokens | null) => {
    set({
      ...toTokenState(tokens),
      isAuthenticated: Boolean(tokens?.accessToken && get().user),
    });
  },
  setUser: (user: UserProfile) => {
    void secureStorage.saveUser(user);
    set({ user, role: user.role });
  },
  refreshMe: async () => {
    if (!get().accessToken) return null;
    try {
      const me = await usersApi.me();
      await secureStorage.saveUser(me);
      set({ user: me, role: me.role });
      return me;
    } catch {
      return null;
    }
  },
}));
