import { useEffect } from "react";
import { AppState } from "react-native";
import { emergencyApi } from "../api/modules/emergency";
import { useAuthStore } from "../stores/authStore";
import { useEmergencyStore } from "../stores/emergencyStore";

/**
 * Сверяет активную тревогу с сервером — при запуске и при возврате в приложение.
 *
 * Тревога жила только в памяти: перезапуск посреди SOS показывал пустую кнопку,
 * а фоновая задача выбрасывала точки, потому что сессии в сторе не было. В
 * обратную сторону — вызов, закрытый оператором, пока приложение было в фоне,
 * оставался на экране: событие закрытия приходило на уснувший сокет.
 *
 * Отдельного эндпоинта не нужно: история отдаёт последнюю сессию первой.
 */
export const useRestoreActiveEmergency = () => {
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!isAuthenticated || role !== "USER" || !userId) return;

    let cancelled = false;
    const sync = async () => {
      // Ответ, пришедший после того, как тревогу отправили, закрыли или сменился
      // пользователь, — устаревший: иначе он стирал только что отправленный SOS
      // или возвращал на экран закрытый.
      const epochBefore = useEmergencyStore.getState().sessionEpoch;
      try {
        const page = await emergencyApi.getHistory(1, 1);
        const auth = useAuthStore.getState();
        if (
          cancelled ||
          useEmergencyStore.getState().sessionEpoch !== epochBefore ||
          !auth.isAuthenticated ||
          auth.user?.id !== userId
        ) {
          return;
        }
        const latest = page.data[0] ?? null;
        const { activeSession, setActiveSession } = useEmergencyStore.getState();
        if (latest && latest.status !== "CLOSED") {
          // Совпадает с локальной — оставляем локальную: события сокета свежее.
          if (activeSession?.id !== latest.id) setActiveSession(latest);
          return;
        }
        // На сервере последняя сессия закрыта (или её нет) — локальная устарела.
        if (activeSession && (!latest || latest.id === activeSession.id)) {
          setActiveSession(null);
        }
      } catch (error) {
        console.warn("restore-sos: не удалось сверить активную тревогу", error);
      }
    };

    void sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isAuthenticated, role, userId]);
};
