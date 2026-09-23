import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { emergencyApi } from "../api/modules/emergency";
import { useEmergencyStore } from "../stores/emergencyStore";

/**
 * Background-friendly location tracking for active SOS sessions.
 *
 * On Android, expo-location creates a foreground service with a sticky
 * notification, so the OS keeps delivering updates after the app is
 * backgrounded or the screen is locked. On iOS, this requires
 * `UIBackgroundModes: ["location"]` in Info.plist; without it the updates
 * stop a few seconds after backgrounding.
 *
 * The task definition runs at module load. Each batch of location updates
 * is POSTed to the API; failures fall into the persisted offline queue,
 * which is drained by `useOfflineFlush` once connectivity returns.
 */
export const EMERGENCY_LOCATION_TASK = "sos-security-emergency-location";

interface LocationTaskData {
  locations?: Location.LocationObject[];
}

TaskManager.defineTask<LocationTaskData>(EMERGENCY_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  const locations = data?.locations;
  if (!locations || locations.length === 0) {
    return;
  }
  const activeSession = useEmergencyStore.getState().activeSession;
  if (!activeSession?.id || activeSession.status === "CLOSED") {
    return;
  }
  const sessionId = activeSession.id;
  const enqueueLocation = useEmergencyStore.getState().enqueueLocation;
  const markLocationSent = useEmergencyStore.getState().markLocationSent;

  for (const loc of locations) {
    // Сервер требует точность > 0; изредка GPS отдаёт 0 — такая точка получала
    // 400 и терялась.
    const accuracy = Math.max(1, loc.coords.accuracy ?? 10);
    try {
      await emergencyApi.sendLocation(sessionId, {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy,
      });
      markLocationSent();
    } catch {
      await enqueueLocation({
        sessionId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy,
        capturedAt: Date.now(),
      });
    }
  }
});

const hasStartedSafe = async (): Promise<boolean> => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(EMERGENCY_LOCATION_TASK);
  } catch {
    return false;
  }
};

export const locationTrackingService = {
  /**
   * Starts the OS-driven location updates with a foreground service on Android.
   * Idempotent; returns true if the task is running on exit.
   */
  async start(intervalMs: number): Promise<boolean> {
    if (await hasStartedSafe()) {
      return true;
    }
    try {
      await Location.startLocationUpdatesAsync(EMERGENCY_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: intervalMs,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.OtherNavigation,
        foregroundService: {
          notificationTitle: "SOS активна",
          notificationBody: "Координаты передаются спасателям",
          notificationColor: "#C4F82A",
        },
      });
      return true;
    } catch (error) {
      // Чаще всего нет фонового разрешения. Вызывающий переходит на отправку из
      // приложения, но причина нужна для разбора — молча её терять нельзя.
      console.warn("sos-location: startLocationUpdatesAsync failed", error);
      return false;
    }
  },

  async stop(): Promise<void> {
    if (!(await hasStartedSafe())) {
      return;
    }
    try {
      await Location.stopLocationUpdatesAsync(EMERGENCY_LOCATION_TASK);
    } catch {
      // best-effort
    }
  },
};
