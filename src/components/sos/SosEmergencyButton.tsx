import React from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  ColorValue,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

export type SosButtonState = "idle" | "sending" | "active" | "disabled";

interface Props {
  state: SosButtonState;
  /** Возвращает, ушёл ли SOS; ошибку вызывающий показывает сам. */
  onTrigger: () => Promise<boolean> | boolean;
  /** Pencil Home / Dashboard: 152px SOS, orange→red gradient, no info block below */
  dashboardStyle?: boolean;
}

const HOLD_MS = 1500;

const BUTTON_SIZE = 210;
const PULSE_SIZE = 250;
const GLOW_SIZE = 250;

/** Matches Pencil node 240pX / NiPGo — inner 152, ring 196 */
const DASHBOARD_BUTTON = 152;
const DASHBOARD_PULSE = 196;
const DASHBOARD_GLOW = 184;
const DASHBOARD_GRADIENT: [ColorValue, ColorValue] = ["#FF8852", "#EF4444"];
/** Dashboard SOS active: brighter amber → deep orange (same line as idle orange→red) */
const DASHBOARD_ACTIVE_GRADIENT: [ColorValue, ColorValue] = ["#FBBF24", "#EA580C"];

const haptic = (type: Haptics.NotificationFeedbackType) =>
  Haptics.notificationAsync(type).catch((error: unknown) => {
    console.warn("sos-button: вибрация недоступна", error);
  });

