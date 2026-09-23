import React, { useCallback } from "react";
import {
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { CommonStackParamList } from "../../navigation/types";
import { venueApi, Venue, formatVenueAddress } from "../../api/modules/organization";
import { ActionButton } from "../../components/ui/ActionButton";
import { EmptyState } from "../../components/state/EmptyState";
import { SkeletonList } from "../../components/state/SkeletonList";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = NativeStackScreenProps<CommonStackParamList, "OrganizationVenues">;

const VenueCard = React.memo(
  ({
    item,
    tokens,
  }: {
    item: Venue;
    tokens: ReturnType<typeof useAppTheme>["tokens"];
  }) => {
    const addressLine = formatVenueAddress(item);
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: tokens.colors.surface,
            borderColor: tokens.colors.border,
          },
        ]}
      >
        <Text style={[styles.venueName, { color: tokens.colors.onSurface }]} numberOfLines={1}>
          {item.name}
        </Text>
        {addressLine ? (
          <Text style={[styles.venueAddress, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={4}>
            {addressLine}
          </Text>
        ) : null}
      </View>
    );
  },
);
VenueCard.displayName = "VenueCard";

export const OrganizationVenuesScreen = ({ route, navigation }: Props) => {
  const { tokens } = useAppTheme();
  const { organizationId, organizationName } = route.params;

  const { data: venues, isLoading } = useQuery({
    queryKey: ["venues", organizationId],
    queryFn: () => venueApi.list(organizationId),
  });

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Venue>) => <VenueCard item={item} tokens={tokens} />,
    [tokens]
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
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>{ru.orgVenues.subtitle}</Text>
        </View>

        {venues && venues.length > 0 ? (
          <FlatList
            data={venues}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <ActionButton
                variant="secondary"
                label={ru.orgVenues.addVenue}
                onPress={() =>
                  navigation.navigate("CreateVenue", {
                    organizationId,
                    organizationName,
                  })
                }
                style={styles.addButton}
              />
            }
          />
        ) : (
          <>
            <EmptyState title={ru.orgVenues.emptyTitle} subtitle={ru.orgVenues.emptySub} />
            <ActionButton
              label={ru.orgVenues.addVenue}
              onPress={() =>
                navigation.navigate("CreateVenue", {
                  organizationId,
                  organizationName,
                })
              }
              style={styles.addButton}
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
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  venueName: { fontSize: 16, fontWeight: "700" },
  venueAddress: { fontSize: 13 },
  addButton: { marginTop: 8 },
});
