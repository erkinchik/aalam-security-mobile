import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyRound, MapPin, Navigation, Phone, User } from "lucide-react-native";
import { EmergencySession } from "../../types/emergency";
import { ActionButton } from "../ui/ActionButton";
import { StatusChip } from "../ui/StatusChip";
import { useAppTheme } from "../../theme";
import { formatElapsed } from "../../utils/date";
import { sessionCaller, sessionCoords, venueEntry } from "../../utils/emergencySession";
import { callPhone, openRoute } from "../../utils/externalApps";
import { ru } from "../../locale/ru";

interface Props {
  session: EmergencySession;
  isStarting: boolean;
  onStartProgress: () => void;
  onResolve: () => void;
}

/**
 * Принятый вызов, который оператор ведёт прямо на карте. Данные о входе живут
 * здесь, а не только в предложении: они нужнее всего тогда, когда оператор уже
 * едет и предложение давно исчезло.
 */
export const ActiveCallCard = ({
  session,
  isStarting,
  onStartProgress,
  onResolve,
}: Props) => {
  const { tokens } = useAppTheme();
  const [elapsed, setElapsed] = React.useState(() => formatElapsed(session.createdAt));

  React.useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(session.createdAt)), 1000);
    return () => clearInterval(id);
  }, [session.createdAt]);

  const entry = venueEntry(session);
  const coords = sessionCoords(session);
  const phone = session.user?.phone ?? null;
  const address = entry?.address ?? entry?.title ?? null;

  /**
   * Звонок и маршрут уводят из приложения, а на iOS оно в фоне засыпает и
   * перестаёт слать пульс. Принятый, но не начатый вызов сервер по тишине
   * забирает через 2 минуты, поэтому раз оператор уже действует — вызов сразу
   * переходит «В работу», которую по тишине не отбирают.
   */
  const leaveTo = (open: () => void) => {
    if (session.status === "ASSIGNED" && !isStarting) onStartProgress();
    open();
  };

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
          <View style={styles.rowText}>
            <Text style={[styles.primary, { color: tokens.colors.onSurface }]} numberOfLines={2}>
              {address}
            </Text>
            {entry?.details ? (
              <Text style={[styles.secondary, { color: tokens.colors.onSurfaceMuted }]}>
                {entry.details}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {entry?.notes ? (
        <View style={styles.row}>
          <KeyRound size={16} color={tokens.colors.warning} strokeWidth={2} />
          <Text
            style={[styles.secondary, styles.flexText, { color: tokens.colors.onSurface }]}
            numberOfLines={3}
          >
            {entry.notes}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <User size={16} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
        <Text
          style={[styles.secondary, styles.flexText, { color: tokens.colors.onSurface }]}
          numberOfLines={1}
        >
          {sessionCaller(session)} · {phone || ru.operatorPool.noPhone}
        </Text>
      </View>

      <View style={styles.quickRow}>
        <ActionButton
          variant="secondary"
          size="small"
          label={ru.operatorScreens.call}
          leftIcon={<Phone size={16} color={tokens.colors.onSurface} strokeWidth={2} />}
          disabled={!phone}
          onPress={() => phone && leaveTo(() => callPhone(phone))}
          accessibilityLabel={ru.operatorScreens.callA11y}
          style={styles.quickBtn}
        />
        <ActionButton
          variant="secondary"
          size="small"
          label={ru.operatorScreens.route}
          leftIcon={<Navigation size={16} color={tokens.colors.onSurface} strokeWidth={2} />}
          disabled={!coords}
          onPress={() => coords && leaveTo(() => openRoute(coords, entry?.title))}
          accessibilityLabel={ru.operatorScreens.routeA11y}
          style={styles.quickBtn}
        />
      </View>

      {session.status === "ASSIGNED" ? (
        <ActionButton
          label={ru.operatorScreens.startProgress}
          loading={isStarting}
          onPress={onStartProgress}
        />
      ) : (
        <ActionButton
          label={ru.operatorScreens.resolveSession}
          variant="danger"
          onPress={onResolve}
        />
      )}
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
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowText: { flex: 1, gap: 2 },
  flexText: { flex: 1 },
  primary: { fontSize: 15, fontWeight: "700" },
  secondary: { fontSize: 14 },
  quickRow: { flexDirection: "row", gap: 8 },
  quickBtn: { flex: 1 },
});
