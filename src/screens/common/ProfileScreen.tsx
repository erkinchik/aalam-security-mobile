import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";
import { useOperatorStore } from "../../stores/operatorStore";
import { confirmSignOut } from "../../utils/confirmSignOut";
import { AppCard } from "../../components/ui/AppCard";
import { ActionButton } from "../../components/ui/ActionButton";
import { Avatar } from "../../components/ui/Avatar";
import { Divider } from "../../components/ui/Divider";
import { useNavigation } from "@react-navigation/native";
import { roleToRootScreen, RootStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ru } from "../../locale/ru";

const ROLE_LABELS: Record<string, string> = {
  USER: ru.roles.endUser,
  OPERATOR: ru.roles.operator,
  ADMIN: ru.roles.admin,
};

export const ProfileScreen = () => {
  const { tokens } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const hasOpenCall = useOperatorStore((state) =>
    Object.values(state.activeSessionsById).some((session) => session.status !== "CLOSED"),
  );
  const roleRoot = user?.role ? roleToRootScreen[user.role] : null;
  const roleLabel = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—";

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.content}>
        {/* Avatar header */}
        <View style={styles.avatarSection}>
          <Avatar name={user?.displayName?.trim() || user?.email} size={80} />
          <View style={styles.avatarInfo}>
            {/* Имя, если задано; раньше профиль показывал только email, хотя имя есть. */}
            <Text style={[styles.emailText, { color: tokens.colors.onSurface }]} numberOfLines={1}>
              {user?.displayName?.trim() || user?.email || "—"}
            </Text>
            {user?.displayName?.trim() && user?.email ? (
              <Text style={[styles.emailSub, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
            <View
              style={[styles.roleBadge, { backgroundColor: tokens.colors.surfaceVariant, borderColor: tokens.colors.border }]}
            >
              <Text style={[styles.roleText, { color: tokens.colors.onSurfaceMuted }]}>
                {roleLabel}
              </Text>
            </View>
          </View>
          {user?.role === "USER" ? (
            <Pressable
              style={[styles.editAction, { borderColor: tokens.colors.border, backgroundColor: tokens.colors.surface }]}
              onPress={() => navigation.navigate("User", { screen: "UserEditDetails" })}
            >
              <Text style={[styles.editText, { color: tokens.colors.primary }]}>{ru.profileCommon.edit}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Info card */}
        <AppCard>
          <Text style={[styles.sectionLabel, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.profileCommon.accountInfo}
          </Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.profileCommon.email}
            </Text>
            <Text style={[styles.infoValue, { color: tokens.colors.onSurface }]} numberOfLines={1}>
              {user?.email ?? "—"}
            </Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.profileCommon.role}
            </Text>
            <Text style={[styles.infoValue, { color: tokens.colors.onSurface }]}>{roleLabel}</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.profileCommon.access}
            </Text>
            <Text style={[styles.infoValue, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.profileCommon.accessHint}
            </Text>
          </View>
        </AppCard>

        <View style={styles.legalRow}>
          <ActionButton
            variant="ghost"
            size="small"
            label={ru.profileCommon.terms}
            onPress={() => navigation.navigate("Common", { screen: "Terms" })}
          />
          <ActionButton
            variant="ghost"
            size="small"
            label={ru.profileCommon.privacy}
            onPress={() => navigation.navigate("Common", { screen: "Privacy" })}
          />
        </View>

        <View style={styles.spacer} />

        {/* Back to workspace */}
        {roleRoot ? (
          <ActionButton
            variant="secondary"
            label={ru.profileCommon.backWorkspace}
            // pop: вернуться к уже открытому экрану, а не положить второй поверх.
            onPress={() => navigation.navigate(roleRoot, undefined, { pop: true })}
            accessibilityLabel={ru.profileCommon.backWorkspaceA11y}
          />
        ) : null}

        {/* Logout */}
        <ActionButton
          variant="danger"
          label={ru.profileCommon.signOut}
          onPress={() =>
            confirmSignOut(
              () => void logout(),
              hasOpenCall ? ru.profileCommon.signOutBusyOperator : undefined,
            )
          }
          accessibilityLabel={ru.profileCommon.signOutA11y}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, padding: 20, gap: 16 },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingBottom: 4,
  },
  avatarInfo: { flex: 1, gap: 6 },
  emailText: { fontSize: 16, fontWeight: "700" },
  emailSub: { fontSize: 13, marginTop: 2 },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  roleText: { fontSize: 12, fontWeight: "600" },
  editAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  editText: { fontSize: 13, fontWeight: "600" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 13, fontWeight: "500" },
  infoValue: { fontSize: 13, fontWeight: "600", textAlign: "right", flex: 1, marginLeft: 12 },
  divider: { marginVertical: 8 },
  legalRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  spacer: { flex: 1 },
});
