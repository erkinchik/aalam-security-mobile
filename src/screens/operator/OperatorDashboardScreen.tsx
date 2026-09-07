import React from "react";
import * as Location from "expo-location";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { Crosshair, LogOut } from "lucide-react-native";
import { OperatorStackParamList, OperatorTabParamList } from "../../navigation/types";
import { selectCurrentOffer, useOperatorStore } from "../../stores/operatorStore";
import { useOperatorShift } from "../../hooks/useOperatorShift";
import { useAcceptSession } from "../../hooks/useAcceptSession";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { dispatchApi } from "../../api/modules/dispatch";
import { OfferCard } from "../../components/operator/OfferCard";
import { ActiveCallCard } from "../../components/operator/ActiveCallCard";
import { HAS_MAP_SUPPORT, MAP_PROVIDER } from "../../components/maps/mapProvider";
import { ErrorState } from "../../components/state/ErrorState";
import { useAppTheme } from "../../theme";
import { EmergencySession } from "../../types/emergency";
import { toastBus } from "../../ui/feedback/toastBus";
import { handleApiError } from "../../utils/error/handleApiError";
import { ru } from "../../locale/ru";

type Props = CompositeScreenProps<
  BottomTabScreenProps<OperatorTabParamList, "Dashboard">,
  NativeStackScreenProps<OperatorStackParamList>
>;

