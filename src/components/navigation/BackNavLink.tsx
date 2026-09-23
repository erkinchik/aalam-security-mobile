import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { ru } from "../../locale/ru";

type Props = {
  color: string;
  onPress: () => void;
  hitSlop?: number;
  accessibilityLabel?: string;
};

/** Lime «Back» row — ArrowLeft + label (matches stack / bind-venue chrome). */
export function BackNavLink({
  color,
  onPress,
  hitSlop = 12,
  accessibilityLabel = ru.misc.goBack,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.row}
    >
      <ArrowLeft size={18} color={color} strokeWidth={2.5} />
      <Text style={[styles.label, { color }]}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
});
