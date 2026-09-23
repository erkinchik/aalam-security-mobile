import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CloudOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOfflineFlush } from "../../hooks/useOfflineFlush";
import { ru } from "../../locale/ru";

export const OfflineBanner = () => {
  const { isOnline, isSyncing, pendingQueueLength } = useOfflineFlush();
  // Отступ — от реальной безопасной зоны, а не 56 px: на iPhone с Dynamic Island
  // плашка иначе уходила под остров, на Android без выреза висела слишком низко.
  const insets = useSafeAreaInsets();

  if (isOnline && pendingQueueLength === 0) {
    return null;
  }

  const count = String(pendingQueueLength);
  const message = isSyncing
    ? ru.offline.flushing.replace("{count}", count)
    : !isOnline
      ? pendingQueueLength > 0
        ? ru.offline.offlineWithQueue.replace("{count}", count)
        : ru.offline.offline
      : // Connected per NetInfo, but the queue isn't draining (server
        // unreachable / between retries) — don't claim we're sending.
        ru.offline.pendingSync.replace("{count}", count);

  return (
    <View pointerEvents="none" style={[styles.wrapper, { paddingTop: insets.top + 8 }]}>
      <View style={styles.banner}>
        <CloudOff size={16} color="#FDE047" strokeWidth={2} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1C1E2A",
    borderColor: "#FDE04733",
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: "90%",
  },
  text: {
    color: "#FDE047",
    fontSize: 12,
    flexShrink: 1,
  },
});
