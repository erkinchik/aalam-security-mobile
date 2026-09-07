import { createNavigationContainerRef } from "@react-navigation/native";
import { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Открывает главный экран оператора. Отдельного экрана входящего вызова нет:
 * предложение показывается карточкой поверх карты, поэтому по тапу на push
 * достаточно привести оператора на карту.
 */
export function navigateToOperatorHome() {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate("Operator", {
    screen: "OperatorTabs",
    params: { screen: "Dashboard" },
  });
  return true;
}
