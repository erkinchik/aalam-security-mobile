import type { EmergencySession } from "../types/emergency";
import { ru } from "../locale/ru";

/** Куда ехать: последняя живая точка заявителя, иначе координаты филиала. */
export const sessionCoords = (
  session: EmergencySession,
): { latitude: number; longitude: number } | null => {
  const last = session.locations?.[session.locations.length - 1];
  if (last) return { latitude: last.latitude, longitude: last.longitude };
  const venue = session.venue;
  if (venue?.latitude != null && venue?.longitude != null) {
    return { latitude: venue.latitude, longitude: venue.longitude };
  }
  return null;
};

/**
 * Как попасть внутрь: подъезд, этаж, квартира, домофон и произвольная заметка.
 * Нужны и в предложении, и на принятом вызове — оператор читает их уже в пути.
 */
export const venueEntry = (session: EmergencySession) => {
  const venue = session.venue;
  if (!venue) return null;
  const details = [
    venue.entrance && `${ru.operatorPool.entrance} ${venue.entrance}`,
    venue.floor && `${ru.operatorPool.floor} ${venue.floor}`,
    venue.apartment && `${ru.operatorPool.apartment} ${venue.apartment}`,
    venue.doorCode && `${ru.operatorPool.doorCode} ${venue.doorCode}`,
  ].filter(Boolean);
  return {
    title: venue.name ?? venue.address ?? "",
    address: venue.address ?? null,
    details: details.join(" · "),
    notes: venue.addressNotes ?? null,
  };
};

export const sessionCaller = (session: EmergencySession) =>
  session.user?.displayName || session.user?.email || ru.operatorScreens.unknownUser;
