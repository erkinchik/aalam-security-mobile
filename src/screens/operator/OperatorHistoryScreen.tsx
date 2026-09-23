import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { dispatchApi } from "../../api/modules/dispatch";
import { SkeletonList } from "../../components/state/SkeletonList";
import { ErrorState } from "../../components/state/ErrorState";
import { EmptyState } from "../../components/state/EmptyState";
import { AppCard } from "../../components/ui/AppCard";
import { StatusChip } from "../../components/ui/StatusChip";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { sessionCaller } from "../../utils/emergencySession";
import { formatDateTime } from "../../utils/date";

export const OperatorHistoryScreen = () => {
  const { tokens } = useAppTheme();
  const query = usePaginatedList({
    queryKey: ["operator-history"],
    limit: 20,
    fetcher: dispatchApi.history,
  });

  if (query.isLoading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <SkeletonList />
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <ErrorState
          title={ru.operatorScreens.historyErrorTitle}
          message={ru.operatorScreens.historyLoadMsg}
          retryLabel={ru.errors.retry}
          onRetry={() => void query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const data = query.data?.pages.flatMap((page) => page.data) ?? [];

  if (data.length === 0) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <EmptyState title={ru.operatorScreens.historyEmptyTitle} subtitle={ru.operatorScreens.historyEmptySub} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: tokens.colors.onSurface }]}>
          {ru.operatorScreens.historyPageTitle}
        </Text>
        <Text style={[styles.pageSubtitle, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.operatorScreens.historyCount} {data.length}
        </Text>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <AppCard compact>
            <View style={styles.cardRow}>
              <StatusChip status={item.status} />
              <Text style={[styles.dateText, { color: tokens.colors.onSurfaceMuted }]}>
                {formatDateTime(item.createdAt)}
              </Text>
            </View>
            <Text style={[styles.userEmail, { color: tokens.colors.onSurface }]} numberOfLines={1}>
              {sessionCaller(item)}
            </Text>
            {item.resolution ? (
              <Text style={[styles.resolution, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={2}>
                {item.resolution}
              </Text>
            ) : null}
          </AppCard>
        )}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 2 },
  pageTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 13 },
  list: { padding: 16, gap: 10 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  dateText: { fontSize: 12, fontWeight: "500" },
  userEmail: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  resolution: { fontSize: 13, lineHeight: 18 },
});
