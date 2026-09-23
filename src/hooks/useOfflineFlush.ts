import { useCallback, useEffect, useRef, useState } from "react";
import { useEmergencyStore } from "../stores/emergencyStore";
import { networkService } from "../services/networkService";
import { isAxiosError } from "axios";
import { emergencyApi } from "../api/modules/emergency";

/**
 * Ответ, после которого точку повторять бессмысленно: сессия закрыта, чужая или
 * данные неверны. 401 и 429 — временные: токен обновится, лимит отпустит.
 */
const isPermanentRejection = (error: unknown) => {
  if (!isAxiosError(error) || !error.response) return false;
  const status = error.response.status;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
};

/** Periodic retry cadence while a backlog exists but sends keep failing. */
const RETRY_INTERVAL_MS = 20000;

/**
 * Watches network connectivity and drains the persisted location queue against
 * the server. Exposes connectivity + sync state so the UI can render an
 * accurate banner.
 *
 * `isOnline` reflects NetInfo connectivity, but that can report "connected"
 * while the server is actually unreachable. So the banner must distinguish
 * "actively sending" (`isSyncing`) from "queued, waiting to send" — otherwise
 * it gets stuck on "Отправляем…" forever when the network drops but NetInfo
 * still claims a connection. A periodic retry lets the queue self-heal once the
 * server is reachable again, even if NetInfo never emits a change event.
 *
 * Hydration of AsyncStorage queues runs on first mount; the call is idempotent
 * because the store guards against repeated hydration via isOfflineQueuesHydrated.
 */
export const useOfflineFlush = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isFlushingRef = useRef(false);
  const isOnlineRef = useRef(true);

  const pendingQueueLength = useEmergencyStore((state) => state.pendingLocationQueue.length);

  useEffect(() => {
    void useEmergencyStore.getState().hydrateOfflineQueues();
  }, []);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // Single guarded drain. `isSyncing` is only true while a send is actually
  // in flight, so the banner never claims "Отправляем…" while idle/stuck.
  const flush = useCallback(async () => {
    if (isFlushingRef.current) return;
    if (!isOnlineRef.current) return;
    if (useEmergencyStore.getState().pendingLocationQueue.length === 0) return;

    isFlushingRef.current = true;
    setIsSyncing(true);
    try {
      while (isOnlineRef.current) {
        const queue = useEmergencyStore.getState().pendingLocationQueue;
        if (queue.length === 0) break;
        const point = queue[0];
        try {
          await emergencyApi.sendLocation(point.sessionId, {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
          });
          await useEmergencyStore.getState().dequeueLocations(1);
        } catch (error) {
          // Одна точка закрытой или чужой сессии раньше останавливала очередь
          // навсегда: повтор каждые 20 с получал тот же отказ. Такие выбрасываем.
          if (isPermanentRejection(error)) {
            console.warn("offline-queue: сервер отклонил точку, выбрасываем", point.sessionId, error);
            await useEmergencyStore.getState().dequeueLocations(1);
            continue;
          }
          // Server unreachable — stop. The retry timer or a reconnect event
          // will resume the drain later.
          break;
        }
      }
    } finally {
      isFlushingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  // Flush on connectivity change (fast path on reconnect).
  useEffect(() => {
    const unsubscribe = networkService.subscribe((online) => {
      setIsOnline(online);
      if (online) void flush();
    });
    return unsubscribe;
  }, [flush]);

  // Periodic retry while a backlog exists. Self-heals when the server comes
  // back even if NetInfo keeps reporting "connected" the whole time. When truly
  // offline, `flush` early-returns, so this never churns.
  useEffect(() => {
    if (pendingQueueLength === 0) return;
    void flush();
    const id = setInterval(() => void flush(), RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush, pendingQueueLength]);

  return { isOnline, isSyncing, pendingQueueLength };
};
