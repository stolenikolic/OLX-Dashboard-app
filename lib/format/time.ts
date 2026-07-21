/** Deterministički format datuma — bez toLocale* (izbjegava SSR hydration mismatch). */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** dd.MM.yyyy. */
export function formatDateFixed(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return "";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}.`;
}

/** dd.MM.yyyy. HH:mm — za title/tooltip. */
export function formatExactTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return "";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Relativno vrijeme. Koristi Date.now() — na SSR može malo odstupati od klijenta;
 * komponente trebaju suppressHydrationWarning na elementu koji ovo prikazuje.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  if (!date) return "";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "upravo";
  const min = Math.round(sec / 60);
  if (min < 60) return `prije ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `prije ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "juče";
  if (days < 7) return `prije ${days} d`;

  return formatDateFixed(iso);
}

export function formatDateSeparator(iso: string): string {
  const date = parseDate(iso);
  if (!date) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Danas";
  if (sameDay(date, yesterday)) return "Juče";
  return formatDateFixed(iso);
}

export function dayKey(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
