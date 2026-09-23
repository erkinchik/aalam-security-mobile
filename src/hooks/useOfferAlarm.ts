import { useEffect } from "react";
import { Vibration } from "react-native";
import { selectCurrentOffer, useOperatorStore } from "../stores/operatorStore";
import { useAuthStore } from "../stores/authStore";
import { sosSoundService } from "../services/sosSoundService";

/**
 * Вибрация идёт вместе с сиреной, пока вызов не принят. Раньше был один короткий
 * толчок на приход события — в кармане на беззвучном его не замечали, а вызов,
 * вернувшийся после пропуска, не вибрировал вовсе.
 */
const VIBRATION_PATTERN = [0, 600, 900];

/**
 * Сирена звучит ровно столько, сколько висит непринятое предложение.
 *
 * Живёт в корне приложения, а не на экране карты: оператор мог уйти на вкладку
 * истории, и звук всё равно должен звать. Остановка получается сама — приём
 * вызова убирает его из пула, предложение становится null, и эффект глушит звук
 * без отдельного вызова из обработчика кнопки.
 */
export const useOfferAlarm = () => {
  const role = useAuthStore((state) => state.role);
  const offerId = useOperatorStore((state) => selectCurrentOffer(state)?.id ?? null);

  useEffect(() => {
    if (role !== "OPERATOR" || !offerId) {
      void sosSoundService.stopOfferAlarm();
      return;
    }
    void sosSoundService.startOfferAlarm();
    Vibration.vibrate(VIBRATION_PATTERN, true);
    return () => {
      void sosSoundService.stopOfferAlarm();
      Vibration.cancel();
    };
  }, [offerId, role]);
};
