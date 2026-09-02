import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

export type PacingJob =
  | "post_listings"
  | "refresh_prices"
  | "sync_stock"
  | "refresh_listings"
  | "sync_conversations"
  | "sync_messages"
  | "delete_unmapped"
  | "import_listings";

export type PacingRange = { min_ms: number; max_ms: number };

export type JobPacing = Record<PacingJob, PacingRange>;

export const PACING_JOBS: readonly PacingJob[] = [
  "post_listings",
  "refresh_prices",
  "sync_stock",
  "refresh_listings",
  "sync_conversations",
  "sync_messages",
  "delete_unmapped",
  "import_listings",
] as const;

export const PACING_LABELS: Record<PacingJob, string> = {
  post_listings: "Postavljanje oglasa",
  refresh_prices: "Obnova cijena",
  sync_stock: "Zalihe",
  refresh_listings: "Bump oglasa",
  sync_conversations: "Sinhronizacija upita",
  sync_messages: "Sinhronizacija poruka",
  delete_unmapped: "Brisanje nemapiranih",
  import_listings: "Uvoz vlastitih oglasa",
};

const DEFAULTS: JobPacing = {
  post_listings: { min_ms: 500, max_ms: 900 },
  refresh_prices: { min_ms: 200, max_ms: 500 },
  sync_stock: { min_ms: 200, max_ms: 500 },
  refresh_listings: { min_ms: 200, max_ms: 500 },
  sync_conversations: { min_ms: 300, max_ms: 800 },
  sync_messages: { min_ms: 250, max_ms: 700 },
  delete_unmapped: { min_ms: 800, max_ms: 2200 },
  import_listings: { min_ms: 150, max_ms: 400 },
};

const BAND: Record<PacingJob, { min: number; max: number }> = {
  post_listings: { min: 300, max: 3000 },
  refresh_prices: { min: 100, max: 800 },
  sync_stock: { min: 100, max: 800 },
  refresh_listings: { min: 100, max: 800 },
  sync_conversations: { min: 150, max: 1500 },
  sync_messages: { min: 150, max: 1500 },
  delete_unmapped: { min: 400, max: 3500 },
  import_listings: { min: 80, max: 900 },
};

function isRange(value: unknown): value is PacingRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return typeof o.min_ms === "number" && typeof o.max_ms === "number";
}

export function parseJobPacing(json: Json | null | undefined): JobPacing | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  const result = { ...DEFAULTS };
  let any = false;
  for (const job of PACING_JOBS) {
    if (isRange(obj[job])) {
      result[job] = {
        min_ms: Math.round(obj[job].min_ms),
        max_ms: Math.round(obj[job].max_ms),
      };
      any = true;
    }
  }
  return any ? result : null;
}

function validateRange(range: PacingRange): PacingRange | null {
  const min = Math.round(range.min_ms);
  const max = Math.round(range.max_ms);
  if (min < 50 || max <= min || max > 10_000) return null;
  return { min_ms: min, max_ms: max };
}

export function getPacing(
  profile: { job_pacing?: Json | null },
  job: PacingJob,
): { minMs: number; maxMs: number } {
  const parsed = parseJobPacing(profile.job_pacing ?? null);
  const raw = parsed?.[job] ?? DEFAULTS[job];
  const valid = validateRange(raw) ?? DEFAULTS[job];
  return { minMs: valid.min_ms, maxMs: valid.max_ms };
}

/**
 * Kao getPacing(), ali za pozivaoce koji nemaju puni profil objekat u
 * scope-u (npr. import/uvoz funkcije koje dobijaju samo profileId) —
 * radi jedan lagan DB upit samo za job_pacing kolonu.
 */
export async function loadPacingForProfile(
  admin: SupabaseClient<Database>,
  profileId: string,
  job: PacingJob,
): Promise<{ minMs: number; maxMs: number }> {
  const { data } = await admin
    .from("profiles")
    .select("job_pacing")
    .eq("id", profileId)
    .maybeSingle();
  return getPacing({ job_pacing: data?.job_pacing ?? null }, job);
}

function generateRange(
  bandMin: number,
  bandMax: number,
  existingCenters: number[],
): PacingRange {
  const bandWidth = bandMax - bandMin;
  const minSep = bandWidth * 0.15;

  for (let attempt = 0; attempt < 60; attempt++) {
    const widthRatio = 0.3 + Math.random() * 0.3;
    const width = Math.max(50, Math.round(bandWidth * widthRatio));
    const start =
      bandMin + Math.floor(Math.random() * Math.max(1, bandWidth - width + 1));
    const min_ms = start;
    const max_ms = Math.min(bandMax, start + width);
    const center = (min_ms + max_ms) / 2;
    const tooClose = existingCenters.some((c) => Math.abs(c - center) < minSep);
    if (!tooClose) return { min_ms, max_ms };
  }

  return {
    min_ms: bandMin,
    max_ms: Math.min(bandMax, bandMin + Math.round(bandWidth * 0.4)),
  };
}

export function generatePacingForNewProfile(
  existingPacings: Array<JobPacing | null | undefined>,
): JobPacing {
  const result = { ...DEFAULTS };

  for (const job of PACING_JOBS) {
    const band = BAND[job];
    const centers = existingPacings
      .map((p) => p?.[job])
      .filter((r): r is PacingRange => r != null)
      .map((r) => (r.min_ms + r.max_ms) / 2);
    result[job] = generateRange(band.min, band.max, centers);
  }

  return result;
}
