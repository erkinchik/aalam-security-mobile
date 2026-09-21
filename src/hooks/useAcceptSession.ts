import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dispatchApi } from "../api/modules/dispatch";
import { useOperatorStore } from "../stores/operatorStore";
import { handleApiError } from "../utils/error/handleApiError";
import { toastBus } from "../ui/feedback/toastBus";
import { ru } from "../locale/ru";
import { OPERATOR_SHIFT_QUERY_KEY } from "./useOperatorShift";

/**
 * Приём вызова. Первый успевший получает 200, остальные — 409: это штатный
 * исход гонки, а не сбой, поэтому показываем его как info и просто убираем
 * карточку из пула.
 */
export const useAcceptSession = () => {
  const queryClient = useQueryClient();
  const upsertActiveSession = useOperatorStore((state) => state.upsertActiveSession);
  const removePoolSession = useOperatorStore((state) => state.removePoolSession);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const accept = useCallback(
    async (sessionId: string): Promise<boolean> => {
      setAcceptingId(sessionId);
      try {
        const accepted = await dispatchApi.accept(sessionId);
        upsertActiveSession(accepted);
        removePoolSession(sessionId);
        toastBus.show({ message: ru.operatorPool.acceptedToast, severity: "success" });
        return true;
      } catch (error) {
        const { status, code, message } = handleApiError(error);
        // Вызов забрали или закрыли — карточке в пуле больше не место. Остальные
        // отказы (например «сначала закройте свой») оставляют его свободным.
        const lost =
          code === "SESSION_ALREADY_CLAIMED" ||
          code === "SESSION_NOT_FOUND" ||
          code === "SESSION_ALREADY_CLOSED" ||
          // Вызов закрыли до приёма — иначе карточка и сирена оставались.
          code === "SESSION_WRONG_STATUS" ||
          status === 404;
        toastBus.show({
          message: lost ? ru.operatorPool.takenByOther : message,
          severity: lost ? "info" : "error",
        });
        if (lost) removePoolSession(sessionId);
        // Смену сняли, а приложение не узнало: перечитываем, чтобы показать
        // экран начала смены вместо предложения, которое не принять.
        if (code === "NOT_ON_SHIFT") {
          void queryClient.invalidateQueries({ queryKey: OPERATOR_SHIFT_QUERY_KEY });
        }
        return false;
      } finally {
        setAcceptingId(null);
        void queryClient.invalidateQueries({ queryKey: ["operator-pool"] });
        void queryClient.invalidateQueries({ queryKey: ["operator-active"] });
      }
    },
    [queryClient, removePoolSession, upsertActiveSession],
  );

  return { accept, acceptingId };
};
