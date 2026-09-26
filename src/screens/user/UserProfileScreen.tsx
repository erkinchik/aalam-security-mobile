import React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ChevronRight } from "lucide-react-native";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CompositeNavigationProp } from "@react-navigation/native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/authStore";
import { useUserSessionStore } from "../../stores/userSessionStore";
import { AppCard } from "../../components/ui/AppCard";
import { Avatar } from "../../components/ui/Avatar";
import { PhoneVerificationCard } from "../../components/profile/PhoneVerificationCard";
import { useUserTabBarBottomInset } from "../../navigation/userTabBarLayout";
import { UserTabParamList, UserStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { spacing } from "../../theme";
import { ru } from "../../locale/ru";
import { usersApi } from "../../api/modules/users";
import { organizationApi } from "../../api/modules/organization";
import { toastBus } from "../../ui/feedback/toastBus";
import { useEmergencyStore } from "../../stores/emergencyStore";
import { confirmSignOut } from "../../utils/confirmSignOut";

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<UserTabParamList, "Profile">,
  NativeStackNavigationProp<UserStackParamList>
>;

const ROLE_LABELS: Record<string, string> = {
  USER: ru.roles.endUser,
  OPERATOR: ru.roles.operator,
  ADMIN: ru.roles.admin,
};

export const UserProfileScreen = () => {
  const { tokens } = useAppTheme();
  const tabBarBottomInset = useUserTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const hasActiveSos = useEmergencyStore(
    (state) => Boolean(state.activeSession) && state.activeSession?.status !== "CLOSED",
  );
  const currentVenueName = useUserSessionStore((s) => s.currentVenueName);
  const { data: memberships } = useQuery({
    queryKey: ["organizations", user?.id],
    queryFn: organizationApi.getMyOrganizations,
    enabled: Boolean(user?.id),
  });
  // Сменить организацию можно только из «Моей организации»: новый код молча
  // заменяет членство, поэтому здесь ввод кода — лишь для тех, кто ни в одной.
  const hasOrganization = (memberships?.length ?? 0) > 0;
  const roleLabel = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—";

  const stackNav = navigation.getParent<NativeStackNavigationProp<UserStackParamList>>();
  const rootNav = stackNav?.getParent();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteInput, setDeleteInput] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const canConfirmDelete =
    deleteInput.trim().toUpperCase() === ru.deleteAccount.confirmKeyword;

  const onCloseDelete = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteInput("");
  };

  const onConfirmDelete = async () => {
    if (!canConfirmDelete || deleting) return;
    setDeleting(true);
    try {
      await usersApi.deleteAccount();
      toastBus.show({
        message: ru.deleteAccount.successToast,
        severity: "success",
      });
      setDeleteOpen(false);
      setDeleteInput("");
      // logout clears auth state and triggers navigation back to Login
      await logout();
    } catch (err) {
      let message: string = ru.deleteAccount.errorGeneric;
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          message = ru.deleteAccount.errorActiveEmergency;
        } else if (err.response?.status === 403) {
          message = ru.deleteAccount.errorForbidden;
        }
      }
      toastBus.show({ message, severity: "error" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView edges={["left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            padding: spacing.lg,
            gap: 12,
            paddingBottom: spacing.md + tabBarBottomInset,
            paddingTop: Math.max(spacing.lg, insets.top + 8),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: tokens.colors.onSurface }]}>{ru.profileUser.pageTitle}</Text>

        <AppCard style={styles.avatarSection}>
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
              style={[
                styles.roleBadge,
                { backgroundColor: tokens.colors.surfaceVariant, borderColor: tokens.colors.border },
              ]}
            >
              <Text style={[styles.roleText, { color: tokens.colors.onSurfaceMuted }]}>
                {roleLabel}
              </Text>
            </View>
          </View>
          <Pressable
            style={[styles.editAction, { borderColor: tokens.colors.border, backgroundColor: tokens.colors.surface }]}
            onPress={() => stackNav?.navigate("UserEditDetails")}
          >
            <Text style={[styles.editText, { color: tokens.colors.primary }]}>{ru.profileUser.edit}</Text>
          </Pressable>
        </AppCard>

        <PhoneVerificationCard />

        <Text style={[styles.sectionTitle, { color: tokens.colors.onSurface }]}>
          {ru.profileUser.securitySettings}
        </Text>
        <AppCard style={styles.settingGroup}>
          {!hasOrganization ? (
            <>
              <Pressable style={styles.settingRow} onPress={() => stackNav?.navigate("UserBindVenue")}>
                <Text style={[styles.settingLabel, { color: tokens.colors.onSurface }]}>
                  {currentVenueName
                    ? `${ru.profileUser.venuePrefix}${currentVenueName}`
                    : ru.profileUser.joinVenue}
                </Text>
                <ChevronRight size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
              </Pressable>
              <View style={[styles.rowDivider, { backgroundColor: tokens.colors.border }]} />
            </>
          ) : null}
          <Pressable style={styles.settingRow} onPress={() => stackNav?.navigate("UserSubscriptionRequest")}>
            <Text style={[styles.settingLabel, { color: tokens.colors.onSurface }]}>{ru.profileUser.subscriptionRequest}</Text>
            <ChevronRight size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          </Pressable>
          <View style={[styles.rowDivider, { backgroundColor: tokens.colors.border }]} />
          <Pressable
            style={styles.settingRow}
            onPress={() => (rootNav as any)?.navigate("Common", { screen: "RequestNewOrganization" })}
          >
            <Text style={[styles.settingLabel, { color: tokens.colors.onSurface }]}>
              {ru.profileUser.requestOrg}
            </Text>
            <ChevronRight size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          </Pressable>
        </AppCard>

        <View style={styles.linksRow}>
          <Pressable onPress={() => (rootNav as any)?.navigate("Common", { screen: "Terms" })}>
            <Text style={[styles.linkText, { color: tokens.colors.onSurfaceMuted }]}>{ru.profileUser.terms}</Text>
          </Pressable>
          <Text style={[styles.dot, { color: tokens.colors.border }]}>·</Text>
          <Pressable onPress={() => (rootNav as any)?.navigate("Common", { screen: "Privacy" })}>
            <Text style={[styles.linkText, { color: tokens.colors.onSurfaceMuted }]}>{ru.profileUser.privacy}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.logoutButton, { backgroundColor: "#3F1D1D" }]}
          onPress={() =>
            confirmSignOut(
              () => void logout(),
              hasActiveSos ? ru.profileCommon.signOutBusyUser : undefined,
            )
          }
          accessibilityRole="button"
          accessibilityLabel={ru.profileCommon.signOutA11y}
        >
          <Text style={[styles.logoutText, { color: "#FCA5A5" }]}>{ru.profileUser.logout}</Text>
        </Pressable>

        {user?.role === "USER" ? (
          <Pressable
            style={styles.dangerButton}
            onPress={() => setDeleteOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={ru.profileUser.deleteAccount}
          >
            <Text style={styles.dangerText}>{ru.profileUser.deleteAccount}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={onCloseDelete}
      >
        {/* Без этого клавиатуру поля «УДАЛИТЬ» закрывал только Enter, а на
            маленьких экранах она перекрывала кнопки. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKeyboard}
        >
          <Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss} accessible={false}>
            <View
              style={[
                styles.modalCard,
                { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border },
              ]}
            >
              <Text style={[styles.modalTitle, { color: tokens.colors.onSurface }]}>
                {ru.deleteAccount.title}
              </Text>
              <Text style={[styles.modalBody, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.deleteAccount.warning}
              </Text>

              <Text style={[styles.consequencesTitle, { color: tokens.colors.onSurface }]}>
                {ru.deleteAccount.consequencesTitle}
              </Text>
              <Text style={[styles.consequenceItem, { color: tokens.colors.onSurfaceMuted }]}>
                • {ru.deleteAccount.consequence1}
              </Text>
              <Text style={[styles.consequenceItem, { color: tokens.colors.onSurfaceMuted }]}>
                • {ru.deleteAccount.consequence2}
              </Text>
              <Text style={[styles.consequenceItem, { color: tokens.colors.onSurfaceMuted }]}>
                • {ru.deleteAccount.consequence3}
              </Text>

              <Text style={[styles.confirmHint, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.deleteAccount.confirmHint}
              </Text>
              <TextInput
                value={deleteInput}
                onChangeText={setDeleteInput}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
                style={[
                  styles.confirmInput,
                  {
                    color: tokens.colors.onSurface,
                    borderColor: tokens.colors.border,
                    backgroundColor: tokens.colors.background,
                  },
                ]}
                placeholder={ru.deleteAccount.confirmKeyword}
                placeholderTextColor={tokens.colors.onSurfaceMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancel, { borderColor: tokens.colors.border }]}
                  onPress={onCloseDelete}
                  disabled={deleting}
                >
                  <Text style={[styles.modalCancelText, { color: tokens.colors.onSurface }]}>
                    {ru.deleteAccount.cancelButton}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalBtn,
                    styles.modalConfirm,
                    (!canConfirmDelete || deleting) && styles.modalConfirmDisabled,
                  ]}
                  onPress={() => void onConfirmDelete()}
                  disabled={!canConfirmDelete || deleting}
                >
                  <Text style={styles.modalConfirmText}>
                    {deleting
                      ? ru.deleteAccount.deletingButton
                      : ru.deleteAccount.confirmButton}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {},
  pageTitle: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    justifyContent: "space-between",
  },
  avatarInfo: { flex: 1, gap: 8 },
  emailText: { fontSize: 15, fontWeight: "700" },
  emailSub: { fontSize: 13, marginTop: 2 },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roleText: { fontSize: 12, fontWeight: "600" },
  editAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  editText: { fontSize: 13, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  settingGroup: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  settingLabel: { fontSize: 14, fontWeight: "600" },
  rowDivider: {
    height: 1,
    opacity: 0.8,
  },
  linksRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  linkText: {
    fontSize: 12,
    fontWeight: "500",
  },
  dot: {
    fontSize: 12,
    fontWeight: "500",
  },
  logoutButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "700",
  },
  dangerButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "transparent",
  },
  dangerText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "600",
  },
  modalKeyboard: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalBody: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  consequencesTitle: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  consequenceItem: { fontSize: 13, lineHeight: 18 },
  confirmHint: { fontSize: 12, marginTop: 10 },
  confirmInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancel: { borderWidth: 1 },
  modalCancelText: { fontSize: 14, fontWeight: "600" },
  modalConfirm: { backgroundColor: "#7F1D1D" },
  modalConfirmDisabled: { opacity: 0.4 },
  modalConfirmText: { color: "#FECACA", fontSize: 14, fontWeight: "700" },
});
