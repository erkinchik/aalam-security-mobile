import React from "react";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { CompositeScreenProps, useNavigation } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { Crosshair, LogOut, UserRound } from "lucide-react-native";
import { OperatorStackParamList, OperatorTabParamList, RootStackParamList } from "../../navigation/types";
import { selectCurrentOffer, useOperatorStore } from "../../stores/operatorStore";
import { useOperatorShift } from "../../hooks/useOperatorShift";
import { useAcceptSession } from "../../hooks/useAcceptSession";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { dispatchApi } from "../../api/modules/dispatch";
import { OfferCard } from "../../components/operator/OfferCard";
import { ActiveCallCard } from "../../components/operator/ActiveCallCard";
import { ConnectionBanner } from "../../components/operator/ConnectionBanner";
import { HAS_MAP_SUPPORT, MAP_PROVIDER } from "../../components/maps/mapProvider";
import { ErrorState } from "../../components/state/ErrorState";
import { useAppTheme } from "../../theme";
import { EmergencySession } from "../../types/emergency";
import { sessionCoords } from "../../utils/emergencySession";
import { distanceMeters } from "../../utils/geo";
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

export const OperatorDashboardScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  // Карта занимает весь экран, а оверлеи позиционированы абсолютно — SafeAreaView
  // им не помогает, отступы под статус-бар и системную навигацию считаем сами.
  const insets = useSafeAreaInsets();
  const mapRef = React.useRef<MapView | null>(null);

  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { shiftStartedAt, toggleShift, isToggling } = useOperatorShift();
  const { accept, acceptingId } = useAcceptSession();
  const offer = useOperatorStore(selectCurrentOffer);
  const skipOffer = useOperatorStore((state) => state.skipOffer);
  const unskipOffer = useOperatorStore((state) => state.unskipOffer);
  const replacePool = useOperatorStore((state) => state.replacePool);
  const replaceActiveSessions = useOperatorStore((state) => state.replaceActiveSessions);
  const removeActiveSession = useOperatorStore((state) => state.removeActiveSession);
  const activeSessionsById = useOperatorStore((state) => state.activeSessionsById);
  const poolCount = useOperatorStore((state) => Object.keys(state.poolById).length);
  // Истёкшие пропуски стор вычищает сам (useSkipCooldown), так что ключ здесь —
  // значит вызов сейчас спрятан.
  const skippedCount = useOperatorStore(
    (state) => Object.keys(state.skippedUntil).filter((id) => state.poolById[id]).length,
  );
  const queryClient = useQueryClient();
  const liveLocationsBySessionId = useOperatorStore((state) => state.liveLocationsBySessionId);
  const upsertActiveSession = useOperatorStore((state) => state.upsertActiveSession);

  const [operatorLocation, setOperatorLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  // Синяя точка включается по разрешению, а не по первой позиции: если первая
  // попытка не удалась, onUserLocationChange иначе не срабатывал никогда.
  const [locationGranted, setLocationGranted] = React.useState(false);
  // До onMapReady animateToRegion может потеряться — центрирование ждёт карту.
  const [mapReady, setMapReady] = React.useState(false);

  // Пул и свои вызовы подтягиваются при открытии и возврате в приложение;
  // между этим их ведёт сокет. Лимит как у снимка сокета.
  const poolQuery = usePaginatedList({
    queryKey: ["operator-pool"],
    limit: 100,
    fetcher: dispatchApi.pool,
  });
  const activeQuery = usePaginatedList({
    queryKey: ["operator-active"],
    limit: 20,
    fetcher: dispatchApi.active,
  });

  const refetchPool = poolQuery.refetch;

  const restPool = React.useMemo(
    () => poolQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [poolQuery.data],
  );
  // Ответ сервера — вся правда: вызов, ушедший из пула, пока сокет лежал,
  // виден только по отсутствию в ответе.
  React.useEffect(() => {
    if (poolQuery.data) replacePool(restPool);
  }, [poolQuery.data, restPool, replacePool]);

  const restActive = React.useMemo(
    () => activeQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [activeQuery.data],
  );
  React.useEffect(() => {
    if (activeQuery.data) replaceActiveSessions(restActive);
  }, [activeQuery.data, restActive, replaceActiveSessions]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;
        setLocationGranted(true);
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setOperatorLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch (error) {
        // GPS выключен или не отвечает. Карта работает и без этого — нет только
        // «Я» и расстояния; синяя точка подхватит позицию, когда она появится.
        console.warn("operator-map: не удалось получить позицию", error);
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

  // Пока оператор занят, сервер не шлёт ему новые вызовы — локальный пул за
  // это время устаревает. Освободился — перечитываем, иначе он ждал бы
  // следующего SOS, не зная про уже висящие в очереди.
  const hasActiveCall = Boolean(activeCall);
  const hadActiveCall = React.useRef(false);
  React.useEffect(() => {
    if (hadActiveCall.current && !hasActiveCall) {
      void refetchPool();
    }
    hadActiveCall.current = hasActiveCall;
  }, [hasActiveCall, refetchPool]);

  // На карте только то, что относится к оператору: активный вызов и предложение.
  const markers = React.useMemo(() => {
    const items: Array<{ session: EmergencySession; latitude: number; longitude: number }> = [];
    for (const session of [activeCall, offer]) {
      if (!session) continue;
      const live = liveLocationsBySessionId[session.id];
      const point = live ?? sessionCoords(session);
      if (point) items.push({ session, ...point });
    }
    return items;
  }, [activeCall, offer, liveLocationsBySessionId]);

  const focusTarget = markers[0];
  // Центрируем один раз на вызов: когда он появился или у него впервые появилась
  // точка. Раньше карта прыгала к заявителю на каждой точке (раз в ~5 с) и
  // сбрасывала масштаб, который оператор выставил, разглядывая здание.
  const focusedSessionIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!focusTarget) {
      focusedSessionIdRef.current = null;
      return;
    }
    if (!mapReady || focusedSessionIdRef.current === focusTarget.session.id) return;
    focusedSessionIdRef.current = focusTarget.session.id;
    mapRef.current?.animateToRegion(
      {
        latitude: focusTarget.latitude,
        longitude: focusTarget.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      400,
    );
  }, [focusTarget, mapReady]);

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
      const { code, message } = handleApiError(error);
      // Вызов закрыли или сняли с оператора, пока он был не на связи. Карточке
      // больше не место — иначе она висит, и новые вызовы не предлагаются.
      if (code === "SESSION_ALREADY_CLOSED" || code === "NOT_ASSIGNED_TO_SESSION") {
        removeActiveSession(activeCall.id);
        toastBus.show({
          message:
            code === "SESSION_ALREADY_CLOSED" ? ru.operator.alreadyClosed : ru.operator.notYoursAnymore,
          severity: "warning",
        });
      } else {
        toastBus.show({ message, severity: "error" });
      }
      void queryClient.invalidateQueries({ queryKey: ["operator-active"] });
    } finally {
      setIsStarting(false);
    }
  }, [activeCall, queryClient, removeActiveSession, upsertActiveSession]);

  const onSkipOffer = React.useCallback(
    (sessionId: string) => {
      skipOffer(sessionId);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Свайп легко сделать случайно — вызов возвращается одним касанием.
      toastBus.show({
        message: ru.operatorPool.skipped,
        severity: "info",
        actionLabel: ru.operatorPool.undoSkip,
        onAction: () => unskipOffer(sessionId),
        // Трёх секунд по умолчанию не хватает, чтобы под стрессом заметить и нажать.
        duration: 6000,
      });
    },
    [skipOffer, unskipOffer],
  );

  const openQueue = React.useCallback(() => navigation.navigate("OperatorQueueModal"), [navigation]);

  /** Сколько свободных вызовов ждёт помимо того, что предложен сейчас. */
  const queued = Math.max(0, poolCount - (offer ? 1 : 0));

  const openCalls = React.useMemo(
    () => Object.values(activeSessionsById).filter((s) => s.status !== "CLOSED").length,
    [activeSessionsById],
  );

  // Смена сдавалась одним касанием: промах — и вызовы идут мимо оператора молча.
  const confirmEndShift = React.useCallback(() => {
    Alert.alert(
      ru.operatorShift.endConfirmTitle,
      openCalls > 0
        ? ru.operatorShift.endConfirmBusy.replace("{count}", String(openCalls))
        : ru.operatorShift.endConfirmMsg,
      [
        { text: ru.operatorShift.endConfirmCancel, style: "cancel" },
        { text: ru.operatorShift.endConfirmOk, style: "destructive", onPress: toggleShift },
      ],
    );
  }, [openCalls, toggleShift]);

  const shiftSince = shiftStartedAt
    ? new Date(shiftStartedAt).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;

  return (
    <View style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      {HAS_MAP_SUPPORT ? (
        <MapView
          ref={mapRef}
          provider={MAP_PROVIDER}
          style={StyleSheet.absoluteFill}
          showsUserLocation={locationGranted}
          onMapReady={() => setMapReady(true)}
          // Кнопка «Я» вела к точке, снятой один раз при открытии экрана, — после
          // поездки она указывала на старое место. Синяя точка карты живая, берём её.
          onUserLocationChange={(e) => {
            const c = e.nativeEvent.coordinate;
            if (!c) return;
            // Событие приходит часто; меньше 20 м для «Я» и расстояния неважны,
            // а каждый setState перерисовывал весь экран.
            setOperatorLocation((prev) =>
              prev && distanceMeters(prev, c) < 20
                ? prev
                : { latitude: c.latitude, longitude: c.longitude },
            );
          }}
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
              description={m.session.user?.phone ?? m.session.user?.email ?? undefined}
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
          {/* Занятому очередь не нужна: второй вызов сервер всё равно не даст. */}
          {queued > 0 && !activeCall ? (
            <Pressable
              onPress={openQueue}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={ru.operatorPool.queueTitle}
              style={[styles.queueBadge, { backgroundColor: tokens.colors.danger + "22" }]}
            >
              <Text style={[styles.queueText, { color: tokens.colors.danger }]}>
                {ru.operatorPool.queueMore.replace("{count}", String(queued))}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={confirmEndShift}
            disabled={isToggling}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={ru.operatorShift.endShiftA11y}
            style={styles.endShift}
          >
            <LogOut size={18} color={tokens.colors.onSurfaceMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.topActions}>
          <Pressable
            onPress={() => rootNavigation.navigate("Common", { screen: "Profile" })}
            accessibilityRole="button"
            accessibilityLabel={ru.operatorScreens.profile}
            style={[
              styles.fab,
              { backgroundColor: tokens.colors.surface + "F2", borderColor: tokens.colors.border },
            ]}
          >
            <UserRound size={20} color={tokens.colors.onSurface} strokeWidth={2} />
          </Pressable>

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
      </View>

      <View style={[styles.banner, { top: insets.top + 62 }]} pointerEvents="box-none">
        <ConnectionBanner />
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
            livePoint={liveLocationsBySessionId[activeCall.id]}
            operatorLocation={operatorLocation}
          />
        ) : null}

        {offer ? (
          <OfferCard
            session={offer}
            isAccepting={acceptingId === offer.id}
            onAccept={() => void accept(offer.id)}
            onDismiss={() => onSkipOffer(offer.id)}
          />
        ) : !activeCall ? (
          <Pressable
            onPress={skippedCount > 0 ? openQueue : undefined}
            disabled={skippedCount === 0}
            accessibilityRole={skippedCount > 0 ? "button" : undefined}
            style={[
              styles.idle,
              { backgroundColor: tokens.colors.surface + "F2", borderColor: tokens.colors.border },
            ]}
          >
            <Text
              style={[
                styles.idleText,
                { color: skippedCount > 0 ? tokens.colors.danger : tokens.colors.onSurfaceMuted },
              ]}
            >
              {skippedCount > 0
                ? ru.operatorPool.skippedCount.replace("{count}", String(skippedCount))
                : ru.operatorPool.waitingForCalls}
            </Text>
          </Pressable>
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
  queueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  queueText: { fontSize: 11, fontWeight: "800" },
  topActions: { flexDirection: "row", gap: 8 },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: { position: "absolute", left: 12, right: 12, alignItems: "center" },
  bottom: { position: "absolute", left: 12, right: 12, gap: 10 },
  idle: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  idleText: { fontSize: 13, fontWeight: "600" },
});
