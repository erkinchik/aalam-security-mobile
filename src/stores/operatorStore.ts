import { create } from "zustand";
import { EmergencyLocation, EmergencySession } from "../types/emergency";

type SessionMap = Record<string, EmergencySession>;
type LocationMap = Record<string, EmergencyLocation>;

/** Свободный вызов — ещё не принят никем. */
const isUnclaimed = (session: EmergencySession) =>
  session.status === "NEW" && !session.assignedOperatorId;

interface OperatorState {
  selectedSession: EmergencySession | null;
  highlightedSessionId: string | null;
  liveLocation: EmergencyLocation | null;
  activeSessionsById: SessionMap;
  liveLocationsBySessionId: LocationMap;
  heartbeatLastSentAt: string | null;
  /** Свободные вызовы, доступные к приёму. */
  poolById: SessionMap;
  isOnShift: boolean;
  shiftStartedAt: string | null;
  /** Пришёл ли ответ сервера о смене. До этого показывать шлагбаум нельзя. */
  isShiftResolved: boolean;
  /** Вызовы, которые оператор смахнул: не предлагаем их повторно за эту смену. */
  skippedSessionIds: string[];
  setSelectedSession: (session: EmergencySession | null) => void;
  setHighlightedSessionId: (sessionId: string | null) => void;
  setLiveLocation: (location: EmergencyLocation | null) => void;
  setLiveLocationForSession: (sessionId: string, location: EmergencyLocation) => void;
  upsertActiveSession: (session: EmergencySession) => void;
  removeActiveSession: (sessionId: string) => void;
  markHeartbeatSent: () => void;
  /** Кладёт в пул, если вызов свободен, иначе убирает — по одному правилу. */
  syncPoolSession: (session: EmergencySession) => void;
  removePoolSession: (sessionId: string) => void;
  setShift: (shift: { onShift: boolean; shiftStartedAt: string | null }) => void;
  /** Смахнуть текущее предложение — следующим предложится другой вызов. */
  skipOffer: (sessionId: string) => void;
}

export const useOperatorStore = create<OperatorState>((set) => ({
  selectedSession: null,
  highlightedSessionId: null,
  liveLocation: null,
  activeSessionsById: {},
  liveLocationsBySessionId: {},
  heartbeatLastSentAt: null,
  setSelectedSession: (selectedSession) =>
    set({
      selectedSession,
      highlightedSessionId: selectedSession?.id ?? null,
    }),
  setHighlightedSessionId: (highlightedSessionId) => set({ highlightedSessionId }),
  setLiveLocation: (liveLocation) => set({ liveLocation }),
  setLiveLocationForSession: (sessionId, location) =>
    set((state) => ({
      liveLocationsBySessionId: {
        ...state.liveLocationsBySessionId,
        [sessionId]: location,
      },
    })),
  upsertActiveSession: (session) =>
    set((state) => {
      const nextSessions = { ...state.activeSessionsById };
      if (session.status === "CLOSED") {
        delete nextSessions[session.id];
      } else {
        nextSessions[session.id] = session;
      }
      return { activeSessionsById: nextSessions };
    }),
  removeActiveSession: (sessionId) =>
    set((state) => {
      if (!state.activeSessionsById[sessionId]) return state;
      const next = { ...state.activeSessionsById };
      delete next[sessionId];
      return { activeSessionsById: next };
    }),
  markHeartbeatSent: () => set({ heartbeatLastSentAt: new Date().toISOString() }),
  poolById: {},
  isOnShift: false,
  shiftStartedAt: null,
  isShiftResolved: false,
  skippedSessionIds: [],
  syncPoolSession: (session) =>
    set((state) => {
      const alreadyInPool = Boolean(state.poolById[session.id]);
      // Вне смены пул пуст: события о чужих свободных вызовах приходят по общей
      // комнате операторов, но принимать их нельзя — и в счётчике им не место.
      if (isUnclaimed(session) && state.isOnShift) {
        if (alreadyInPool && state.poolById[session.id] === session) return state;
        return { poolById: { ...state.poolById, [session.id]: session } };
      }
      if (!alreadyInPool) return state;
      const nextPool = { ...state.poolById };
      delete nextPool[session.id];
      return { poolById: nextPool };
    }),
  removePoolSession: (sessionId) =>
    set((state) => {
      if (!state.poolById[sessionId]) return state;
      const nextPool = { ...state.poolById };
      delete nextPool[sessionId];
      return { poolById: nextPool };
    }),
  setShift: ({ onShift, shiftStartedAt }) =>
    set(
      onShift
        ? { isOnShift: true, shiftStartedAt, isShiftResolved: true }
        : // Вне смены вызовы не приходят: пул и пропуски начинаются заново.
          {
            isOnShift: false,
            shiftStartedAt: null,
            isShiftResolved: true,
            poolById: {},
            skippedSessionIds: [],
          },
    ),
  skipOffer: (sessionId) =>
    set((state) =>
      state.skippedSessionIds.includes(sessionId)
        ? state
        : { skippedSessionIds: [...state.skippedSessionIds, sessionId] },
    ),
}));

/**
 * Текущее предложение — самый давний свободный вызов, который оператор ещё не
 * смахнул. Списка вызовов в интерфейсе нет, поэтому пул проявляется только
 * через эту карточку: смахнул одну — сразу предлагается следующая.
 */
export const selectCurrentOffer = (state: OperatorState): EmergencySession | null => {
  if (!state.isOnShift) return null;
  const candidates = Object.values(state.poolById).filter(
    (session) => !state.skippedSessionIds.includes(session.id),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, session) =>
    new Date(session.createdAt).getTime() < new Date(oldest.createdAt).getTime()
      ? session
      : oldest,
  );
};
