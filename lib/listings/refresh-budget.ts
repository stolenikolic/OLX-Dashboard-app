import { fnv1a } from "@/lib/workers/profile-shuffle";

function dateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function unit(seed: string): number {
  return fnv1a(seed) / 0xffffffff;
}

/**
 * Dnevni cap besplatnih bumpova — deterministički po (profil, dan).
 * Posljednja 3 dana u mjesecu: catch-up da se kvota potroši.
 */
export function dailyRefreshCap(
  profileId: string,
  now: Date,
  remaining: number,
  daysLeft: number,
): number {
  if (remaining <= 0) return 0;
  if (daysLeft <= 3) return Math.ceil(remaining / daysLeft);

  const key = dateKey(now);
  if (unit(`cap-skip:${profileId}:${key}`) < 0.1) return 0;

  const even = remaining / daysLeft;
  const mag = 0.45 + unit(`cap-mag:${profileId}:${key}`) * 1.25;
  return Math.min(remaining, Math.max(0, Math.round(even * mag)));
}
