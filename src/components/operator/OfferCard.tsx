import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { MapPin, User } from "lucide-react-native";
import { EmergencySession } from "../../types/emergency";
import { ActionButton } from "../ui/ActionButton";
import { useAppTheme } from "../../theme";
import { formatElapsed } from "../../utils/date";
import { ru } from "../../locale/ru";

/** Смещение вниз, после которого карточка считается смахнутой. */
const DISMISS_DISTANCE = 90;

interface Props {
  session: EmergencySession;
  isAccepting: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

const venueLine = (session: EmergencySession) => {
  const venue = session.venue;
  if (!venue) return null;
  const details = [
    venue.entrance && `${ru.operatorPool.entrance} ${venue.entrance}`,
    venue.floor && `${ru.operatorPool.floor} ${venue.floor}`,
    venue.apartment && `${ru.operatorPool.apartment} ${venue.apartment}`,
    venue.doorCode && `${ru.operatorPool.doorCode} ${venue.doorCode}`,
  ].filter(Boolean);
  return { title: venue.name ?? venue.address ?? "", details: details.join(" · ") };
};

/**
 * Предложение вызова — как заказ в такси: прилетает поверх карты, принимается
 * одной кнопкой, смахивается вниз. Списка вызовов в интерфейсе нет, поэтому
 * после смахивания сразу предлагается следующий свободный вызов.
 */
export const OfferCard = ({ session, isAccepting, onAccept, onDismiss }: Props) => {
  const { tokens } = useAppTheme();
  const translateY = useSharedValue(0);
  const [elapsed, setElapsed] = React.useState(() => formatElapsed(session.createdAt));

  React.useEffect(() => {
    translateY.value = 0;
    setElapsed(formatElapsed(session.createdAt));
    const id = setInterval(() => setElapsed(formatElapsed(session.createdAt)), 1000);
    return () => clearInterval(id);
  }, [session.id, session.createdAt, translateY]);

  const pan = Gesture.Pan()
    .enabled(!isAccepting)
    .onChange((e) => {
      // Тянуть можно только вниз: вверх карточке ехать некуда.
      translateY.value = Math.max(0, translateY.value + e.changeY);
    })
    .onEnd(() => {
      if (translateY.value > DISMISS_DISTANCE) {
        translateY.value = withTiming(400, { duration: 160 });
        runOnJS(onDismiss)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 240 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const isVenue = session.emergencyType === "VENUE";
  const venue = venueLine(session);
  const who =
    session.user?.displayName || session.user?.email || ru.operatorScreens.unknownUser;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.danger },
          cardStyle,
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: tokens.colors.border }]} />

        <View style={styles.headerRow}>
          <View style={[styles.typePill, { backgroundColor: tokens.colors.danger + "22" }]}>
            <Text style={[styles.typeText, { color: tokens.colors.danger }]}>
              {isVenue ? ru.operatorPool.venue : ru.operatorPool.personal}
            </Text>
          </View>
          <Text style={[styles.timer, { color: tokens.colors.onSurface }]}>{elapsed}</Text>
        </View>

        {isVenue && venue ? (
          <View style={styles.row}>
            <MapPin size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
            <View style={styles.rowText}>
              <Text style={[styles.primary, { color: tokens.colors.onSurface }]} numberOfLines={2}>
                {venue.title}
              </Text>
              {venue.details ? (
                <Text style={[styles.secondary, { color: tokens.colors.onSurfaceMuted }]}>
                  {venue.details}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <User size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          <View style={styles.rowText}>
            <Text style={[styles.primary, { color: tokens.colors.onSurface }]} numberOfLines={1}>
              {who}
            </Text>
            <Text style={[styles.secondary, { color: tokens.colors.onSurfaceMuted }]}>
              {session.user?.phone || ru.operatorPool.noPhone}
            </Text>
          </View>
        </View>

        <ActionButton
          label={isAccepting ? ru.operatorPool.accepting : ru.operatorPool.accept}
          size="large"
          loading={isAccepting}
          onPress={onAccept}
        />
        <Text style={[styles.hint, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.operatorPool.swipeToSkip}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  grabber: { width: 40, height: 4, borderRadius: 999, alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  typeText: { fontSize: 13, fontWeight: "800" },
  timer: { fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rowText: { flex: 1, gap: 2 },
  primary: { fontSize: 16, fontWeight: "700" },
  secondary: { fontSize: 13 },
  hint: { fontSize: 12, textAlign: "center" },
});
