import { apiClient, publicClient } from "../client";
import { AuthTokens, LoginPayload, RegisterPayload } from "../../types/auth";

interface RefreshPayload {
  refreshToken: string;
}

export const authApi = {
  async login(payload: LoginPayload) {
    const { data } = await publicClient.post<AuthTokens>("/auth/login", payload);
    return data;
  },
  async register(payload: RegisterPayload) {
    const { data } = await publicClient.post<AuthTokens>("/auth/register", payload);
    return data;
  },
  async refresh(payload: RefreshPayload) {
    const { data } = await publicClient.post<AuthTokens>("/auth/refresh", payload);
    return data;
  },
  /**
   * Токен доступа передаём явно, а не через apiClient: его интерцептор на 401
   * сам вызывает выход, и у удалённой учётки (401 на всё) выход вызывал бы
   * сам себя.
   */
  async logout(payload: RefreshPayload, accessToken: string) {
    const { data } = await publicClient.post<{ status: string }>("/auth/logout", payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data;
  },
  async forgotPassword(email: string) {
    const { data } = await publicClient.post<{ status: string }>("/auth/forgot-password", { email });
    return data;
  },
  async resetPassword(token: string, newPassword: string) {
    const { data } = await publicClient.post<{ status: string }>("/auth/reset-password", {
      token,
      newPassword,
    });
    return data;
  },
  async startTelegramVerification() {
    const { data } = await apiClient.post<{ token: string; deepLink: string }>(
      "/auth/telegram/verify/start",
    );
    return data;
  },
};
