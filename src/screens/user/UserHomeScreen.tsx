import React from "react";
import { CompositeScreenProps, useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUserTabBarBottomInset } from "../../navigation/userTabBarLayout";
import { UserStackParamList, UserTabParamList } from "../../navigation/types";
import { useAuthStore } from "../../stores/authStore";
import { useUserSessionStore } from "../../stores/userSessionStore";
import { useEmergencyStore } from "../../stores/emergencyStore";
import { SosEmergencyButton } from "../../components/sos/SosEmergencyButton";
import { emergencyApi } from "../../api/modules/emergency";
import {
  formatVenueAddress,
  organizationApi,
  type Venue,
} from "../../api/modules/organization";
import { toastBus } from "../../ui/feedback/toastBus";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import type { EmergencyStatus } from "../../types/emergency";
import { handleApiError } from "../../utils/error/handleApiError";

/** Pencil ZVLRX — Home / Dashboard */
const P = {
  bg: "#0A0A0A",
  card: "#18181B",
  border: "#27272A",
  chipLeftBg: "#27272A",
  chipRightBg: "#111827",
  textBlue: "#93C5FD",
  muted: "#A1A1AA",
  caption: "#52525B",
  sessionMuted: "#71717A",
} as const;

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

type Props = CompositeScreenProps<
  BottomTabScreenProps<UserTabParamList, "Home">,
  NativeStackScreenProps<UserStackParamList>
>;

const STATUS_RU: Record<EmergencyStatus, string> = {
  NEW: ru.emergencyStatus.NEW,
  ASSIGNED: ru.emergencyStatus.ASSIGNED,
  IN_PROGRESS: ru.emergencyStatus.IN_PROGRESS,
  CLOSED: ru.emergencyStatus.CLOSED,
};

