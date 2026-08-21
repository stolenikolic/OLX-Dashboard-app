import { fnv1a } from "@/lib/workers/profile-shuffle";

export const POST_SCHEDULE_TZ = "Europe/Sarajevo";
export const POST_SCHEDULE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Slotovi 08:00–19:40, korak 20 min. */
export const SLOT_START_MINUTES = 8 * 60;
export const SLOT_END_MINUTES = 20 * 60;
export const SLOT_STEP_MINUTES = 20;
export const SLOT_COUNT =
  (SLOT_END_MINUTES - SLOT_START_MINUTES) / SLOT_STEP_MINUTES; // 36

export type PostScheduleFields = {
  post_schedule_time: string | null;
  posting_window_started_at: string | null;
};

type SarajevoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getSarajevoParts(date: Date): SarajevoParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: POST_SCHEDULE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);

  return {
    year: n("year"),
    month: n("month"),
    day: n("day"),
    hour: n("hour"),
    minute: n("minute"),
    second: n("second"),
  };
}

/** Pretvara zidno vrijeme u Europe/Sarajevo u UTC Date. */
export function sarajevoLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const p = getSarajevoParts(new Date(guess));
    const asUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

/** Parsira Postgres `time` / HTML `HH:MM` u sate i minute. */
export function parseScheduleTime(value: string): {
  hour: number;
  minute: number;
} {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) {
    throw new Error(`Neispravno vrijeme rasporeda: ${value}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Neispravno vrijeme rasporeda: ${value}`);
  }
  return { hour, minute };
}

export function formatScheduleTime(value: string | null): string | null {
  if (!value) return null;
  const { hour, minute } = parseScheduleTime(value);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/** Današnji (Sarajevo) termin kao UTC instant. */
export function scheduleTodayAt(
  scheduleTime: string,
  now: Date = new Date(),
): Date {
  const { hour, minute } = parseScheduleTime(scheduleTime);
  const p = getSarajevoParts(now);
  return sarajevoLocalToUtc(p.year, p.month, p.day, hour, minute);
}

export function getWindowEndAt(
  postingWindowStartedAt: string | null,
): Date | null {
  if (!postingWindowStartedAt) return null;
  return new Date(
    new Date(postingWindowStartedAt).getTime() + POST_SCHEDULE_WINDOW_MS,
  );
}

/**
 * next_eligible = max(danas_u_post_schedule_time + jitter, window_start + 24h).
 * Ako nema schedule → null (nije due dok se ne postavi).
 * Preskočeni dani se pomjeraju na sljedeći ne-skip dan.
 */
export function getNextEligibleAt(
  profile: PostScheduleFields & { id?: string },
  now: Date = new Date(),
): Date | null {
  if (!profile.post_schedule_time) return null;

  let day = now;
  if (profile.id) {
    for (let i = 0; i < 20; i++) {
      if (!shouldSkipPostingDay(profile.id, day)) break;
      day = new Date(day.getTime() + 86_400_000);
    }
  }

  const scheduled = scheduleTodayAt(profile.post_schedule_time, day);
  const jitterMs = profile.id
    ? (fnv1a(
        `post-jitter:${profile.id}:${sarajevoTodayDateString(day)}`,
      ) %
        1140) *
      1000
    : 0;
  const jittered = new Date(scheduled.getTime() + jitterMs);
  const windowEnd = getWindowEndAt(profile.posting_window_started_at);
  if (!windowEnd) return jittered;
  return new Date(Math.max(jittered.getTime(), windowEnd.getTime()));
}

export const SKIP_POSTING_DAY_PCT = 12;

/** Deterministički ~12% dana (Sarajevo kalendar). */
export function shouldSkipPostingDay(
  profileId: string,
  date: Date = new Date(),
): boolean {
  const key = `skip-post:${profileId}:${sarajevoTodayDateString(date)}`;
  return fnv1a(key) % 100 < SKIP_POSTING_DAY_PCT;
}

export function isPostingWindowOpen(
  postingWindowStartedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!postingWindowStartedAt) return false;
  const end = getWindowEndAt(postingWindowStartedAt);
  return end != null && now < end;
}

/** YYYY-MM-DD u Europe/Sarajevo. */
export function sarajevoTodayDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: POST_SCHEDULE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function slotToTime(slotIndex: number): string {
  const minutes =
    SLOT_START_MINUTES + (slotIndex % SLOT_COUNT) * SLOT_STEP_MINUTES;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function timeToSlotMinutes(value: string): number {
  const { hour, minute } = parseScheduleTime(value);
  return minutesOfDay(hour, minute);
}

export function slotsConflict(a: number, b: number): boolean {
  return a === b;
}
