import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { MapPin, Phone, User } from "lucide-react-native";
import { EmergencySession } from "../../types/emergency";
import { ActionButton } from "../ui/ActionButton";
import { useAppTheme } from "../../theme";
import { formatElapsed } from "../../utils/date";
import { sessionCaller, venueEntry } from "../../utils/emergencySession";
import { callPhone } from "../../utils/externalApps";
import { ru } from "../../locale/ru";

/**
 * Сколько «Принять» не срабатывает после появления новой карточки. Следующий
 * вызов встаёт на место смахнутого прямо под палец, и касание, начатое на
 * старой карточке, иначе принимало вызов, которого оператор даже не видел.
 */
const ACCEPT_GUARD_MS = 600;

/**
 * Смещение вниз, после которого карточка считается смахнутой. 90 px смахивали
 * вызов случайно — при попытке нажать «Принять» или просто взять телефон.
 */
const DISMISS_DISTANCE = 140;

interface Props {
  session: EmergencySession;
  isAccepting: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

/**
 * Предложение вызова — как заказ в такси: прилетает поверх карты, принимается
 * одной кнопкой, смахивается вниз. После смахивания предлагается следующий
 * свободный вызов, а смахнутый остаётся в очереди — её открывает бейдж.
 */
export const OfferCard = ({ session, isAccepting, onAccept, onDismiss }: Props) => {
  const { tokens } = useAppTheme();
  const translateY = useSharedValue(0);
  const [elapsed, setElapsed] = React.useState(() => formatElapsed(session.createdAt));
  const shownAtRef = React.useRef(Date.now());

  React.useEffect(() => {
    shownAtRef.current = Date.now();
    translateY.value = 0;
    setElapsed(formatElapsed(session.createdAt));
    const id = setInterval(() => setElapsed(formatElapsed(session.createdAt)), 1000);
    return () => clearInterval(id);
  }, [session.id, session.createdAt, translateY]);

  const pan = Gesture.Pan()
    .enabled(!isAccepting)
    // Жест включается только после явного движения вниз: касание кнопок и
    // горизонтальный сдвиг пальца карточку не трогают.
    .activeOffsetY(20)
    .failOffsetX([-20, 20])
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
  const venue = venueEntry(session);
  const who = sessionCaller(session);
  const phone = session.user?.phone ?? null;

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
              {phone || ru.operatorPool.noPhone}
            </Text>
          </View>
          {phone ? (
            <Pressable
              onPress={() => callPhone(phone)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={ru.operatorScreens.callA11y}
              style={[
                styles.callBtn,
                { backgroundColor: tokens.colors.surfaceVariant, borderColor: tokens.colors.border },
              ]}
            >
              <Phone size={18} color={tokens.colors.onSurface} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        <ActionButton
          label={isAccepting ? ru.operatorPool.accepting : ru.operatorPool.accept}
          size="large"
          loading={isAccepting}
          onPress={() => {
            if (Date.now() - shownAtRef.current < ACCEPT_GUARD_MS) return;
            onAccept();
          }}
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
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { fontSize: 16, fontWeight: "700" },
  secondary: { fontSize: 13 },
  hint: { fontSize: 12, textAlign: "center" },
});
