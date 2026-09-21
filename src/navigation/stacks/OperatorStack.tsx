import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { OperatorStackParamList } from "../types";
import { OperatorTabs } from "../tabs/OperatorTabs";
import { OperatorShiftGateScreen } from "../../screens/operator/OperatorShiftGateScreen";
import { OperatorResolveModalScreen } from "../../screens/operator/OperatorResolveModalScreen";
import { OperatorQueueModalScreen } from "../../screens/operator/OperatorQueueModalScreen";
import { useOperatorStore } from "../../stores/operatorStore";
import { appStackScreenOptions } from "../ui/AppStackShell";
import { ru } from "../../locale/ru";
import { View } from "react-native";
import { useAppTheme } from "../../theme";

const OperatorShiftLoadingScreen = () => {
  const { tokens } = useAppTheme();
  return <View style={{ flex: 1, backgroundColor: tokens.colors.background }} />;
};

const Stack = createNativeStackNavigator<OperatorStackParamList>();

export const OperatorStack = () => {
  const isOnShift = useOperatorStore((state) => state.isOnShift);
  const isShiftResolved = useOperatorStore((state) => state.isShiftResolved);

  // Пока сервер не ответил, статус смены неизвестен: показать шлагбаум значило
  // бы мигнуть им перед оператором, который на смене.
  if (!isShiftResolved) {
    return <OperatorShiftLoadingScreen />;
  }

  // Вне смены доступен ровно один экран: сервер всё равно не шлёт вызовы, а
  // карта и история без смены только сбивают с толку.
  if (!isOnShift) {
    return (
      <Stack.Navigator screenOptions={appStackScreenOptions}>
        <Stack.Screen
          name="OperatorShiftGate"
          component={OperatorShiftGateScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={appStackScreenOptions}>
      <Stack.Screen name="OperatorTabs" component={OperatorTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="OperatorResolveModal"
        component={OperatorResolveModalScreen}
        options={{ title: ru.nav.resolveSession, presentation: "modal" }}
      />
      <Stack.Screen
        name="OperatorQueueModal"
        component={OperatorQueueModalScreen}
        options={{ title: ru.operatorPool.queueTitle, presentation: "modal" }}
      />
    </Stack.Navigator>
  );
};
