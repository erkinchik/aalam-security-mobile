import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { emergencyApi } from "../api/modules/emergency";
import { locationTrackingService } from "../services/locationTrackingService";
import { useEmergencyStore } from "../stores/emergencyStore";
import { useAuthStore } from "../stores/authStore";

/**
 * Owns the lifecycle of SOS location tracking:
 *   - For PERSONAL or owner GPS sessions, hands off the periodic GPS reads
 *     to the OS via `locationTrackingService` (foreground service on Android,
 *     UIBackgroundModes-backed window on iOS). The task handles sending and
 *     offline queueing internally — see services/locationTrackingService.ts.
 *   - For VENUE sessions without a personal subscription we don't read GPS;
 *     we POST the venue's static coordinates once per session.
 *
 * The hook itself only orchestrates; the actual transmission lives in the task.
 */
export const useEmergencyLocationSender = (intervalMs = 5000) => {
  const role = useAuthStore((state) => state.role);
  const individualSubscriptionActive = useAuthStore(
    (state) => state.user?.individualSubscriptionActive,
  );
  const activeSession = useEmergencyStore((state) => state.activeSession);
  const setSendingLocation = useEmergencyStore((state) => state.setSendingLocation);
  const markLocationSent = useEmergencyStore((state) => state.markLocationSent);
  const activeSessionId = activeSession?.id;
  // Именно «открыт ли», а не сам статус: иначе каждый переход NEW → ASSIGNED →
  // IN_PROGRESS останавливал и заново запускал трекинг, и на заблокированном
  // экране перезапуск мог не подняться — точки обрывались сразу после принятия.
  const isSessionOpen = Boolean(activeSession) && activeSession?.status !== "CLOSED";
  const venueLat = activeSession?.venue?.latitude;
  const venueLng = activeSession?.venue?.longitude;

  /** One-shot guard: send venue branch coordinates only once per session. */
  const venueBranchSentForSessionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeSessionId || !isSessionOpen || role !== "USER") {
      void locationTrackingService.stop();
      return;
    }

    const venueCoords = getFiniteVenueCoords(venueLat, venueLng);
    if (venueCoords) {
      void locationTrackingService.stop();
      if (venueBranchSentForSessionRef.current.has(activeSessionId)) {
        return;
      }
      venueBranchSentForSessionRef.current.add(activeSessionId);

      let cancelled = false;
      const { lat, lng } = venueCoords;
      const sendVenueOnce = async () => {
        const latest = useEmergencyStore.getState().activeSession;
        if (!latest?.id || latest.status === "CLOSED" || latest.id !== activeSessionId) {
          return;
        }
        try {
          setSendingLocation(true);
          await emergencyApi.sendLocation(activeSessionId, {
            latitude: lat,
            longitude: lng,
            accuracy: 10,
          });
          markLocationSent();
        } catch {
          // Queue for retry once connectivity returns.
          await useEmergencyStore.getState().enqueueLocation({
            sessionId: activeSessionId,
            latitude: lat,
            longitude: lng,
            accuracy: 10,
            capturedAt: Date.now(),
          });
          venueBranchSentForSessionRef.current.delete(activeSessionId);
        } finally {
          if (!cancelled) {
            setSendingLocation(false);
          }
        }
      };

      void sendVenueOnce();
      return () => {
        cancelled = true;
        setSendingLocation(false);
      };
    }

    /** Venue-mode without personal subscription: no GPS tracking. */
    if (activeSession?.emergencyType === "VENUE" && !individualSubscriptionActive) {
      void locationTrackingService.stop();
      return;
    }

    let cancelled = false;
    let foregroundTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Запасной путь, когда фоновая задача недоступна: в Expo Go
     * startLocationUpdatesAsync не работает вовсе, а в обычной сборке
     * пользователь мог не дать фоновое разрешение. Без него сессия уходила
     * оператору без единой координаты — на карте не появлялось ничего.
     */
    const sendOnce = async () => {
      const latest = useEmergencyStore.getState().activeSession;
      if (!latest?.id || latest.status === "CLOSED" || latest.id !== activeSessionId) return;
      try {
        setSendingLocation(true);
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await emergencyApi.sendLocation(activeSessionId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.max(1, pos.coords.accuracy ?? 10),
        });
        markLocationSent();
      } catch {
        // Сеть или GPS подвели — следующий тик попробует снова.
      } finally {
        setSendingLocation(false);
      }
    };

    const bootstrap = async () => {
      const current = await Location.getForegroundPermissionsAsync();
      const granted = current.status === "granted"
        ? true
        : (await Location.requestForegroundPermissionsAsync()).status === "granted";
      if (!granted || cancelled) {
        return;
      }
      const backgroundStarted = await locationTrackingService.start(intervalMs);
      if (cancelled || backgroundStarted) return;
      console.warn("sos-location: фоновый трекинг не запустился, шлём из приложения");

      void sendOnce();
      foregroundTimer = setInterval(() => void sendOnce(), intervalMs);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (foregroundTimer) clearInterval(foregroundTimer);
      void locationTrackingService.stop();
    };
  }, [
    activeSessionId,
    isSessionOpen,
    intervalMs,
    markLocationSent,
    role,
    setSendingLocation,
    venueLat,
    venueLng,
    individualSubscriptionActive,
    activeSession?.emergencyType,
  ]);
};

function getFiniteVenueCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return null;
}
