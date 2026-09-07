import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";
import { StatusStateCard } from "../../components/state/StatusStateCard";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

export const ForbiddenScreen = () => {
  const { tokens } = useAppTheme();
  const logout = useAuthStore((state) => state.logout);
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.container}>
        <StatusStateCard
          badge={ru.system.forbiddenBadge}
          badgeColor="#EF4444"
          message={ru.system.forbidden}
          actionLabel={ru.system.goLogin}
          onAction={() => void logout()}
          actionTone="danger"
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
});
