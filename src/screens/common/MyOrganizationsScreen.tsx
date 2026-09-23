import React, { useCallback } from "react";
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronRight } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { CommonStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../stores/authStore";
import { organizationApi, OrganizationMember } from "../../api/modules/organization";
import { ActionButton } from "../../components/ui/ActionButton";
import { EmptyState } from "../../components/state/EmptyState";
import { SkeletonList } from "../../components/state/SkeletonList";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = NativeStackScreenProps<CommonStackParamList, "MyOrganizations">;

const ROLE_LABELS: Record<string, string> = {
  OWNER: ru.roles.owner,
  MANAGER: ru.roles.manager,
  STAFF: ru.roles.staff,
  MEMBER: ru.roles.member,
};

const OrgCard = React.memo(
  ({
    item,
    tokens,
    onPress,
  }: {
    item: OrganizationMember;
    tokens: ReturnType<typeof useAppTheme>["tokens"];
    onPress: (item: OrganizationMember) => void;
  }) => (
    <Pressable
      onPress={() => onPress(item)}
      style={[
        styles.card,
        {
          backgroundColor: tokens.colors.surface,
          borderColor: tokens.colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${ru.myOrgs.openA11y} ${item.organization.name}`}
    >
      <View style={styles.cardContent}>
        <Text style={[styles.orgName, { color: tokens.colors.onSurface }]} numberOfLines={1}>
          {item.organization.name}
        </Text>
        <View style={styles.meta}>
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: tokens.colors.primary + "20", borderColor: tokens.colors.primary },
            ]}
          >
            <Text style={[styles.roleText, { color: tokens.colors.primary }]}>
              {ROLE_LABELS[item.role] ?? item.role}
            </Text>
          </View>
          <Text style={[styles.venueCount, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.myOrgs.venueStat} {item.organization.venues?.length ?? 0}
          </Text>
        </View>
      </View>
      <ChevronRight size={22} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
    </Pressable>
  )
);
OrgCard.displayName = "OrgCard";

export const MyOrganizationsScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: memberships, isLoading, isError, refetch } = useQuery({
    queryKey: ["organizations", userId],
    queryFn: organizationApi.getMyOrganizations,
    enabled: Boolean(userId),
  });

  const onOrgPress = useCallback(
    (item: OrganizationMember) => {
      navigation.navigate("OrganizationVenues", {
        organizationId: item.organizationId,
        organizationName: item.organization.name,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OrganizationMember>) => (
      <OrgCard item={item} tokens={tokens} onPress={onOrgPress} />
    ),
    [tokens, onOrgPress]
  );

  if (isLoading) {
    return (
      <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <View style={styles.content}>
          <SkeletonList count={4} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.myOrgs.subtitle}
          </Text>
        </View>

        {memberships && memberships.length > 0 ? (
          <FlatList
            data={memberships}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <ActionButton
                variant="secondary"
                label={ru.myOrgs.requestOrg}
                onPress={() => navigation.navigate("RequestNewOrganization")}
                style={styles.createButton}
              />
            }
          />
        ) : (
          <>
            <EmptyState title={ru.myOrgs.emptyTitle} subtitle={ru.myOrgs.emptySub} />
            <ActionButton
              label={ru.myOrgs.requestOrg}
              onPress={() => navigation.navigate("RequestNewOrganization")}
              style={styles.createButton}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, padding: 20 },
  header: { marginBottom: 20, gap: 4 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  list: { gap: 12, paddingBottom: 24 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  cardContent: { flex: 1, gap: 6 },
  orgName: { fontSize: 16, fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleText: { fontSize: 11, fontWeight: "700" },
  venueCount: { fontSize: 12 },
  createButton: { marginTop: 8 },
});
