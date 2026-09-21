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
  navigationRef.navigate("Operator", {
    screen: "OperatorTabs",
    params: { screen: "Dashboard" },
  });
  return true;
}
