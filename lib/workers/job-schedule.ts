import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type ScheduleJob =
  | "refresh_prices"
  | "refresh_listings"
  | "sync_stock"
  | "sync_conversations"
  | "sync_messages";

export type JobScheduleEntry = {
  interval_days: number;
  next_run_at: string | null;
};

export type JobSchedule = Partial<Record<ScheduleJob, JobScheduleEntry>>;

export const SCHEDULE_JOBS: readonly ScheduleJob[] = [
  "refresh_prices",
  "refresh_listings",
  "sync_stock",
  "sync_messages",
] as const;

export const SCHEDULE_TO_WORKFLOW: Record<
  ScheduleJob,
  | "refresh-prices"
  | "refresh-listings"
  | "sync-stock"
  | "sync-conversations"
  | "sync-messages"
> = {
  refresh_prices: "refresh-prices",
  refresh_listings: "refresh-listings",
  sync_stock: "sync-stock",
  sync_conversations: "sync-conversations",
  sync_messages: "sync-messages",
};

const DEFAULT_INTERVAL: Record<ScheduleJob, number> = {
  refresh_prices: 7,
  refresh_listings: 2,
  sync_stock: 1,
  sync_conversations: 1,
  sync_messages: 1,
};

function isEntry(value: unknown): value is JobScheduleEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return typeof o.interval_days === "number";
}

export function parseJobSchedule(json: Json | null | undefined): JobSchedule {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const obj = json as Record<string, unknown>;
  const result: JobSchedule = {};
  for (const job of SCHEDULE_JOBS) {
    if (isEntry(obj[job])) {
      result[job] = {
        interval_days: Math.max(1, Math.round(obj[job].interval_days)),
        next_run_at:
          typeof obj[job].next_run_at === "string" ? obj[job].next_run_at : null,
      };
    }
  }
  return result;
}

export function getNextRunAt(
  profile: { job_schedule?: Json | null },
  job: ScheduleJob,
): Date | null {
  const entry = parseJobSchedule(profile.job_schedule ?? null)[job];
  if (!entry?.next_run_at) return null;
  const d = new Date(entry.next_run_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

function randomTimeOfDay(base: Date): Date {
  const d = new Date(base);
  d.setUTCHours(
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
    0,
  );
  return d;
}

export function computeNextRunAt(input: {
  job: ScheduleJob;
  intervalDays: number;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();
  let days = Math.max(1, Math.round(input.intervalDays));
  const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  days = Math.max(1, days + jitter);
  if (input.job === "refresh_prices") {
    days = Math.min(30, days);
  }
  const target = new Date(now.getTime() + days * 86_400_000);
  return randomTimeOfDay(target);
}

export async function scheduleNextRun(
  admin: Admin,
  profile: {
    id: string;
    job_schedule?: Json | null;
    price_refresh_days?: number | null;
  },
  job: ScheduleJob,
  now: Date = new Date(),
  options?: { overrideIntervalDays?: number },
): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("job_schedule, price_refresh_days")
    .eq("id", profile.id)
    .single();

  if (error) {
    throw new Error(`Čitanje job_schedule nije uspjelo: ${error.message}`);
  }

  const current = parseJobSchedule(data?.job_schedule ?? null);
  const intervalDays =
    job === "refresh_prices"
      ? Number(data?.price_refresh_days ?? profile.price_refresh_days ?? 7)
      : (current[job]?.interval_days ?? DEFAULT_INTERVAL[job]);

  // Override pomjera samo ovaj termin; konfigurisani interval ostaje netaknut.
  const next = computeNextRunAt({
    job,
    intervalDays: options?.overrideIntervalDays ?? intervalDays,
    now,
  });
  const nextIso = next.toISOString();

  current[job] = {
    interval_days: intervalDays,
    next_run_at: nextIso,
  };

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      job_schedule: current as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (updateError) {
    throw new Error(`Upis job_schedule nije uspio: ${updateError.message}`);
  }

  profile.job_schedule = current as unknown as Json;
  console.log(
    `Sljedeći ${job} za profil ${profile.id}: ${nextIso} (interval ${intervalDays}d)`,
  );
  return nextIso;
}

export function generateScheduleForNewProfile(now: Date = new Date()): JobSchedule {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const stockDays = 1 + Math.floor(Math.random() * 2); // 1–2
  const refreshDays = 1 + Math.floor(Math.random() * 3); // 1–3

  return {
    refresh_prices: {
      interval_days: 7,
      next_run_at: randomTimeOfDay(tomorrow).toISOString(),
    },
    refresh_listings: {
      interval_days: refreshDays,
      next_run_at: randomTimeOfDay(tomorrow).toISOString(),
    },
    sync_stock: {
      interval_days: stockDays,
      next_run_at: randomTimeOfDay(tomorrow).toISOString(),
    },
    sync_messages: {
      interval_days: 1,
      next_run_at: randomTimeOfDay(tomorrow).toISOString(),
    },
  };
}
