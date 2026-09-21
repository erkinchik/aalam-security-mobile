import { useEffect } from "react";
import { dispatchApi } from "../api/modules/dispatch";
import { useAuthStore } from "../stores/authStore";

export const useHeartbeat = (intervalMs = 15000) => {
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || role !== "OPERATOR") {
      return;
    }

    // Сбой пульса не показываем пользователю — это фоновая служебная связь, —
    // но и не глушим: именно по молчанию пульса сервер возвращает принятый
    // вызов в пул и снимает оператора со смены.
    let consecutiveFailures = 0;
    const tick = async () => {
      try {
        await dispatchApi.heartbeat();
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        // Первый промах — обычное дело в дороге. Сообщаем, когда молчание
        // начинает угрожать назначению.
        if (consecutiveFailures === 3) {
          console.warn(
            `heartbeat: ${consecutiveFailures} неудачи подряд, вызов может уйти в пул`,
            error,
          );
        }
      }
    };

    void tick();
    const id = setInterval(() => void tick(), intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, isAuthenticated, role]);
};
