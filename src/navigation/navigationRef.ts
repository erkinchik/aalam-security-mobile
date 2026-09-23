import { createNavigationContainerRef } from "@react-navigation/native";
import { RootStackParamList } from "./types";
import { useOperatorStore } from "../stores/operatorStore";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Открывает главный экран оператора. Отдельного экрана входящего вызова нет:
 * предложение показывается карточкой поверх карты, поэтому по тапу на push
 * достаточно привести оператора на карту.
 */
export function navigateToOperatorHome() {
  if (!navigationRef.isReady()) return false;
  // Вне смены карты нет — в стеке зарегистрирован только экран начала смены.
  if (!useOperatorStore.getState().isOnShift) return false;
  // pop: вернуться к уже открытой карте, а не положить вторую поверх профиля
  // или модалки очереди.
  // pop на обоих уровнях: внешний — для корневого стека, вложенный — для стека
  // оператора (иначе поверх открытой модалки очереди ложилась вторая карта).
  navigationRef.navigate(
    "Operator",
    { screen: "OperatorTabs", params: { screen: "Dashboard" }, pop: true },
    { pop: true },
  );
  return true;
}
