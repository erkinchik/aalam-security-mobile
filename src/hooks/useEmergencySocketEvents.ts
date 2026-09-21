import { useEffect } from "react";
import * as Haptics from "expo-haptics";
import { useEmergencyStore } from "../stores/emergencyStore";
import { useOperatorStore } from "../stores/operatorStore";
import { useWebsocketStore } from "../stores/websocketStore";
import { socketService } from "../services/socketService";
import { useAuthStore } from "../stores/authStore";
import { EmergencySession } from "../types/emergency";
import { toastBus } from "../ui/feedback/toastBus";
import { ru } from "../locale/ru";
import { navigateToOperatorHome } from "../navigation/navigationRef";
import { queryClient } from "../queryClient";
import { OPERATOR_SHIFT_QUERY_KEY } from "./useOperatorShift";

/**
 * Когда последний раз обновляли токен из-за разрыва со стороны сервера. Вне
 * хука: эффект пересоздаётся при каждой смене токена, и счётчик внутри него
 * обнулялся бы ровно после обновления. Не чаще раза в минуту — если сервер рвёт
 * соединение сразу после подключения (учётку удалили), иначе вышел бы цикл.
 */
let lastServerDropRefreshAt = 0;

export const useEmergencySocketEvents = () => {
  const token = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);
  const myUserId = useAuthStore((state) => state.user?.id ?? null);
  const setConnected = useWebsocketStore((state) => state.setConnected);
  const setReconnecting = useWebsocketStore((state) => state.setReconnecting);
  const markEvent = useWebsocketStore((state) => state.markEvent);
  const setActiveSession = useEmergencyStore((state) => state.setActiveSession);
  const upsertActiveSession = useOperatorStore((state) => state.upsertActiveSession);
  const setLiveLocationForSession = useOperatorStore((state) => state.setLiveLocationForSession);
  const syncPoolSession = useOperatorStore((state) => state.syncPoolSession);
  const removePoolSession = useOperatorStore((state) => state.removePoolSession);
  const removeActiveSession = useOperatorStore((state) => state.removeActiveSession);
  const setShift = useOperatorStore((state) => state.setShift);
  const replaceActiveSessions = useOperatorStore((state) => state.replaceActiveSessions);
  const replacePool = useOperatorStore((state) => state.replacePool);

  useEffect(() => {
    if (!token) {
      socketService.disconnect();
      setConnected(false);
      setReconnecting(false);
      return;
    }

    /**
     * В «моих вызовах» держим только назначенные на этого оператора. Раньше сюда
     * попадала любая сессия из общей комнаты operators — в том числе только что
     * созданные чужие, — и на карте висела карточка вызова, который оператор не
     * принимал.
     */
    const syncMySession = (session: EmergencySession) => {
      if (session.assignedOperatorId && session.assignedOperatorId === myUserId) {
        upsertActiveSession(session);
      } else {
        removeActiveSession(session.id);
      }
    };

    const socket = socketService.connect(token);
    const onConnect = () => {
      setConnected(true);
      setReconnecting(false);
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      // Сервер закрыл сокет сам — чаще всего по истечении токена. socket.io в
      // этом случае не переподключается, и оператор молча оставался без
      // вызовов. Новый токен поднимет соединение: хук пересоздаёт сокет при его
      // смене.
      if (reason === "io server disconnect" && Date.now() - lastServerDropRefreshAt > 60_000) {
        lastServerDropRefreshAt = Date.now();
        void useAuthStore.getState().refresh();
      }
    };
    const onConnectError = (err: Error) => {
      const msg = err?.message ?? "";
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("auth")) {
        useAuthStore.getState().logout();
      }
    };
    // Сервер закрывает сокет по истечении токена. Предупреждение приходит за
    // минуту — обновляем токен, и сокет переподключится уже с новым.
    // revalidateSession здесь не годился: он ходит со старым, ещё живым
    // токеном и ничего не обновляет.
    const onAuthExpiring = () => {
      void useAuthStore.getState().refresh();
    };

    socket.on("connect", onConnect);
    socket.on("auth:expiring", onAuthExpiring);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    const onSessionEvent = (payload: EmergencySession) => {
      markEvent();
      if (role === "USER") {
        // A CLOSED status always clears. Otherwise only refresh the session
        // that is still active locally — never revive one we've already
        // cleared (e.g. after an operator/admin closed it).
        if (payload.status === "CLOSED") {
          setActiveSession(null);
        } else {
          const current = useEmergencyStore.getState().activeSession;
          if (current && current.id === payload.id) {
            setActiveSession(payload);
          }
        }
      }
      if (role === "OPERATOR") {
        syncPoolSession(payload);
        syncMySession(payload);
      }
    };

    const onEmergencyNew = (payload: EmergencySession) => {
      markEvent();
      // Событие приходит только дежурным — комнату фильтрует бэкенд.
      if (role === "OPERATOR") {
        // Карточка предложения появится сама — стор её выберет из пула.
        syncPoolSession(payload);
        // Звук ведёт useOfferAlarm: сирена звучит, пока вызов не принят.
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        // С вкладки «История» карточку не видно. Свободного оператора уводим на
        // карту; занятого не дёргаем, чтобы не выбить из текущего вызова.
        const busy = Object.values(useOperatorStore.getState().activeSessionsById).some(
          (s) => s.status !== "CLOSED",
        );
        if (!busy) navigateToOperatorHome();
      }
      onSessionEvent(payload);
    };

    /**
     * Вызов перестал быть свободным — приняли, назначили или закрыли до приёма.
     * Приходит один идентификатор: полную сессию сервер теперь шлёт только тем,
     * кто с ней работает.
     */
    const onPoolRemoved = (payload: { id?: string }) => {
      markEvent();
      if (role !== "OPERATOR" || !payload?.id) return;
      removePoolSession(payload.id);
    };

    /** Вызов забрали: админ переназначил или cron вернул его в пул. */
    const onReassigned = (payload: EmergencySession) => {
      if (role === "OPERATOR") {
        const wasMine = Boolean(
          useOperatorStore.getState().activeSessionsById[payload.id],
        );
        if (wasMine && payload.assignedOperatorId !== myUserId) {
          toastBus.show({
            // Без исполнителя — вызов вернули в очередь (админ или по тишине).
            message: payload.assignedOperatorId
              ? ru.operatorPool.takenAway
              : ru.operatorPool.returnedToQueue,
            severity: "warning",
          });
        }
      }
      onSessionEvent(payload);
    };

    /**
     * Снимок после (пере)подключения — вся правда о смене, своих вызовах и пуле.
     * Заменяем, а не сливаем: всё, что случилось, пока сокет лежал (вызов
     * закрыли, забрали, смену сняли), видно только по отсутствию в снимке.
     */
    const onBootstrap = (payload: { sessions?: EmergencySession[]; onShift?: boolean }) => {
      markEvent();
      if (role !== "OPERATOR") return;
      const sessions = payload?.sessions ?? [];
      if (typeof payload?.onShift === "boolean") {
        const wasOnShift = useOperatorStore.getState().isOnShift;
        if (payload.onShift !== wasOnShift) {
          setShift({
            onShift: payload.onShift,
            shiftStartedAt: payload.onShift
              ? useOperatorStore.getState().shiftStartedAt
              : null,
          });
          // Время начала смены в снимке нет — пусть подтянет запрос смены.
          void queryClient.invalidateQueries({ queryKey: OPERATOR_SHIFT_QUERY_KEY });
          if (!payload.onShift) {
            toastBus.show({ message: ru.operatorShift.endedWhileOffline, severity: "warning" });
          }
        }
      }
      replaceActiveSessions(
        sessions.filter((session) => session.assignedOperatorId === myUserId),
      );
      replacePool(sessions);
    };

    const onSessionClosed = (payload: EmergencySession) => {
      markEvent();
      if (role === "USER") {
        setActiveSession(null);
      }
      if (role === "OPERATOR") {
        syncMySession(payload);
        removePoolSession(payload.id);
      }
    };

    /** Смену снял сервер: cron из-за молчания или администратор. */
    const onShiftEnded = (payload: { reason?: string }) => {
      markEvent();
      if (role !== "OPERATOR") return;
      setShift({ onShift: false, shiftStartedAt: null });
      toastBus.show({
        message:
          payload?.reason === "admin"
            ? ru.operatorShift.endedByAdmin
            : ru.operatorShift.endedByInactivity,
        severity: "warning",
      });
    };

    socket.on("emergency:new", onEmergencyNew);
    socket.on("emergency:bootstrap", onBootstrap);
    socket.on("operator:shift_ended", onShiftEnded);
    socket.on("emergency:assigned", onSessionEvent);
    socket.on("emergency:in_progress", onSessionEvent);
    socket.on("emergency:closed", onSessionClosed);
    socket.on("emergency:reassigned", onReassigned);
    socket.on("emergency:pool_removed", onPoolRemoved);
    const onLocationUpdate = (payload: {
      session: EmergencySession;
      location: { latitude: number; longitude: number; accuracy: number };
    }) => {
      markEvent();
      if (role === "USER") {
        // Guard against the revive race: the native tracker can emit one last
        // location update right after the session was closed. Only apply it if
        // this session is still the active one, and clear on CLOSED.
        const current = useEmergencyStore.getState().activeSession;
        if (current && current.id === payload.session.id) {
          if (payload.session.status === "CLOSED") {
            setActiveSession(null);
          } else {
            setActiveSession(payload.session);
          }
        }
      }
      if (role === "OPERATOR") {
        // Координаты обновляют только вызов, который уже на экране. Иначе
        // точка, пришедшая сразу после закрытия, воскрешала закрытый вызов.
        const known = useOperatorStore.getState().activeSessionsById[payload.session.id];
        if (!known) return;
        syncMySession(payload.session);
        if (payload.session.status !== "CLOSED") {
          setLiveLocationForSession(payload.session.id, payload.location);
        }
      }
    };

    socket.on("emergency:location_update", onLocationUpdate);

    const onSubscriptionApproved = (_payload: {
      requestId: string;
      expiresAt: string | null;
    }) => {
      markEvent();
      if (role === "USER") {
        void useAuthStore.getState().refreshMe();
        toastBus.show({
          message: ru.subscriptionRequest.approvedToast,
          severity: "success",
        });
      }
    };
    const onSubscriptionRejected = (payload: {
      requestId: string;
      reason: string | null;
    }) => {
      markEvent();
      if (role === "USER") {
        toastBus.show({
          message: payload.reason
            ? `${ru.subscriptionRequest.rejectedToast}: ${payload.reason}`
            : ru.subscriptionRequest.rejectedToast,
          severity: "error",
        });
      }
    };
    socket.on("subscription:approved", onSubscriptionApproved);
    socket.on("subscription:rejected", onSubscriptionRejected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("auth:expiring", onAuthExpiring);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("emergency:new", onEmergencyNew);
      socket.off("emergency:bootstrap", onBootstrap);
      socket.off("operator:shift_ended", onShiftEnded);
      socket.off("emergency:assigned", onSessionEvent);
      socket.off("emergency:in_progress", onSessionEvent);
      socket.off("emergency:closed", onSessionClosed);
      socket.off("emergency:reassigned", onReassigned);
      socket.off("emergency:pool_removed", onPoolRemoved);
      socket.off("emergency:location_update", onLocationUpdate);
      socket.off("subscription:approved", onSubscriptionApproved);
      socket.off("subscription:rejected", onSubscriptionRejected);
    };
  }, [
    markEvent,
    myUserId,
    removeActiveSession,
    removePoolSession,
    replaceActiveSessions,
    replacePool,
    role,
    setShift,
    setActiveSession,
    setConnected,
    setLiveLocationForSession,
    setReconnecting,
    syncPoolSession,
    upsertActiveSession,
    token,
  ]);
};
