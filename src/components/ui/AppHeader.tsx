import React, { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  style?: ViewStyle;
}

export const AppHeader = ({ title, subtitle, onBack, rightAction, style }: Props) => {
  const { tokens } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.colors.surface,
          borderBottomColor: tokens.colors.border,
        },
        style,
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={ru.misc.goBack}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={tokens.colors.primary} strokeWidth={2.5} />
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}

      <View style={styles.titleWrap}>
        <Text
          style={[styles.title, { color: tokens.colors.onSurface }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightAction ? <View style={styles.right}>{rightAction}</View> : <View style={styles.placeholder} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  right: {
    width: 36,
    alignItems: "flex-end",
  },
  placeholder: {
    width: 36,
  },
});
