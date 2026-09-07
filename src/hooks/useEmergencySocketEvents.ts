import { useEffect } from "react";
import * as Haptics from "expo-haptics";
import { useEmergencyStore } from "../stores/emergencyStore";
import { useOperatorStore } from "../stores/operatorStore";
import { useWebsocketStore } from "../stores/websocketStore";
import { socketService } from "../services/socketService";
import { sosSoundService } from "../services/sosSoundService";
import { useAuthStore } from "../stores/authStore";
import { EmergencySession } from "../types/emergency";
import { toastBus } from "../ui/feedback/toastBus";
import { ru } from "../locale/ru";
import { navigateToOperatorHome } from "../navigation/navigationRef";

export const useEmergencySocketEvents = () => {
  const token = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);
  const myUserId = useAuthStore((state) => state.user?.id ?? null);
  const setConnected = useWebsocketStore((state) => state.setConnected);
  const setReconnecting = useWebsocketStore((state) => state.setReconnecting);
  const markEvent = useWebsocketStore((state) => state.markEvent);
  const setActiveSession = useEmergencyStore((state) => state.setActiveSession);
  const setSelectedSession = useOperatorStore((state) => state.setSelectedSession);
  const setLiveLocation = useOperatorStore((state) => state.setLiveLocation);
  const upsertActiveSession = useOperatorStore((state) => state.upsertActiveSession);
  const setLiveLocationForSession = useOperatorStore((state) => state.setLiveLocationForSession);
  const syncPoolSession = useOperatorStore((state) => state.syncPoolSession);
  const removePoolSession = useOperatorStore((state) => state.removePoolSession);
  const removeActiveSession = useOperatorStore((state) => state.removeActiveSession);

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
    const onDisconnect = () => setConnected(false);
    const onReconnectAttempt = () => setReconnecting(true);
    const onConnectError = (err: Error) => {
      const msg = err?.message ?? "";
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("auth")) {
        useAuthStore.getState().logout();
      }
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("reconnect_attempt", onReconnectAttempt);
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
        // Только свои вызовы становятся выбранными: раньше любое событие по
        // чужой сессии перебивало то, что оператор открыл у себя на экране.
        if (payload.status !== "CLOSED" && payload.assignedOperatorId === myUserId) {
          setSelectedSession(payload);
        }
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
        void sosSoundService.playAlarm();
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

    /** Снимок пула и своих вызовов после (пере)подключения — REL-6. */
    const onBootstrap = (payload: { sessions?: EmergencySession[] }) => {
      markEvent();
      if (role !== "OPERATOR") return;
      (payload?.sessions ?? []).forEach((session) => {
        syncPoolSession(session);
        syncMySession(session);
      });
    };

    const onSessionClosed = (payload: EmergencySession) => {
      markEvent();
      if (role === "USER") {
        setActiveSession(null);
      }
      if (role === "OPERATOR") {
        syncMySession(payload);
        removePoolSession(payload.id);
        // Clear selectedSession if it's the one being closed
        const current = useOperatorStore.getState().selectedSession;
        if (current?.id === payload.id) {
          setSelectedSession(null);
        }
      }
    };

    socket.on("emergency:new", onEmergencyNew);
    socket.on("emergency:bootstrap", onBootstrap);
    socket.on("emergency:assigned", onSessionEvent);
    socket.on("emergency:in_progress", onSessionEvent);
    socket.on("emergency:closed", onSessionClosed);
    socket.on("emergency:reassigned", onSessionEvent);
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
        // Координаты по чужой сессии не должны подменять выбранный вызов.
        if (payload.session.assignedOperatorId === myUserId) {
          setSelectedSession(payload.session);
          setLiveLocation(payload.location);
        }
        syncMySession(payload.session);
        setLiveLocationForSession(payload.session.id, payload.location);
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
      socket.off("disconnect", onDisconnect);
      socket.off("reconnect_attempt", onReconnectAttempt);
      socket.off("connect_error", onConnectError);
      socket.off("emergency:new", onEmergencyNew);
      socket.off("emergency:bootstrap", onBootstrap);
      socket.off("emergency:assigned", onSessionEvent);
      socket.off("emergency:in_progress", onSessionEvent);
      socket.off("emergency:closed", onSessionClosed);
      socket.off("emergency:reassigned", onSessionEvent);
      socket.off("emergency:location_update", onLocationUpdate);
      socket.off("subscription:approved", onSubscriptionApproved);
      socket.off("subscription:rejected", onSubscriptionRejected);
    };
  }, [
    markEvent,
    myUserId,
    removeActiveSession,
    removePoolSession,
    role,
    setActiveSession,
    setConnected,
    setLiveLocation,
    setLiveLocationForSession,
    setReconnecting,
    setSelectedSession,
    syncPoolSession,
    upsertActiveSession,
    token,
  ]);
};
