import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dispatchApi } from "../api/modules/dispatch";
import { useApiMutation } from "./useApiMutation";
import { useAuthStore } from "../stores/authStore";
import { useOperatorStore } from "../stores/operatorStore";
import { OperatorShift } from "../types/emergency";
import { ru } from "../locale/ru";

export const OPERATOR_SHIFT_QUERY_KEY = ["operator-shift"] as const;

/**
 * Единственный источник правды о смене: сервер. Стор — зеркало для UI, чтобы
 * дашборд и экран входящего не дёргали запрос каждый на своём монтировании.
 */
export const useOperatorShift = () => {
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setShift = useOperatorStore((state) => state.setShift);
  const isOnShift = useOperatorStore((state) => state.isOnShift);
  const shiftStartedAt = useOperatorStore((state) => state.shiftStartedAt);
  const queryClient = useQueryClient();

  const isOperator = isAuthenticated && role === "OPERATOR";

  const query = useQuery({
    queryKey: OPERATOR_SHIFT_QUERY_KEY,
    queryFn: dispatchApi.getShift,
    enabled: isOperator,
  });

  const shiftData = query.data;
  useEffect(() => {
    if (!shiftData) return;
    setShift({
      onShift: shiftData.onShift,
      shiftStartedAt: shiftData.shiftStartedAt,
    });
  }, [shiftData, setShift]);

  // Роль сменилась или пользователь вышел — смена больше не наша забота.
  useEffect(() => {
    if (!isOperator) {
      setShift({ onShift: false, shiftStartedAt: null });
    }
  }, [isOperator, setShift]);

  const applyShift = (data: OperatorShift) => {
    queryClient.setQueryData(OPERATOR_SHIFT_QUERY_KEY, data);
    setShift({ onShift: data.onShift, shiftStartedAt: data.shiftStartedAt });
    // Пул существует только на смене — перечитываем в обе стороны.
    void queryClient.invalidateQueries({ queryKey: ["operator-pool"] });
  };

  const startShift = useApiMutation(dispatchApi.startShift, {
    successMessage: ru.operatorShift.startedToast,
    onSuccess: applyShift,
  });

  // Ошибку 409 («есть незакрытые вызовы») показывает useApiMutation текстом с бэка.
  const endShift = useApiMutation(dispatchApi.endShift, {
    successMessage: ru.operatorShift.endedToast,
    onSuccess: applyShift,
  });

  return {
    isOnShift,
    shiftStartedAt,
    activeSessionCount: shiftData?.activeSessionCount ?? 0,
    isLoading: query.isLoading,
    isToggling: startShift.isPending || endShift.isPending,
    toggleShift: () => {
      if (isOnShift) endShift.mutate();
      else startShift.mutate();
    },
  };
};
