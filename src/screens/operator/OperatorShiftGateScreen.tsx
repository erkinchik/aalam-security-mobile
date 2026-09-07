import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ShieldCheck } from "lucide-react-native";
import { RootStackParamList } from "../../navigation/types";
import { useOperatorShift } from "../../hooks/useOperatorShift";
import { useAuthStore } from "../../stores/authStore";
import { ShiftSlider } from "../../components/operator/ShiftSlider";
import { ActionButton } from "../../components/ui/ActionButton";
import { OperatorHeartbeatStatusScreen } from "./OperatorHeartbeatStatusScreen";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

/**
 * Единственный экран оператора вне смены. Дальше пройти нельзя: пока смена не
 * начата, сервер не шлёт вызовы, и любой другой экран показывал бы пустоту.
 */
export const OperatorShiftGateScreen = () => {
  const { tokens } = useAppTheme();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { toggleShift, isToggling, isLoading } = useOperatorShift();
  const user = useAuthStore((state) => state.user);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.header}>
        <OperatorHeartbeatStatusScreen />
        <ActionButton
          variant="ghost"
          size="small"
          label={ru.operatorScreens.profile}
          onPress={() => rootNavigation.navigate("Common", { screen: "Profile" })}
        />
      </View>

      <View style={styles.center}>
        <View style={[styles.badge, { backgroundColor: tokens.colors.surfaceVariant }]}>
          <ShieldCheck size={44} color={tokens.colors.primary} strokeWidth={1.8} />
        </View>
        <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
          {ru.operatorShift.gateTitle}
        </Text>
        <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.operatorShift.gateSubtitle}
        </Text>
        {user?.email ? (
          <Text style={[styles.email, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        <ShiftSlider
          label={ru.operatorShift.slideToStart}
          onConfirm={toggleShift}
          loading={isToggling || isLoading}
          accessibilityLabel={ru.operatorShift.slideToStartA11y}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 15, textAlign: "center", lineHeight: 21, maxWidth: 300 },
  email: { fontSize: 13, marginTop: 4 },
  footer: { paddingBottom: 24, gap: 12 },
});
