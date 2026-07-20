/** Relativno vrijeme (bs) + tačan title. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

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

  return date.toLocaleDateString("bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatExactTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateSeparator(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Danas";
  if (sameDay(date, yesterday)) return "Juče";
  return date.toLocaleDateString("bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function dayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
