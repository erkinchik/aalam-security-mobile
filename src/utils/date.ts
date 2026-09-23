/**
 * «22.09.2026, 14:05» — всегда ru-RU и 24 часа. Раньше формат брался из языка
 * телефона: на английском интерфейсе посреди русского текста шли «Sep 22» и AM/PM.
 */
export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

/** Сколько прошло с момента `since`, в формате «4:07» / «1:02:31». */
export const formatElapsed = (since: string | undefined, now = Date.now()): string => {
  if (!since) return "—";
  const started = new Date(since).getTime();
  if (Number.isNaN(started)) return "—";

  const totalSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
};