export const SosEmergencyButton = ({ state, onTrigger, dashboardStyle }: Props) => {
  const theme = useAppTheme();
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.55);
  const glowOpacity = useSharedValue(0.15);
  const holdProgress = useSharedValue(0);
  const [isConfirmVisible, setIsConfirmVisible] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const hapticIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  React.useEffect(() => () => {
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (reduceMotion) {
      pulseScale.value = 1;
      pulseOpacity.value = 0;
      glowOpacity.value = 0;
      return;
    }
    pulseScale.value = withRepeat(
      withTiming(1.22, { duration: 1700, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    pulseOpacity.value = withRepeat(withTiming(0, { duration: 1700 }), -1, false);
    glowOpacity.value =
      state === "active"
        ? withRepeat(withTiming(0.45, { duration: 700 }), -1, true)
        : withTiming(0.15, { duration: 350 });
  }, [glowOpacity, pulseOpacity, pulseScale, reduceMotion, state]);

  const holdBoost = useSharedValue(0);
  useAnimatedReaction(
    () => holdProgress.value,
    (progress) => {
      holdBoost.value = interpolate(progress, [0, 1], [0, 0.4]);
    },
  );

  const animatedScale = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const animatedPulse = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: Math.min(1, pulseOpacity.value + holdBoost.value),
  }));
  const animatedGlow = useAnimatedStyle(() => ({
    opacity: Math.min(1, glowOpacity.value + holdBoost.value),
  }));

  const disabled = state === "disabled" || state === "sending";
  const isActive = state === "active";
  const isSending = state === "sending";
  const gradientColors: [ColorValue, ColorValue] = (() => {
    if (isActive) {
      if (dashboardStyle) return DASHBOARD_ACTIVE_GRADIENT;
      const ag = theme.tokens.colors.activeGradient;
      if (ag) return [ag[0], ag[1]] as [ColorValue, ColorValue];
      return [theme.tokens.colors.warning, "#EF4444"];
    }
    if (dashboardStyle) return DASHBOARD_GRADIENT;
    const dg = theme.tokens.colors.dangerGradient;
    if (dg) return dg as [ColorValue, ColorValue];
    return [theme.tokens.colors.danger, theme.tokens.status.NEW.border];
  })();
  const contextTitle = isActive
    ? ru.sos.activeTitle
    : isSending
      ? ru.sos.sendingAlert
      : ru.sos.emergencyTitle;
  const contextDescription = isActive ? ru.sos.activeHint : ru.sos.emergencyHint;

  const btnSize = dashboardStyle ? DASHBOARD_BUTTON : BUTTON_SIZE;
  const pulseSize = dashboardStyle ? DASHBOARD_PULSE : PULSE_SIZE;
  const glowSize = dashboardStyle ? DASHBOARD_GLOW : GLOW_SIZE;
  const labelOnGradient = dashboardStyle ? "#FFFFFF" : theme.tokens.colors.onDanger;

  /**
   * Вибрация — только обратная связь. Раньше она ждалась до отправки, и отказ
   * Haptics мог не дать SOS уйти; а «успех» вибрировал и при неудаче, потому
   * что onTrigger ошибок не бросает.
   */
  const fireTrigger = async () => {
    void haptic(Haptics.NotificationFeedbackType.Warning);
    const sent = await onTrigger();
    void haptic(
      sent ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  };

  const clearHoldState = React.useCallback(() => {
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
    cancelAnimation(holdProgress);
    holdProgress.value = 0;
  }, []);

  const onPressIn = () => {
    if (disabled) return;
    if (!reduceMotion) {
      scale.value = withSpring(0.97, { damping: 14, stiffness: 260 });
      holdProgress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (state === "idle") {
      let step = 0;
      hapticIntervalRef.current = setInterval(() => {
        step += 1;
        if (step === 1) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        else if (step >= 2) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 400);
    }
  };

  const onPressOut = () => {
    clearHoldState();
    if (!reduceMotion) {
      scale.value = withSpring(1, { damping: 14, stiffness: 260 });
    }
  };

  return (
    <View style={[styles.wrapper, dashboardStyle && styles.wrapperDashboard]}>
      {!reduceMotion && (state === "idle" || state === "sending" || state === "active") && (
        <Animated.View
          style={[
            styles.pulse,
            { width: pulseSize, height: pulseSize, borderRadius: pulseSize / 2 },
            dashboardStyle
              ? {
                  borderColor: "#27272A",
                  backgroundColor: "#18181B",
                  borderWidth: 1,
                }
              : state === "active"
                ? { borderColor: theme.tokens.colors.warning }
                : { borderColor: theme.tokens.colors.danger },
            animatedPulse,
          ]}
        />
      )}

      <Animated.View style={animatedScale}>
        <Animated.View
          style={[
            styles.glow,
            {
              width: glowSize,
              height: glowSize,
              borderRadius: glowSize / 2,
              left: (btnSize - glowSize) / 2,
              top: (btnSize - glowSize) / 2,
            },
            { backgroundColor: isActive ? theme.tokens.colors.warning : theme.tokens.colors.danger },
            animatedGlow,
          ]}
        />
        <Pressable
          style={[
            styles.button,
            { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
            disabled && styles.disabled,
          ]}
          disabled={disabled}
          onPressIn={() => void onPressIn()}
          onPressOut={onPressOut}
          onLongPress={() => void fireTrigger()}
          delayLongPress={HOLD_MS}
          onPress={() => {
            if (isSending) return;
            if (isActive) {
              void fireTrigger();
              return;
            }
            setIsConfirmVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={isActive ? ru.sos.a11yActive : ru.sos.a11yButton}
          accessibilityHint={ru.sos.a11yHint}
        >
          <LinearGradient
            colors={gradientColors}
            style={[styles.gradient, { borderRadius: btnSize / 2 }]}
            start={isActive ? { x: 0.5, y: 0 } : { x: 0, y: 0 }}
            end={isActive ? { x: 0.5, y: 1 } : { x: 1, y: 1 }}
          >
            {isSending ? (
              <ActivityIndicator color={labelOnGradient} />
            ) : isActive ? (
              <View style={styles.labelStack}>
                <Text
                  style={[
                    styles.label,
                    styles.labelActiveLine1,
                    dashboardStyle && styles.labelDashboardActiveLine1,
                    { color: labelOnGradient },
                  ]}
                >
                  SOS
                </Text>
                <Text
                  style={[
                    styles.labelActiveLine2,
                    dashboardStyle && styles.labelDashboardActiveLine2,
                    { color: labelOnGradient },
                  ]}
                >
                  {ru.sos.live}
                </Text>
              </View>
            ) : (
              <Text style={[styles.label, dashboardStyle && styles.labelDashboard, { color: labelOnGradient }]}>
                SOS
              </Text>
            )}
            {!dashboardStyle ? (
              <Text style={[styles.helper, { color: theme.tokens.colors.onDanger }]}>
                {isActive ? ru.sos.tapSession : ru.sos.holdHint}
              </Text>
            ) : null}
          </LinearGradient>
        </Pressable>
      </Animated.View>

      {!dashboardStyle ? (
        <View style={styles.infoBlock}>
          <Text style={[styles.infoTitle, { color: theme.tokens.colors.onSurface }]}>{contextTitle}</Text>
          <Text style={[styles.infoText, { color: theme.tokens.colors.onSurfaceMuted }]}>{contextDescription}</Text>
        </View>
      ) : null}

      <Modal
        visible={isConfirmVisible}
        transparent
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={() => setIsConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.tokens.colors.surface, borderColor: theme.tokens.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.tokens.colors.onSurface }]}>{ru.sos.confirmTitle}</Text>
            <Text style={[styles.modalBody, { color: theme.tokens.colors.onSurfaceMuted }]}>
              {ru.sos.confirmBody}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setIsConfirmVisible(false)}
                style={styles.modalSecondary}
                accessibilityRole="button"
                accessibilityLabel={ru.sos.a11yCancel}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.tokens.colors.onSurfaceMuted }]}>
                  {ru.sos.cancel}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIsConfirmVisible(false);
                  void fireTrigger();
                }}
                style={[styles.modalDanger, { backgroundColor: theme.tokens.colors.danger }]}
                accessibilityRole="button"
                accessibilityLabel={ru.sos.a11yConfirm}
                accessibilityHint={ru.sos.a11yConfirmHint}
              >
                <Text style={[styles.modalDangerText, { color: theme.tokens.colors.onDanger }]}>{ru.sos.sendSos}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 260,
  },
  wrapperDashboard: {
    minHeight: 196,
  },
  pulse: {
    position: "absolute",
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: 999,
    borderWidth: 2,
  },
  glow: {
    position: "absolute",
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  gradient: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontWeight: "800",
    fontSize: 32,
    letterSpacing: 1.2,
  },
  labelStack: {
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  labelActiveLine1: {
    fontSize: 30,
    letterSpacing: 2,
    lineHeight: 34,
  },
  labelDashboardActiveLine1: {
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: 1.5,
  },
  labelActiveLine2: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3.2,
    marginTop: 2,
    opacity: 0.92,
  },
  labelDashboardActiveLine2: {
    fontSize: 9,
    letterSpacing: 2.4,
    marginTop: 0,
  },
  labelDashboard: {
    fontSize: 34,
    letterSpacing: 0,
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
  },
  infoBlock: {
    marginTop: 14,
    alignItems: "center",
    maxWidth: 280,
    paddingHorizontal: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  infoText: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  modalCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalBody: {
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalSecondaryText: {
    fontWeight: "600",
  },
  modalDanger: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalDangerText: {
    fontWeight: "700",
  },
});
