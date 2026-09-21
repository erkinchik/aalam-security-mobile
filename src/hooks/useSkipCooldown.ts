import { useEffect } from "react";
import { useOperatorStore } from "../stores/operatorStore";

/**
 * Возвращает смахнутые предложения обратно, когда их выдержка истекла.
 *
 * Селектор предложения и так сравнивает срок с текущим временем, но само по
 * себе время стор не меняет — без этого таймера карточка не появилась бы, пока
 * не придёт какое-нибудь другое событие. Живёт в корне приложения: оператор
 * может уйти на вкладку истории, а вызов всё равно должен вернуться.
 */
export const useSkipCooldown = () => {
  const skippedUntil = useOperatorStore((state) => state.skippedUntil);
  const expireSkips = useOperatorStore((state) => state.expireSkips);

  useEffect(() => {
    const deadlines = Object.values(skippedUntil);
    if (deadlines.length === 0) return;

    // Один таймер на ближайший срок: после чистки эффект перезапустится и
    // поставит следующий.
    const delay = Math.max(0, Math.min(...deadlines) - Date.now());
    const timer = setTimeout(expireSkips, delay + 50);
    return () => clearTimeout(timer);
  }, [skippedUntil, expireSkips]);
};
