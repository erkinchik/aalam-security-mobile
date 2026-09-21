import { useEffect } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useOperatorStore } from "../stores/operatorStore";
import { useAuthStore } from "../stores/authStore";

const TAG = "operator-active-call";

/**
 * Пока у оператора открыт вызов, экран не гаснет.
 *
 * Пульс — обычный JS-таймер, и система останавливает его вместе с экраном.
 * Сервер в ответ через две минуты молчания возвращает вызов в пул, и человек
 * терял выезд, находясь уже в дороге. Не даём экрану уснуть ровно на время
 * вызова — как в приложениях для водителей.
 */
export const useKeepAwakeDuringCall = () => {
  const role = useAuthStore((state) => state.role);
  const hasOpenCall = useOperatorStore((state) =>
    Object.values(state.activeSessionsById).some((s) => s.status !== "CLOSED"),
  );

  useEffect(() => {
    if (role !== "OPERATOR" || !hasOpenCall) return;

    void activateKeepAwakeAsync(TAG).catch((error: unknown) => {
      // Не критично: без этого экран просто погаснет как обычно.
      console.warn("keep-awake: не удалось удержать экран", error);
    });

    return () => {
      void deactivateKeepAwake(TAG);
    };
  }, [role, hasOpenCall]);
};
