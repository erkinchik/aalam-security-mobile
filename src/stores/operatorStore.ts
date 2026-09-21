import { create } from "zustand";
import type { EmergencyLocation, EmergencySession } from "../types/emergency";

type SessionMap = Record<string, EmergencySession>;
type LocationMap = Record<string, EmergencyLocation>;

/**
 * Сколько смахнутое предложение не показывается снова. Достаточно, чтобы оно не
 * мигало перед оператором, и достаточно мало, чтобы вызов не потерялся, когда
 * дежурный на линии один.
 */
export const SKIP_COOLDOWN_MS = 120_000;

/** Сколько живёт в пуле вызов, которого нет в снимке сервера, — см. replacePool. */
const FRESH_POOL_MS = 15_000;

/** Свободный вызов — ещё не принят никем. */
const isUnclaimed = (session: EmergencySession) =>
  session.status === "NEW" && !session.assignedOperatorId;

interface OperatorState {
  activeSessionsById: SessionMap;
  liveLocationsBySessionId: LocationMap;
  /** Свободные вызовы, доступные к приёму. */
  poolById: SessionMap;
  isOnShift: boolean;
  shiftStartedAt: string | null;
  /** Пришёл ли ответ сервера о смене. До этого показывать шлагбаум нельзя. */
  isShiftResolved: boolean;
  /**
   * Смахнутые вызовы: id → момент, когда предложение можно показать снова.
   * Раньше это был простой список на всю смену, и вызов, смахнутый единственным
   * дежурным, повисал в пуле до вмешательства админа.
   */
  skippedUntil: Record<string, number>;
  setLiveLocationForSession: (sessionId: string, location: EmergencyLocation) => void;
  upsertActiveSession: (session: EmergencySession) => void;
  removeActiveSession: (sessionId: string) => void;
  /**
   * Свои вызовы целиком из снимка сервера. Слиянием нельзя: вызов, закрытый,
   * пока сокет лежал, в снимке просто отсутствует, и при слиянии он висел на
   * экране до перезапуска приложения.
   */
  replaceActiveSessions: (sessions: EmergencySession[]) => void;
  /** Пул целиком из снимка сервера — по той же причине. */
  replacePool: (sessions: EmergencySession[]) => void;
  /** Кладёт в пул, если вызов свободен, иначе убирает — по одному правилу. */
  syncPoolSession: (session: EmergencySession) => void;
  removePoolSession: (sessionId: string) => void;
  setShift: (shift: { onShift: boolean; shiftStartedAt: string | null }) => void;
  /** Смахнуть текущее предложение — следующим предложится другой вызов. */
  skipOffer: (sessionId: string) => void;
  /** Убирает отлежавшиеся пропуски, чтобы вызов снова стал предлагаться. */
  expireSkips: () => void;
  /** Вернуть смахнутый вызов в предложения — случайный свайп или выбор из очереди. */
  unskipOffer: (sessionId: string) => void;
  /** Выход из учётки: следующий пользователь не должен унаследовать чужие вызовы. */
  reset: () => void;
}

const INITIAL_STATE = {
  activeSessionsById: {} as SessionMap,
  liveLocationsBySessionId: {} as LocationMap,
  poolById: {} as SessionMap,
  isOnShift: false,
  shiftStartedAt: null as string | null,
  isShiftResolved: false,
  skippedUntil: {} as Record<string, number>,
};

export const useOperatorStore = create<OperatorState>((set) => ({
  ...INITIAL_STATE,
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
        // Слияние, а не замена: событие без части полей не должно стирать с
        // карточки телефон и вход в объект.
        nextSessions[session.id] = { ...nextSessions[session.id], ...session };
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
  replaceActiveSessions: (sessions) =>
    set((state) => {
      const open = sessions.filter((session) => session.status !== "CLOSED");
      const ids = new Set(open.map((session) => session.id));
      return {
        activeSessionsById: Object.fromEntries(open.map((session) => [session.id, session])),
        liveLocationsBySessionId: Object.fromEntries(
          Object.entries(state.liveLocationsBySessionId).filter(([id]) => ids.has(id)),
        ),
      };
    }),
  replacePool: (sessions) =>
    set((state) => {
      if (!state.isOnShift) return { poolById: {}, skippedUntil: {} };
      const nextPool: SessionMap = Object.fromEntries(
        sessions.filter(isUnclaimed).map((session) => [session.id, session]),
      );
      // Снимок мог разминуться с emergency:new: вызов создан уже после того, как
      // сервер прочитал базу. Совсем свежие вызовы не выбрасываем — призраки,
      // ради которых замена и нужна, всегда старше.
      const now = Date.now();
      for (const session of Object.values(state.poolById)) {
        if (!nextPool[session.id] && now - new Date(session.createdAt).getTime() < FRESH_POOL_MS) {
          nextPool[session.id] = session;
        }
      }
      const ids = new Set(Object.keys(nextPool));
      return {
        poolById: nextPool,
        // Пропуск ушедшего вызова больше ничего не значит.
        skippedUntil: Object.fromEntries(
          Object.entries(state.skippedUntil).filter(([id]) => ids.has(id)),
        ),
      };
    }),
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
        : // Вне смены вызовов нет: пул и пропуски начинаются заново, а своих
          // открытых быть не может — сервер не отдаёт смену с ними. Оставшийся
          // здесь вызов — это фантом, который вернулся бы с новой сменой.
          {
            isOnShift: false,
            shiftStartedAt: null,
            isShiftResolved: true,
            poolById: {},
            skippedUntil: {},
            activeSessionsById: {},
            liveLocationsBySessionId: {},
          },
    ),
  skipOffer: (sessionId) =>
    set((state) => ({
      skippedUntil: {
        ...state.skippedUntil,
        [sessionId]: Date.now() + SKIP_COOLDOWN_MS,
      },
    })),
  expireSkips: () =>
    set((state) => {
      const now = Date.now();
      const next = Object.fromEntries(
        Object.entries(state.skippedUntil).filter(([, until]) => until > now),
      );
      return Object.keys(next).length === Object.keys(state.skippedUntil).length
        ? state
        : { skippedUntil: next };
    }),
  unskipOffer: (sessionId) =>
    set((state) => {
      if (!(sessionId in state.skippedUntil)) return state;
      const next = { ...state.skippedUntil };
      delete next[sessionId];
      return { skippedUntil: next };
    }),
  reset: () => set(INITIAL_STATE),
}));

/**
 * Текущее предложение — самый давний свободный вызов, который оператор ещё не
 * смахнул: смахнул одну карточку — сразу предлагается следующая. Весь пул,
 * включая смахнутые, виден в очереди (OperatorQueueModal).
 *
 * Занятому оператору не предлагается ничего. Сервер и так перестаёт слать ему
 * новые вызовы, но принятие происходит на клиенте раньше, чем приходит ответ,
 * и без этой проверки карточка предложения на мгновение оставалась бы поверх
 * только что принятого вызова.
 */
export const selectCurrentOffer = (state: OperatorState): EmergencySession | null => {
  if (!state.isOnShift) return null;
  const hasOpenCall = Object.values(state.activeSessionsById).some(
    (session) => session.status !== "CLOSED",
  );
  if (hasOpenCall) return null;
  const now = Date.now();
  const candidates = Object.values(state.poolById).filter(
    (session) => (state.skippedUntil[session.id] ?? 0) <= now,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, session) =>
    new Date(session.createdAt).getTime() < new Date(oldest.createdAt).getTime()
      ? session
      : oldest,
  );
};
