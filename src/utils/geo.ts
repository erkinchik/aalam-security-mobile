type Point = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Расстояние по прямой (гаверсинус). Для «ехать ли» точнее не нужно. */
export const distanceMeters = (a: Point, b: Point): number => {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

export const formatDistance = (meters: number): string =>
  meters < 1000
    ? `${Math.round(meters / 10) * 10} м`
    : `${(meters / 1000).toFixed(1).replace(".", ",")} км`;

/** «12 с», «3 мин», «2 ч» — сколько прошло с отметки. */
export const formatAgo = (iso: string, now = Date.now()): string | null => {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.round(minutes / 60)} ч`;
};
