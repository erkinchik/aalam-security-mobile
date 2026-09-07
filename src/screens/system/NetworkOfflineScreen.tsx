import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusStateCard } from "../../components/state/StatusStateCard";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

export const NetworkOfflineScreen = () => {
  const { tokens } = useAppTheme();
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.content}>
        <StatusStateCard
          badge={ru.system.offlineBadge}
          badgeColor="#F59E0B"
          message={ru.system.offline}
          actionLabel={ru.errors.retry}
          onAction={() => {}}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
});
