import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useOperatorStore } from "../../stores/operatorStore";
import { useAcceptSession } from "../../hooks/useAcceptSession";
import { AppCard } from "../../components/ui/AppCard";
import { ActionButton } from "../../components/ui/ActionButton";
import { EmptyState } from "../../components/state/EmptyState";
import { sessionCaller, venueEntry } from "../../utils/emergencySession";
import { formatElapsed } from "../../utils/date";
import type { OperatorStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

type Props = NativeStackScreenProps<OperatorStackParamList, "OperatorQueueModal">;

/**
 * Все свободные вызовы разом. Карточка предложения показывает только самый
 * давний, и смахнутый вызов нельзя было ни найти, ни вернуть до конца
 * двухминутной паузы — здесь его можно принять сразу.
 */
export const OperatorQueueModalScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const poolById = useOperatorStore((state) => state.poolById);
  const skippedUntil = useOperatorStore((state) => state.skippedUntil);
  const { accept, acceptingId } = useAcceptSession();
  // Сервер держит правило «один вызов за раз»; кнопка не должна обещать иное.
  const hasOpenCall = useOperatorStore((state) =>
    Object.values(state.activeSessionsById).some((session) => session.status !== "CLOSED"),
  );
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // useMemo, а не селектор: селектор с новым массивом на каждый вызов zustand 5
  // принимает за изменение и уходит в бесконечный ререндер.
  const queue = React.useMemo(
    () =>
      Object.values(poolById).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [poolById],
  );

  const onAccept = async (sessionId: string) => {
    const ok = await accept(sessionId);
    if (ok) navigation.goBack();
  };

  if (queue.length === 0) {
    return (
      <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <EmptyState title={ru.operatorPool.emptyTitle} subtitle={ru.operatorPool.emptySub} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <FlatList
        data={queue}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const entry = venueEntry(item);
          const skipped = (skippedUntil[item.id] ?? 0) > now;
          const phone = item.user?.phone ?? null;
          return (
            <AppCard compact>
              <View style={styles.row}>
                <Text style={[styles.kind, { color: tokens.colors.danger }]}>
                  {item.emergencyType === "VENUE" ? ru.operatorPool.venue : ru.operatorPool.personal}
                </Text>
                {skipped ? (
                  <Text style={[styles.skipped, { color: tokens.colors.onSurfaceMuted }]}>
                    {ru.operatorPool.skippedMark}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.caller, { color: tokens.colors.onSurface }]} numberOfLines={1}>
                {sessionCaller(item)}
              </Text>
              <Text style={[styles.meta, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={1}>
                {phone ?? ru.operatorPool.noPhone}
              </Text>
              {entry ? (
                <Text style={[styles.meta, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={2}>
                  {[entry.title, entry.address !== entry.title ? entry.address : null]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              ) : null}
              <View style={[styles.row, styles.footer]}>
                <Text style={[styles.meta, { color: tokens.colors.onSurfaceMuted }]}>
                  {ru.operatorPool.waiting.replace("{duration}", formatElapsed(item.createdAt, now))}
                </Text>
                <ActionButton
                  size="small"
                  label={acceptingId === item.id ? ru.operatorPool.accepting : ru.operatorPool.accept}
                  loading={acceptingId === item.id}
                  disabled={acceptingId !== null || hasOpenCall}
                  onPress={() => void onAccept(item.id)}
                />
              </View>
            </AppCard>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footer: { marginTop: 10 },
  kind: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  skipped: { fontSize: 12, fontWeight: "600" },
  caller: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  meta: { fontSize: 13, marginTop: 2 },
});
