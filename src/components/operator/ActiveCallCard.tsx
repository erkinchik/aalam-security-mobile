import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MapPin, Phone } from "lucide-react-native";
import { EmergencySession } from "../../types/emergency";
import { ActionButton } from "../ui/ActionButton";
import { StatusChip } from "../ui/StatusChip";
import { useAppTheme } from "../../theme";
import { formatElapsed } from "../../utils/date";
import { ru } from "../../locale/ru";

interface Props {
  session: EmergencySession;
  isStarting: boolean;
  onStartProgress: () => void;
  onResolve: () => void;
  onDetails: () => void;
}

/**
 * Принятый вызов, который оператор ведёт прямо на карте: статус, куда ехать и
 * два действия. Заменяет прежний переход на отдельный экран деталей.
 */
export const ActiveCallCard = ({
  session,
  isStarting,
  onStartProgress,
  onResolve,
  onDetails,
}: Props) => {
  const { tokens } = useAppTheme();
  const [elapsed, setElapsed] = React.useState(() => formatElapsed(session.createdAt));

  React.useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(session.createdAt)), 1000);
    return () => clearInterval(id);
  }, [session.createdAt]);

  const address = session.venue?.address ?? session.venue?.name ?? null;
  const who = session.user?.displayName || session.user?.email || ru.operatorScreens.unknownUser;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border },
      ]}
    >
      <View style={styles.headerRow}>
        <StatusChip status={session.status} />
        <Text style={[styles.timer, { color: tokens.colors.onSurfaceMuted }]}>{elapsed}</Text>
      </View>

      {address ? (
        <View style={styles.row}>
          <MapPin size={16} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          <Text style={[styles.primary, { color: tokens.colors.onSurface }]} numberOfLines={2}>
            {address}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Phone size={16} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
        <Text style={[styles.secondary, { color: tokens.colors.onSurface }]} numberOfLines={1}>
          {who} · {session.user?.phone || ru.operatorPool.noPhone}
        </Text>
      </View>

      <View style={styles.actions}>
        {session.status === "ASSIGNED" ? (
          <ActionButton
            label={ru.operatorScreens.startProgress}
            loading={isStarting}
            onPress={onStartProgress}
            style={styles.grow}
          />
        ) : (
          <ActionButton
            label={ru.operatorScreens.resolveSession}
            variant="danger"
            onPress={onResolve}
            style={styles.grow}
          />
        )}
        <ActionButton
          label={ru.operatorScreens.details}
          variant="secondary"
          onPress={onDetails}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timer: { fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  primary: { flex: 1, fontSize: 15, fontWeight: "700" },
  secondary: { flex: 1, fontSize: 14 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  grow: { flex: 1 },
});