export const UserHomeScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const tabBarBottomInset = useUserTabBarBottomInset();
  const currentVenueId = useUserSessionStore((state) => state.currentVenueId);
  const currentVenueName = useUserSessionStore((state) => state.currentVenueName);
  const hasIndividualSubscription = useUserSessionStore((state) => state.hasIndividualSubscription);
  const setIndividualSubscription = useUserSessionStore((state) => state.setIndividualSubscription);
  const profileUser = useAuthStore((state) => state.user);

  // Локальный флаг — лишь кэш для старта без сети, правду знает сервер. Без
  // синхронизации флаг от демо-активации переживал конец подписки: главный
  // экран считал SOS доступным, не предлагал продлить, а сервер отказывал.
  React.useEffect(() => {
    if (!profileUser) return;
    const active = profileUser.individualSubscriptionActive === true;
    if (active !== hasIndividualSubscription) void setIndividualSubscription(active);
  }, [profileUser, hasIndividualSubscription, setIndividualSubscription]);
  const isBootstrapped = useAuthStore((state) => state.isBootstrapped);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id);
  const activeSession = useEmergencyStore((state) => state.activeSession);
  const setActiveSession = useEmergencyStore((state) => state.setActiveSession);
  const acquireSosStartLock = useEmergencyStore((state) => state.acquireSosStartLock);
  const releaseSosStartLock = useEmergencyStore((state) => state.releaseSosStartLock);
  const resetSosCooldown = useEmergencyStore((state) => state.resetSosCooldown);
  const loadOrganizations = Boolean(isBootstrapped && isAuthenticated && userId);
  const {
    data: membershipsData,
    isLoading: orgsLoading,
    isError: orgsError,
    refetch: refetchOrgs,
  } = useQuery({
    queryKey: ["organizations", userId],
    queryFn: organizationApi.getMyOrganizations,
    enabled: loadOrganizations,
  });
  const memberships = React.useMemo(() => membershipsData ?? [], [membershipsData]);
  const [buttonState, setButtonState] = React.useState<"idle" | "sending" | "active" | "disabled">(
    activeSession ? "active" : "idle",
  );

  React.useEffect(() => {
    setButtonState(activeSession ? "active" : "idle");
  }, [activeSession]);

  // Redirect to active emergency if session exists when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (activeSession) {
        navigation.navigate("UserActiveEmergency", { sessionId: activeSession.id });
      }
    }, [activeSession, navigation]),
  );

  const hasOrganization = memberships.length > 0;
  // Тип организации убран: личных организаций нет, все записи — компании.
  const isOwner = (m: (typeof memberships)[number]) =>
    (m.role ?? "").toUpperCase() === "OWNER";
  const isBusinessOwner = memberships.some(isOwner);
  const ownerMembership = memberships.find(isOwner);
  const orgWideMembership = memberships.find((m) => {
    const role = (m.role ?? "").toUpperCase();
    return (role === "MEMBER" || role === "MANAGER") && !m.venueId;
  });
  const isOrgWideEmployee = Boolean(orgWideMembership);
  const branchPickerMembership = ownerMembership ?? orgWideMembership;
  const branchVenues = React.useMemo<Venue[]>(
    () => branchPickerMembership?.organization.venues ?? [],
    [branchPickerMembership?.organization.venues],
  );
  const serverIndividual = Boolean(profileUser?.individualSubscriptionActive);
  const showBranchPicker = isBusinessOwner || isOrgWideEmployee;
  const showGpsModeToggle =
    isBusinessOwner ||
    (isOrgWideEmployee && (serverIndividual || hasIndividualSubscription));

  const [sosMode, setSosMode] = React.useState<"gps" | "venue">("gps");
  const [selectedOwnerVenueId, setSelectedOwnerVenueId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!showGpsModeToggle) {
      setSosMode("venue");
    }
  }, [showGpsModeToggle]);

  React.useEffect(() => {
    if (!showBranchPicker || branchVenues.length === 0) return;
    setSelectedOwnerVenueId((prev) => {
      if (prev && branchVenues.some((v) => v.id === prev)) return prev;
      return branchVenues[0]!.id;
    });
  }, [showBranchPicker, branchVenues]);

  const assignedVenue = memberships
    .flatMap((member) => member.organization.venues ?? [])
    .find((venue) => venue.id === currentVenueId);
  // Статус повторяет то, куда уйдёт SOS: раньше в режиме GPS он показывал адрес
  // первого филиала, а при личной подписке — «Личный тариф» вместо организации.
  const effectiveSosMode = showBranchPicker ? (showGpsModeToggle ? sosMode : "venue") : null;
  const pickedBranchVenue =
    effectiveSosMode === "venue" && selectedOwnerVenueId
      ? branchVenues.find((v) => v.id === selectedOwnerVenueId)
      : undefined;
  const venueForAddressLine = showBranchPicker ? pickedBranchVenue : assignedVenue;
  const venueAddressLine = venueForAddressLine ? formatVenueAddress(venueForAddressLine) : "";
  const hasAssignedVenue = Boolean(currentVenueId);
  const venueStatusText =
    effectiveSosMode === "gps"
      ? ru.userHome.gpsVenueLine
      : effectiveSosMode === "venue"
        ? pickedBranchVenue?.name ?? ru.userHome.notAssigned
        : hasAssignedVenue
          ? currentVenueName ?? ru.userHome.notAssigned
          : ru.userHome.personalMode;
  const canUseApp =
    serverIndividual ||
    hasIndividualSubscription ||
    hasAssignedVenue ||
    isBusinessOwner ||
    (isOrgWideEmployee && branchVenues.length > 0);
  const inactiveReason = !hasOrganization && !hasIndividualSubscription ? "no_access" : "needs_assignment";
  /** Пользователь без компании — без предупреждений «нужна точка» и без блока «Моя организация». */
  const isNewUserPersonalHome = !canUseApp && !hasOrganization;

  /** true — SOS ушёл. Кнопка по нему решает, какую вибрацию дать. */
  const onStartSos = async (): Promise<boolean> => {
    if (activeSession) {
      // Тревога уже идёт — переходим к ней. Это не неудача: вибрация «ошибка»
      // здесь пугала бы.
      navigation.navigate("UserActiveEmergency", { sessionId: activeSession.id });
      return true;
    }
    if (!canUseApp) {
      toastBus.show({
        message: ru.userHome.toastNeedAccess,
        severity: "warning",
      });
      return false;
    }
    // Atomic guard against duplicate /emergency/start requests from
    // rapid taps, racing presses on different controls, or React state lag.
    if (!acquireSosStartLock()) {
      toastBus.show({
        message: ru.userHome.sosAlreadyInFlight,
        severity: "warning",
      });
      return false;
    }
    setButtonState("sending");
    try {
      let startOpts: { venueId?: string } | undefined;

      if (showBranchPicker) {
        const effectiveMode = showGpsModeToggle ? sosMode : "venue";
        if (effectiveMode === "venue") {
          if (!selectedOwnerVenueId) {
            setButtonState("idle");
            toastBus.show({
              message: ru.userHome.ownerNoVenueSelected,
              severity: "warning",
            });
            return false;
          }
          startOpts = { venueId: selectedOwnerVenueId };
        } else {
          startOpts = undefined;
        }
      } else {
        startOpts = currentVenueId ? { venueId: currentVenueId } : undefined;
      }

      const session = await emergencyApi.start(startOpts);
      setActiveSession(session);
      toastBus.show({ message: ru.userHome.sosSent, severity: "success" });
      navigation.navigate("UserActiveEmergency");
      return true;
    } catch (err: unknown) {
      setButtonState("idle");
      // Причина важна: «нужна подписка», «нет сети» и «уже отправляется» требуют
      // разных действий, а раньше всё сводилось к «не удалось».
      const { status, code, message } = handleApiError(err);
      const text =
        status === undefined || (code && ru.errorCodes[code])
          ? message
          : status === 409
            ? // Backend (REL-2) returns 409 when a concurrent SOS is in flight.
              ru.userHome.sosAlreadyInFlight
            : ru.userHome.sosFail;
      toastBus.show({ message: text, severity: "error" });
      // Сервер ответил отказом — повтор сразу не дубль. Иначе быстрый повтор
      // упирался в двухсекундную паузу и получал «уже отправляется».
      resetSosCooldown();
      return false;
    } finally {
      releaseSosStartLock();
    }
  };

  // Без тревоги плашка писала «Сессия: скрыта» — пустое место, которое ничего не
  // сообщало. Показываем её, только когда есть что показать.
  const sessionChip =
    activeSession && activeSession.status
      ? `${ru.userHome.sessionPrefix}${STATUS_RU[activeSession.status] ?? activeSession.status}`
      : null;

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: tokens.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabBarBottomInset,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.homeTitle}>{ru.userHome.title}</Text>
        {loadOrganizations && orgsLoading ? (
          <View style={styles.orgLoadingBlock}>
            <ActivityIndicator size="large" color="#C4F82A" />
            <Text style={[styles.orgLoadingText, { color: P.muted }]}>{ru.misc.loading}</Text>
          </View>
        ) : orgsError && !membershipsData ? (
          // Карточку ошибки — только когда показать нечего. Раньше неудачное
          // обновление в плохой сети прятало уже загруженные данные вместе с
          // кнопкой SOS.
          <Pressable
            onPress={() => void refetchOrgs()}
            style={[styles.orgErrorCard, { borderColor: P.border, backgroundColor: P.card }]}
            accessibilityRole="button"
          >
            <Text style={[styles.orgErrorTitle, { color: "#FFFFFF" }]}>{ru.userHome.orgLoadError}</Text>
            <Text style={[styles.orgErrorRetry, { color: "#C4F82A" }]}>{ru.misc.tryAgain}</Text>
          </Pressable>
        ) : !canUseApp ? (
          <>
            {!isNewUserPersonalHome ? (
              <>
                <View style={[styles.inactiveCard, { borderColor: P.border, backgroundColor: P.card }]}>
                  <Text style={styles.inactiveTitle}>
                    {inactiveReason === "no_access" ? ru.userHome.inactiveAccount : ru.userHome.inactiveBranch}
                  </Text>
                  <Text style={[styles.inactiveMessage, { color: P.muted }]}>
                    {inactiveReason === "no_access"
                      ? ru.userHome.msgNoAccess
                      : ru.userHome.msgNeedBranch}
                  </Text>
                </View>
                {hasOrganization ? (
                  <Pressable
                    onPress={() => navigation.navigate("UserOrganization")}
                    style={[styles.venueDetailsRow, { borderColor: P.border, backgroundColor: P.card }]}
                    accessibilityRole="button"
                  >
                    <View style={styles.venueTextWrap}>
                      <Text style={styles.venueTitle}>{ru.userHome.myOrg}</Text>
                      <Text style={[styles.venueSub, { color: P.sessionMuted }]} numberOfLines={1}>
                        {memberships[0]?.organization.name ?? ru.userHome.myOrgSubInactive}
                      </Text>
                    </View>
                    <Text style={[styles.venueArrow, { color: "#C4F82A" }]}>→</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            <View style={styles.ctaStack}>
              <Pressable
                onPress={() => navigation.navigate("UserBindVenue")}
                style={styles.primaryCta}
                accessibilityRole="button"
              >
                <Text style={styles.primaryCtaText}>{ru.userHome.joinOrg}</Text>
                <Text style={styles.primaryCtaText}>→</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.getParent()?.navigate("Common", { screen: "RequestNewOrganization" } as never)}
                style={[styles.secondaryCta, { borderColor: P.border }]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryCtaText}>{ru.userHome.createOrg}</Text>
                <Text style={styles.secondaryCtaArrow}>→</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("UserSubscriptionRequest")}
                style={[styles.secondaryCta, { borderColor: P.border }]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryCtaText}>{ru.userHome.requestSubscription}</Text>
                <Text style={styles.secondaryCtaArrow}>→</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.statusCard, { borderColor: P.border, backgroundColor: P.card }]}>
              <View style={styles.statusTopRow}>
                <Text style={[styles.statusLabel, { color: P.muted }]}>{ru.userHome.status}</Text>
                <View style={styles.readyBadge}>
                  <Text style={styles.readyText}>{ru.userHome.ready}</Text>
                </View>
              </View>
              <Text style={styles.orgLine}>
                {`${ru.userHome.orgPrefix} ${
                  memberships[0]?.organization.name ?? ru.userHome.individualPlan
                }`}
              </Text>
              <Text style={[styles.assignedLine, { color: P.muted }]}>
                {`${ru.userHome.venuePrefix} ${venueStatusText}`}
              </Text>
              {venueAddressLine ? (
                <Text style={[styles.locationLine, { color: P.sessionMuted }]}>
                  {ru.userHome.locationPrefix} {venueAddressLine}
                </Text>
              ) : null}
            </View>

            {hasOrganization ? (
              <Pressable
                onPress={() => navigation.navigate("UserOrganization")}
                style={[styles.venueDetailsRow, { borderColor: P.border, backgroundColor: P.card }]}
                accessibilityRole="button"
              >
                <View style={styles.venueTextWrap}>
                  <Text style={styles.venueTitle}>{ru.userHome.myOrg}</Text>
                  <Text style={[styles.venueSub, { color: P.sessionMuted }]} numberOfLines={1}>
                    {memberships[0]?.organization.name ?? ru.userHome.myOrgSubActive}
                  </Text>
                </View>
                <Text style={[styles.venueArrow, { color: "#C4F82A" }]}>→</Text>
              </Pressable>
            ) : null}

            <View style={styles.sosBlock}>
              <SosEmergencyButton state={buttonState} onTrigger={onStartSos} dashboardStyle />
              {showBranchPicker ? (
                <View style={styles.ownerSosSection}>
                  {showGpsModeToggle ? (
                  <View style={styles.ownerModeRow}>
                    <Pressable
                      onPress={() => setSosMode("gps")}
                      style={[
                        styles.ownerModePill,
                        { borderColor: P.border, backgroundColor: P.card },
                        sosMode === "gps" && styles.ownerModePillActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sosMode === "gps" }}
                    >
                      <Text
                        style={[
                          styles.ownerModePillText,
                          { color: sosMode === "gps" ? "#0A0A0A" : P.muted },
                        ]}
                        numberOfLines={2}
                      >
                        {ru.userHome.sosModeGps}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSosMode("venue")}
                      style={[
                        styles.ownerModePill,
                        { borderColor: P.border, backgroundColor: P.card },
                        sosMode === "venue" && styles.ownerModePillActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sosMode === "venue" }}
                    >
                      <Text
                        style={[
                          styles.ownerModePillText,
                          { color: sosMode === "venue" ? "#0A0A0A" : P.muted },
                        ]}
                        numberOfLines={2}
                      >
                        {ru.userHome.sosModeVenue}
                      </Text>
                    </Pressable>
                  </View>
                  ) : null}
                  {(!showGpsModeToggle || sosMode === "venue") ? (
                    branchVenues.length === 0 ? (
                      <Text style={[styles.ownerVenuesEmpty, { color: P.sessionMuted }]}>
                        {ru.userHome.ownerVenuesEmpty}
                      </Text>
                    ) : (
                      <View style={styles.ownerVenueList}>
                        <Text style={[styles.ownerVenuesHint, { color: P.muted }]}>
                          {ru.userHome.ownerVenuesHint}
                        </Text>
                        {branchVenues.map((v) => {
                          const selected = v.id === selectedOwnerVenueId;
                          const line = formatVenueAddress(v);
                          return (
                            <Pressable
                              key={v.id}
                              onPress={() => setSelectedOwnerVenueId(v.id)}
                              style={[
                                styles.ownerVenueRow,
                                {
                                  borderColor: P.border,
                                  backgroundColor: P.card,
                                },
                                selected && styles.ownerVenueRowSelected,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                            >
                              <View style={styles.ownerVenueRowText}>
                                <Text
                                  style={[styles.ownerVenueName, { color: "#FFFFFF" }]}
                                  numberOfLines={1}
                                >
                                  {v.name}
                                </Text>
                                {line ? (
                                  <Text
                                    style={[styles.ownerVenueAddr, { color: P.sessionMuted }]}
                                    numberOfLines={2}
                                  >
                                    {line}
                                  </Text>
                                ) : null}
                              </View>
                              <View
                                style={[
                                  styles.ownerVenueRadio,
                                  {
                                    borderColor: selected ? "#C4F82A" : P.border,
                                    backgroundColor: selected ? "#C4F82A" : "transparent",
                                  },
                                ]}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    )
                  ) : null}
                </View>
              ) : null}
              <Text style={[styles.hint, { color: P.muted }]}>{ru.userHome.sosHint}</Text>
            </View>

            {/* Уже в организации — сменить её можно только из «Моей организации»:
                новый код молча заменяет членство. */}
            {!hasOrganization ? (
              <Pressable
                onPress={() => navigation.navigate("UserBindVenue")}
                style={[styles.venueDetailsRow, { borderColor: P.border, backgroundColor: P.card }]}
                accessibilityRole="button"
              >
                <View style={styles.venueTextWrap}>
                  <Text style={styles.venueTitle}>{ru.userHome.venueDetails}</Text>
                  <Text style={[styles.venueSub, { color: P.sessionMuted }]}>{ru.userHome.venueDetailsSub}</Text>
                </View>
                <Text style={[styles.venueArrow, { color: "#C4F82A" }]}>→</Text>
              </Pressable>
            ) : null}

            <View style={styles.metaRow}>
              <Pressable
                onPress={() => navigation.navigate("History")}
                style={[styles.metaChip, { borderColor: P.border, backgroundColor: P.card }]}
                accessibilityRole="button"
              >
                <Text style={[styles.metaChipText, { color: P.textBlue }]}>{ru.userHome.history}</Text>
              </Pressable>
              {sessionChip ? (
                <View style={[styles.metaChip, { borderColor: P.border, backgroundColor: P.card }]}>
                  <Text style={[styles.metaChipText, { color: P.sessionMuted }]}>{sessionChip}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.footerNote, { color: P.caption }]}>{ru.userHome.footerNote}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    gap: 14,
  },
  homeTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  orgLoadingBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  orgLoadingText: {
    fontSize: 13,
    fontWeight: "600",
  },
  orgErrorCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  orgErrorTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  orgErrorRetry: {
    fontSize: 14,
    fontWeight: "700",
  },
  inactiveCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  inactiveTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  inactiveMessage: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
  },
  ctaStack: {
    gap: 10,
  },
  primaryCta: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#C4F82A",
  },
  primaryCtaText: {
    color: "#0A0A0A",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryCta: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#18181B",
  },
  secondaryCtaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryCtaArrow: {
    color: "#71717A",
    fontSize: 14,
    fontWeight: "700",
  },
  statusCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  statusTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  readyBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#14532D",
    backgroundColor: "#052E16",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  readyText: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  orgLine: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  assignedLine: {
    fontSize: 12,
    fontWeight: "500",
  },
  locationLine: {
    fontSize: 12,
    fontWeight: "500",
  },
  onDuty: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  roleLine: {
    color: P.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  chip: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipLeftLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  chipRightLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  sosBlock: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  hint: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  ownerSosSection: {
    width: "100%",
    gap: 12,
    marginTop: 4,
  },
  ownerModeRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  ownerModePill: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  ownerModePillActive: {
    backgroundColor: "#C4F82A",
    borderColor: "#C4F82A",
  },
  ownerModePillText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  ownerVenueList: {
    width: "100%",
    gap: 8,
  },
  ownerVenuesHint: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  ownerVenuesEmpty: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    paddingVertical: 8,
  },
  ownerVenueRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ownerVenueRowSelected: {
    borderColor: "#C4F82A",
  },
  ownerVenueRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ownerVenueName: {
    fontSize: 14,
    fontWeight: "700",
  },
  ownerVenueAddr: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  ownerVenueRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  venueDetailsRow: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  venueTextWrap: {
    gap: 2,
  },
  venueTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  venueSub: {
    fontSize: 11,
    fontWeight: "500",
  },
  venueArrow: {
    fontSize: 16,
    fontWeight: "700",
  },
  metaChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  footerNote: {
    fontSize: 12,
    fontWeight: "500",
  },
});