const DEFAULT_REGION = {
  latitude: 42.8746,
  longitude: 74.5698,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const coordsOf = (session: EmergencySession) => {
  const last = session.locations?.[session.locations.length - 1];
  if (last) return { latitude: last.latitude, longitude: last.longitude };
  const venue = session.venue;
  if (venue?.latitude != null && venue?.longitude != null) {
    return { latitude: venue.latitude, longitude: venue.longitude };
  }
  return null;
};

export const OperatorDashboardScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  // Карта занимает весь экран, а оверлеи позиционированы абсолютно — SafeAreaView
  // им не помогает, отступы под статус-бар и системную навигацию считаем сами.
  const insets = useSafeAreaInsets();
  const mapRef = React.useRef<MapView | null>(null);

  const { shiftStartedAt, toggleShift, isToggling } = useOperatorShift();
  const { accept, acceptingId } = useAcceptSession();
  const offer = useOperatorStore(selectCurrentOffer);
  const skipOffer = useOperatorStore((state) => state.skipOffer);
  const syncPoolSession = useOperatorStore((state) => state.syncPoolSession);
  const activeSessionsById = useOperatorStore((state) => state.activeSessionsById);
  const liveLocationsBySessionId = useOperatorStore((state) => state.liveLocationsBySessionId);
  const upsertActiveSession = useOperatorStore((state) => state.upsertActiveSession);
  const setSelectedSession = useOperatorStore((state) => state.setSelectedSession);

  const [operatorLocation, setOperatorLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);

  // Пул и свои вызовы подтягиваются один раз при открытии; дальше их ведёт сокет.
  const poolQuery = usePaginatedList({
    queryKey: ["operator-pool"],
    limit: 20,
    fetcher: dispatchApi.pool,
  });
  const activeQuery = usePaginatedList({
    queryKey: ["operator-active"],
    limit: 20,
    fetcher: dispatchApi.active,
  });

  const restPool = React.useMemo(
    () => poolQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [poolQuery.data],
  );
  React.useEffect(() => {
    restPool.forEach(syncPoolSession);
  }, [restPool, syncPoolSession]);

  const restActive = React.useMemo(
    () => activeQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [activeQuery.data],
  );
  React.useEffect(() => {
    restActive.forEach(upsertActiveSession);
  }, [restActive, upsertActiveSession]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!cancelled) {
        setOperatorLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Оператор ведёт один вызов за раз — берём самый свежий незакрытый. */
  const activeCall = React.useMemo(() => {
    const list = Object.values(activeSessionsById).filter((s) => s.status !== "CLOSED");
    if (list.length === 0) return null;
    return list.reduce((newest, s) =>
      new Date(s.createdAt).getTime() > new Date(newest.createdAt).getTime() ? s : newest,
    );
  }, [activeSessionsById]);

  // На карте только то, что относится к оператору: активный вызов и предложение.
  const markers = React.useMemo(() => {
    const items: Array<{ session: EmergencySession; latitude: number; longitude: number }> = [];
    for (const session of [activeCall, offer]) {
      if (!session) continue;
      const live = liveLocationsBySessionId[session.id];
      const point = live ?? coordsOf(session);
      if (point) items.push({ session, ...point });
    }
    return items;
  }, [activeCall, offer, liveLocationsBySessionId]);

  const focusTarget = markers[0];
  React.useEffect(() => {
    if (!focusTarget) return;
    mapRef.current?.animateToRegion(
      {
        latitude: focusTarget.latitude,
        longitude: focusTarget.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      400,
    );
  }, [focusTarget?.latitude, focusTarget?.longitude]);

  const centerOnMe = React.useCallback(() => {
    if (!operatorLocation) return;
    mapRef.current?.animateToRegion(
      { ...operatorLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      350,
    );
  }, [operatorLocation]);

  const onStartProgress = React.useCallback(async () => {
    if (!activeCall) return;
    setIsStarting(true);
    try {
      const updated = await dispatchApi.startProgress(activeCall.id);
      upsertActiveSession(updated);
      toastBus.show({ message: ru.operator.updated, severity: "success" });
    } catch (error) {
      const { status, message } = handleApiError(error);
      toastBus.show({
        message: status === 409 ? ru.operator.sessionConflict : message,
        severity: "error",
      });
    } finally {
      setIsStarting(false);
    }
  }, [activeCall, upsertActiveSession]);

  const openDetails = React.useCallback(
    (session: EmergencySession) => {
      setSelectedSession(session);
      navigation.navigate("OperatorSessionDetails", { sessionId: session.id });
    },
    [navigation, setSelectedSession],
  );

  const shiftSince = shiftStartedAt
    ? new Date(shiftStartedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <View style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      {HAS_MAP_SUPPORT ? (
        <MapView
          ref={mapRef}
          provider={MAP_PROVIDER}
          style={StyleSheet.absoluteFill}
          showsUserLocation={Boolean(operatorLocation)}
          initialRegion={
            operatorLocation
              ? { ...operatorLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 }
              : DEFAULT_REGION
          }
        >
          {markers.map((m) => (
            <Marker
              key={m.session.id}
              coordinate={{ latitude: m.latitude, longitude: m.longitude }}
              pinColor={
                m.session.id === offer?.id
                  ? tokens.status.NEW.border
                  : tokens.status.IN_PROGRESS.border
              }
              title={m.session.venue?.name ?? ru.operatorScreens.markerEmergency}
              onPress={() => openDetails(m.session)}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.mapFallback}>
          <ErrorState
            title={ru.operatorScreens.mapNotConfigured}
            message={ru.operatorScreens.mapKeyHint}
          />
        </View>
      )}

      {/* Статус смены — единственный постоянный элемент поверх карты. */}
      <View style={[styles.topBar, { top: insets.top + 12 }]} pointerEvents="box-none">
        <View
          style={[
            styles.shiftPill,
            { backgroundColor: tokens.colors.surface + "F2", borderColor: tokens.colors.border },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: tokens.colors.success }]} />
          <Text style={[styles.shiftText, { color: tokens.colors.onSurface }]}>
            {shiftSince
              ? `${ru.operatorShift.onShift} · ${shiftSince}`
              : ru.operatorShift.onShift}
          </Text>
          <Pressable
            onPress={toggleShift}
            disabled={isToggling}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={ru.operatorShift.endShiftA11y}
            style={styles.endShift}
          >
            <LogOut size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <Pressable
          onPress={centerOnMe}
          disabled={!operatorLocation}
          accessibilityRole="button"
          accessibilityLabel={ru.operatorScreens.me}
          style={[
            styles.fab,
            {
              backgroundColor: tokens.colors.surface + "F2",
              borderColor: tokens.colors.border,
              opacity: operatorLocation ? 1 : 0.5,
            },
          ]}
        >
          <Crosshair size={20} color={tokens.colors.onSurface} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={[styles.bottom, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
        {activeCall ? (
          <ActiveCallCard
            session={activeCall}
            isStarting={isStarting}
            onStartProgress={() => void onStartProgress()}
            onResolve={() =>
              navigation.navigate("OperatorResolveModal", { sessionId: activeCall.id })
            }
            onDetails={() => openDetails(activeCall)}
          />
        ) : null}

        {offer ? (
          <OfferCard
            session={offer}
            isAccepting={acceptingId === offer.id}
            onAccept={() => void accept(offer.id)}
            onDismiss={() => skipOffer(offer.id)}
          />
        ) : !activeCall ? (
          <View
            style={[
              styles.idle,
              { backgroundColor: tokens.colors.surface + "F2", borderColor: tokens.colors.border },
            ]}
          >
            <Text style={[styles.idleText, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.operatorPool.waitingForCalls}
            </Text>
          </View>
        ) : null}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapFallback: { ...StyleSheet.absoluteFillObject, justifyContent: "center", padding: 16 },
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  shiftPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 8,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  shiftText: { fontSize: 13, fontWeight: "700" },
  endShift: { padding: 4 },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: { position: "absolute", left: 12, right: 12, gap: 10 },
  idle: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  idleText: { fontSize: 13, fontWeight: "600" },
});
