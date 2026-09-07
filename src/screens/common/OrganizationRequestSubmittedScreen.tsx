import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CommonStackParamList, RootStackParamList } from "../../navigation/types";
import { ActionButton } from "../../components/ui/ActionButton";
import { useAppTheme } from "../../theme";
import { spacing } from "../../theme";
import { ru } from "../../locale/ru";

type Props = NativeStackScreenProps<CommonStackParamList, "OrganizationRequestSubmitted">;

export const OrganizationRequestSubmittedScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();

  const onBackHome = () => {
    const rootNav = navigation.getParent<import("@react-navigation/native-stack").NativeStackNavigationProp<RootStackParamList>>();
    rootNav?.navigate("User");
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.content}>
        <View style={styles.successIconWrap}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        <Text style={[styles.message, { color: tokens.colors.onSurfaceMuted }]}>{ru.requestSubmitted.body}</Text>
        <ActionButton label={ru.requestSubmitted.backHome} onPress={onBackHome} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  successIconWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    borderColor: "#166534",
    backgroundColor: "#052E16",
    justifyContent: "center",
    alignItems: "center",
  },
  successIcon: {
    color: "#86EFAC",
    fontSize: 30,
    fontWeight: "700",
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 21,
  },
});
