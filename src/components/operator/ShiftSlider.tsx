import React from "react";
import { ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChevronsRight } from "lucide-react-native";
import { useAppTheme } from "../../theme";

const TRACK_PADDING = 4;
const KNOB_SIZE = 56;
/** Доля ширины, после которой жест считается подтверждением. */
const COMMIT_RATIO = 0.75;

interface Props {
  label: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Слайдер «протяните, чтобы заступить». Осознанно требует жеста, а не тапа:
 * выход на смену означает, что оператору сразу начнут приходить вызовы, и
 * случайное касание не должно к этому приводить.
 */
export const ShiftSlider = ({
  label,
  onConfirm,
  loading = false,
  disabled = false,
  accessibilityLabel,
}: Props) => {
  const { tokens } = useAppTheme();
  const [trackWidth, setTrackWidth] = React.useState(0);
  const offset = useSharedValue(0);

  const maxOffset = Math.max(0, trackWidth - KNOB_SIZE - TRACK_PADDING * 2);
  const isLocked = disabled || loading || maxOffset <= 0;

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  // Пока идёт запрос, ручка не должна оставаться в конце — иначе непонятно,
  // сработало ли, и жест нельзя повторить.
  React.useEffect(() => {
    if (!loading) offset.value = withTiming(0, { duration: 180 });
  }, [loading, offset]);

  const pan = Gesture.Pan()
    .enabled(!isLocked)
    .onChange((e) => {
      const next = offset.value + e.changeX;
      offset.value = Math.min(Math.max(next, 0), maxOffset);
    })
    .onEnd(() => {
      if (offset.value >= maxOffset * COMMIT_RATIO) {
        offset.value = withTiming(maxOffset, { duration: 120 });
        runOnJS(onConfirm)();
      } else {
        offset.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: maxOffset > 0 ? 1 - offset.value / maxOffset : 1,
  }));

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.track,
        { backgroundColor: tokens.colors.surfaceVariant, borderColor: tokens.colors.border },
      ]}
    >
      <Animated.Text
        style={[styles.label, { color: tokens.colors.onSurfaceMuted }, labelStyle]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.knob, { backgroundColor: tokens.colors.primary }, knobStyle]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={tokens.colors.onPrimary} />
          ) : (
            <ChevronsRight size={26} color={tokens.colors.onPrimary} strokeWidth={2.5} />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: KNOB_SIZE + TRACK_PADDING * 2,
    borderRadius: 999,
    borderWidth: 1,
    padding: TRACK_PADDING,
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
