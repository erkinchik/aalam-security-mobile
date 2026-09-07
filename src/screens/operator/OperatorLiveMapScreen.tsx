import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin } from "lucide-react-native";
import MapView, { Marker } from "react-native-maps";
import { HAS_MAP_SUPPORT, MAP_PROVIDER } from "../../components/maps/mapProvider";
import { useOperatorStore } from "../../stores/operatorStore";
import { ActionButton } from "../../components/ui/ActionButton";
import { StatusChip } from "../../components/ui/StatusChip";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OperatorStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

type Props = NativeStackScreenProps<OperatorStackParamList, "OperatorLiveMap">;

export const OperatorLiveMapScreen = ({ route }: Props) => {
  const { tokens } = useAppTheme();
  const sessionId = route.params.sessionId;
  const hasMapKey = HAS_MAP_SUPPORT;
  const liveLocationsBySessionId = useOperatorStore((state) => state.liveLocationsBySessionId);
  const activeSessionsById = useOperatorStore((state) => state.activeSessionsById);
  const selectedSession = useOperatorStore((state) => state.selectedSession);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [mapError, setMapError] = React.useState<string | null>(null);
  const mapRef = React.useRef<MapView | null>(null);

  // Use session-specific live location, not global (which can be from another session)
  const sessionLiveLocation = liveLocationsBySessionId[sessionId];
  const session = activeSessionsById[sessionId] ?? (selectedSession?.id === sessionId ? selectedSession : null);
  const fallbackLocation = session?.locations?.at(-1) ?? null;
  const location = sessionLiveLocation ?? fallbackLocation ?? null;
  const isLive = Boolean(sessionLiveLocation);

  const focusMap = React.useCallback(() => {
    if (!location || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500,
    );
  }, [location]);

  React.useEffect(() => {
    focusMap();
  }, [focusMap]);

  React.useEffect(() => {
    if (!location) return;
    const timer = setTimeout(() => {
      if (!isMapReady) setMapError(ru.operatorScreens.mapProviderError);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isMapReady, location]);

  if (!hasMapKey) {
    return (
      <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: tokens.colors.danger }]}>
            {ru.operatorScreens.mapNotConfigured}
          </Text>
          <Text style={[styles.errorSub, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.operatorScreens.mapKeyHint}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <View style={styles.center}>
          <MapPin size={48} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          <Text style={[styles.errorTitle, { color: tokens.colors.onSurface }]}>
            {ru.operatorScreens.noLocationYet}
          </Text>
          <Text style={[styles.errorSub, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.operatorScreens.noLocationSub}
          </Text>
          <ActionButton
            variant="secondary"
            label={ru.operatorScreens.retry}
            onPress={focusMap}
            accessibilityLabel={ru.operatorScreens.retryLocationA11y}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (mapError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: tokens.colors.danger }]}>{mapError}</Text>
          <ActionButton
            variant="secondary"
            label={ru.operatorScreens.retryMap}
            onPress={() => { setMapError(null); setIsMapReady(false); focusMap(); }}
            accessibilityLabel={ru.operatorScreens.retryMapA11y}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      {/* Info bar */}
      <View style={[styles.infoBar, { backgroundColor: tokens.colors.surface, borderBottomColor: tokens.colors.border }]}>
        <View style={styles.infoLeft}>
          <Text style={[styles.sessionLabel, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.operatorScreens.sessionPrefix}
            {route.params.sessionId.slice(0, 8)}
          </Text>
          {selectedSession ? <StatusChip status={selectedSession.status} /> : null}
        </View>
        <View style={[styles.liveDot, { backgroundColor: isLive ? tokens.colors.success : tokens.colors.onSurfaceMuted }]} />
      </View>

      <MapView
        ref={mapRef}
        provider={MAP_PROVIDER}
        style={styles.map}
        onMapReady={() => {
          setIsMapReady(true);
          setMapError(null);
          focusMap();
        }}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={{ latitude: location.latitude, longitude: location.longitude }}
          title={ru.operatorScreens.emergencyLocation}
          pinColor={tokens.status.IN_PROGRESS.border}
        />
      </MapView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLeft: { gap: 4 },
  sessionLabel: { fontSize: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 20 },
});
