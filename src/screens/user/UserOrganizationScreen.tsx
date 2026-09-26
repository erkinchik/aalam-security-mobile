import React, { useCallback } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UserStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../stores/authStore";
import { organizationApi, OrganizationMember } from "../../api/modules/organization";
import { SkeletonList } from "../../components/state/SkeletonList";
import { ErrorState } from "../../components/state/ErrorState";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

type Props = NativeStackScreenProps<UserStackParamList, "UserOrganization">;

/** Matches UserHomeScreen dashboard (Pencil ZVLRX) */
const P = {
  bg: "#0A0A0A",
  card: "#18181B",
  border: "#27272A",
  muted: "#A1A1AA",
  caption: "#52525B",
  sessionMuted: "#71717A",
  lime: "#C4F82A",
  limeText: "#0A0A0A",
  textBlue: "#93C5FD",
} as const;

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const ROLE_LABELS: Record<string, string> = {
  OWNER: ru.roles.owner,
  MANAGER: ru.roles.manager,
  STAFF: ru.roles.staff,
  MEMBER: ru.roles.member,
};

export const UserOrganizationScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: memberships, isLoading, isError, refetch } = useQuery({
    queryKey: ["organizations", userId],
    queryFn: organizationApi.getMyOrganizations,
    enabled: Boolean(userId),
  });

  const openVenuesInCommon = useCallback(
    (m: OrganizationMember) => {
      navigation.getParent()?.navigate(
        "Common",
        {
          screen: "OrganizationVenues",
          params: {
            organizationId: m.organizationId,
            organizationName: m.organization.name,
          },
        } as never,
      );
    },
    [navigation],
  );

  const openMyOrganizationsCommon = useCallback(() => {
    navigation.getParent()?.navigate("Common", { screen: "MyOrganizations" } as never);
  }, [navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]} edges={["bottom"]}>
        <View style={styles.loadingPad}>
          <SkeletonList count={5} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]} edges={["bottom"]}>
        <View style={styles.loadingPad}>
          <ErrorState
            title={ru.userOrg.loadErrorTitle}
            message={ru.userOrg.loadErrorMsg}
            retryLabel={ru.errors.retry}
            onRetry={() => void refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const m = memberships?.[0];
  if (!m) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { borderColor: P.border, backgroundColor: P.card }]}>
            <Text style={styles.cardTitle}>{ru.userOrg.emptyTitle}</Text>
            <Text style={[styles.cardBody, { color: P.muted }]}>{ru.userOrg.emptyBody}</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("UserBindVenue")}
            style={styles.primaryCta}
            accessibilityRole="button"
          >
            <Text style={styles.primaryCtaText}>{ru.userOrg.join}</Text>
            <Text style={styles.primaryCtaText}>→</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.getParent()?.navigate("Common", { screen: "RequestNewOrganization" } as never)}
            style={[styles.secondaryCta, { borderColor: P.border }]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryCtaText}>{ru.userOrg.request}</Text>
            <Text style={styles.secondaryCtaArrow}>→</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const org = m.organization;
  const venues = org.venues ?? [];
  const memberCount = org._count?.members ?? null;
  const typeLabel = ru.userOrg.business;
  const roleLabel = ROLE_LABELS[m.role] ?? m.role;
  const isMemberParticipant = (m.role ?? "").toUpperCase() === "MEMBER";
  // Владелец по чужому коду уйти не может — сервер откажет, ссылку не показываем.
  const canSwitchOrg = (m.role ?? "").toUpperCase() !== "OWNER";

  const confirmSwitchOrg = () => {
    Alert.alert(
      ru.userOrg.switchOrgConfirmTitle,
      ru.userOrg.switchOrgConfirmMsg.replace("{name}", org.name),
      [
        { text: ru.userOrg.switchOrgConfirmCancel, style: "cancel" },
        { text: ru.userOrg.switchOrgConfirmOk, onPress: () => navigation.navigate("UserBindVenue") },
      ],
    );
  };

  const switchOrgLink = canSwitchOrg ? (
    <Pressable
      onPress={confirmSwitchOrg}
      style={styles.switchOrgLink}
      accessibilityRole="button"
      hitSlop={8}
    >
      <Text style={[styles.switchOrgText, { color: P.sessionMuted }]}>{ru.userOrg.switchOrg}</Text>
    </Pressable>
  ) : null;

  const orgCard = (
    <View style={[styles.card, { borderColor: P.border, backgroundColor: P.card }]}>
      <View style={styles.cardTopRow}>
        <Text style={[styles.metaLabel, { color: P.muted }]}>{ru.userOrg.name}</Text>
        <View style={styles.roleBadge}>
          <Text style={[styles.roleBadgeText, { fontFamily: monoFont }]}>{roleLabel}</Text>
        </View>
      </View>
      <Text style={styles.orgName} numberOfLines={2}>
        {org.name}
      </Text>
      <Text style={[styles.typeLine, { color: P.sessionMuted }]}>
        {ru.userOrg.typePrefix}
        {typeLabel}
      </Text>
      {memberCount != null ? (
        <Text style={[styles.statLine, { color: P.muted }]}>
          {ru.userOrg.statsVenues} {venues.length}
          {" · "}
          {ru.userOrg.statsMembers} {memberCount}
        </Text>
      ) : (
        <Text style={[styles.statLine, { color: P.muted }]}>
          {ru.userOrg.statsVenues} {venues.length}
        </Text>
      )}
    </View>
  );

  if (isMemberParticipant) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]} edges={["bottom"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentMember}
          showsVerticalScrollIndicator={false}
        >
          {orgCard}
          {switchOrgLink}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageSubtitle, { color: P.muted }]}>{ru.userOrg.subtitle}</Text>

        {orgCard}

        <Text style={[styles.sectionLabel, { color: P.muted }]}>{ru.userOrg.branches}</Text>
        {venues.length === 0 ? (
          <View style={[styles.card, { borderColor: P.border, backgroundColor: P.card }]}>
            <Text style={[styles.cardBody, { color: P.sessionMuted }]}>{ru.userOrg.noVenues}</Text>
          </View>
        ) : (
          <View style={styles.venueList}>
            {venues.map((v) => (
              <View
                key={v.id}
                style={[styles.venueRow, { borderColor: P.border, backgroundColor: P.card }]}
              >
                <Text style={styles.venueName} numberOfLines={1}>
                  {v.name}
                </Text>
                {v.address ? (
                  <Text style={[styles.venueAddress, { color: P.sessionMuted }]} numberOfLines={2}>
                    {v.address}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={() => openVenuesInCommon(m)}
          style={styles.primaryCta}
          accessibilityRole="button"
          accessibilityLabel={ru.userOrg.manageA11y}
        >
          <Text style={styles.primaryCtaText}>{ru.userOrg.manage}</Text>
          <Text style={styles.primaryCtaText}>→</Text>
        </Pressable>

        <Pressable
          onPress={openMyOrganizationsCommon}
          style={[styles.tertiaryRow, { borderColor: P.border }]}
          accessibilityRole="button"
        >
          <Text style={[styles.tertiaryText, { color: P.textBlue }]}>{ru.userOrg.openFullList}</Text>
          <Text style={[styles.tertiaryArrow, { color: P.textBlue }]}>→</Text>
        </Pressable>

        {switchOrgLink}

        <Text style={[styles.footerNote, { color: P.caption, fontFamily: monoFont }]}>
          {ru.userOrg.orgId}
          {org.slug}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  loadingPad: { flex: 1, padding: 24 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
  },
  contentMember: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
  },
  emptyScroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 0,
    marginBottom: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  roleBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3F6212",
    backgroundColor: "#1A2E05",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: {
    color: P.lime,
    fontSize: 11,
    fontWeight: "700",
  },
  orgName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  typeLine: {
    fontSize: 12,
    fontWeight: "600",
  },
  statLine: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  cardBody: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  venueList: {
    gap: 8,
  },
  venueRow: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  venueName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  venueAddress: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
  primaryCta: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: P.lime,
    marginTop: 4,
  },
  primaryCtaText: {
    color: P.limeText,
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
    backgroundColor: P.card,
  },
  secondaryCtaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryCtaArrow: {
    color: P.sessionMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  tertiaryRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: P.card,
  },
  tertiaryText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  tertiaryArrow: {
    fontSize: 14,
    fontWeight: "700",
  },
  switchOrgLink: {
    alignSelf: "center",
    paddingVertical: 8,
  },
  switchOrgText: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footerNote: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 8,
  },
});
