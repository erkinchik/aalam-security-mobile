import React, { useCallback } from "react";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  FlatList,
  ListRenderItem,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useUserTabBarBottomInset } from "../../navigation/userTabBarLayout";
import { UserStackParamList, UserTabParamList } from "../../navigation/types";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { emergencyApi } from "../../api/modules/emergency";
import { SkeletonList } from "../../components/state/SkeletonList";
import { ErrorState } from "../../components/state/ErrorState";
import { EmptyState } from "../../components/state/EmptyState";
import { AppCard } from "../../components/ui/AppCard";
import { useAppTheme } from "../../theme";
import { spacing } from "../../theme";
import type { EmergencySession } from "../../types/emergency";
import { ru } from "../../locale/ru";
import { formatDateTime } from "../../utils/date";

type Props = CompositeScreenProps<
  BottomTabScreenProps<UserTabParamList, "History">,
  NativeStackScreenProps<UserStackParamList>
>;

const HistoryCard = React.memo(function HistoryCard({
  item,
  tokens,
  onPress,
}: {
  item: EmergencySession;
  tokens: ReturnType<typeof useAppTheme>["tokens"];
  onPress: () => void;
}) {
  // Со временем: два вызова за день иначе не различить.
  const dateStr = formatDateTime(item.createdAt);

  const headline =
    item.resolution?.trim() ||
    (item.status === "CLOSED"
      ? ru.emergencyHistory.closed
      : item.status === "IN_PROGRESS"
        ? ru.emergencyHistory.inProgress
        : item.status === "ASSIGNED"
          ? ru.emergencyHistory.assigned
          : ru.emergencyHistory.manual);

  const meta =
    item.status === "CLOSED" && item.closedAt
      ? (() => {
          const closed = new Date(item.closedAt);
          const created = new Date(item.createdAt);
          const diffMin = Math.max(1, Math.round((closed.getTime() - created.getTime()) / 60000));
          return `${ru.emergencyHistory.closedIn} ${diffMin}${ru.emergencyHistory.minShort}`;
        })()
      : item.status === "ASSIGNED"
        ? ru.emergencyHistory.assignedPending
        : item.status === "IN_PROGRESS"
          ? ru.emergencyHistory.tapTimeline
          : ru.emergencyHistory.noAction;

  return (
    <AppCard compact onPress={onPress} style={styles.historyCard}>
      <Text style={[styles.dateAndStatus, { color: tokens.status[item.status].border }]}>
        {dateStr} · {ru.emergencyStatus[item.status as keyof typeof ru.emergencyStatus] ?? item.status}
      </Text>
      <Text style={[styles.headline, { color: tokens.colors.onSurface }]} numberOfLines={2}>
        {headline}
      </Text>
      <Text style={[styles.meta, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={1}>
        {meta}
      </Text>
    </AppCard>
  );
});

export const UserEmergencyHistoryScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const tabBarBottomInset = useUserTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const query = usePaginatedList({
    queryKey: ["user-history"],
    limit: 20,
    fetcher: emergencyApi.getHistory,
  });
  const { refetch, isRefetching } = query;

  const renderItem = useCallback<ListRenderItem<EmergencySession>>(
    ({ item }) => (
      <HistoryCard
        item={item}
        tokens={tokens}
        onPress={() => navigation.navigate("UserEmergencyDetails", { sessionId: item.id })}
      />
    ),
    [navigation, tokens],
  );

  const keyExtractor = useCallback((item: EmergencySession) => item.id, []);

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefetching}
      onRefresh={onRefresh}
      tintColor={tokens.colors.primary}
      colors={[tokens.colors.primary]}
    />
  );

  const rootStyle = [styles.root, { backgroundColor: tokens.colors.background, paddingBottom: tabBarBottomInset }];

  if (query.isLoading) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={rootStyle}>
        <SkeletonList />
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={rootStyle}>
        <ErrorState
          title={ru.emergencyHistory.loadErrorTitle}
          message={ru.emergencyHistory.loadErrorMsg}
          retryLabel={ru.emergencyHistory.retry}
          onRetry={() => void query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const data = query.data?.pages.flatMap((page) => page.data) ?? [];

  if (data.length === 0) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={rootStyle}>
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <EmptyState title={ru.emergencyHistory.emptyTitle} subtitle={ru.emergencyHistory.emptySub} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={[styles.pageHeader, { paddingTop: Math.max(spacing.lg, insets.top + 8) }]}>
        <Text style={[styles.pageTitle, { color: tokens.colors.onSurface }]}>{ru.emergencyHistory.pageTitle}</Text>
        <Text style={[styles.pageSubtitle, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.emergencyHistory.pageSub}
        </Text>
      </View>
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarBottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        renderItem={renderItem}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  emptyScroll: { flexGrow: 1 },
  pageHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  pageTitle: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 13, fontWeight: "500" },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg, gap: 10 },
  historyCard: { borderRadius: 16, padding: 14 },
  dateAndStatus: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.25 },
  headline: { fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 2 },
  meta: { fontSize: 12, fontWeight: "500" },
});
