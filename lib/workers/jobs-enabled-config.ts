import type { Database, Json } from "@/types/database";

type JobType = Database["public"]["Enums"]["job_type"];

export type ProfileToggleJob =
  | "post_listings"
  | "refresh_prices"
  | "sync_stock"
  | "refresh_listings"
  | "sync_conversations"
  | "sync_messages";

export type JobsEnabledMap = Record<ProfileToggleJob, boolean>;

export const PROFILE_TOGGLE_JOBS: readonly ProfileToggleJob[] = [
  "post_listings",
  "refresh_prices",
  "sync_stock",
  "refresh_listings",
  "sync_conversations",
  "sync_messages",
] as const;

export const DEFAULT_JOBS_ENABLED: JobsEnabledMap = {
  post_listings: true,
  refresh_prices: true,
  sync_stock: true,
  refresh_listings: true,
  sync_conversations: true,
  sync_messages: true,
};

/** Novi profili: postavljanje isključeno dok admin ne uključi. */
export const NEW_PROFILE_JOBS_ENABLED: JobsEnabledMap = {
  ...DEFAULT_JOBS_ENABLED,
  post_listings: false,
};

export const JOB_TOGGLE_LABELS: Record<ProfileToggleJob, string> = {
  post_listings: "Postavljanje",
  refresh_prices: "Cijene",
  sync_stock: "Zalihe",
  refresh_listings: "Obnavljanje oglasa",
  sync_conversations: "Upiti (chat)",
  sync_messages: "Poruke (chat)",
};

export const JOB_TOGGLE_SHORT_LABELS: Record<ProfileToggleJob, string> = {
  post_listings: "Post",
  refresh_prices: "Cijene",
  sync_stock: "Zalihe",
  refresh_listings: "Bump",
  sync_conversations: "Upiti",
  sync_messages: "Poruke",
};

export function isProfileToggleJob(job: string): job is ProfileToggleJob {
  return (PROFILE_TOGGLE_JOBS as readonly string[]).includes(job);
}

export function parseJobsEnabled(json: Json | null | undefined): JobsEnabledMap {
  const result: JobsEnabledMap = { ...DEFAULT_JOBS_ENABLED };
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return result;
  }
  const obj = json as Record<string, unknown>;
  for (const key of PROFILE_TOGGLE_JOBS) {
    if (typeof obj[key] === "boolean") {
      result[key] = obj[key];
    }
  }
  return result;
}

export function isJobEnabledForProfile(
  profile: { jobs_enabled?: Json | null },
  job: JobType,
): boolean {
  if (!isProfileToggleJob(job)) return true;
  return parseJobsEnabled(profile.jobs_enabled ?? null)[job];
}

export class JobDisabledError extends Error {
  readonly job: JobType;
  readonly profileName: string;

  constructor(profileName: string, job: JobType) {
    const label = isProfileToggleJob(job)
      ? JOB_TOGGLE_LABELS[job]
      : job;
    super(
      `Posao "${label}" je isključen za profil "${profileName}".`,
    );
    this.name = "JobDisabledError";
    this.job = job;
    this.profileName = profileName;
  }
}

export function isJobDisabledError(err: unknown): err is JobDisabledError {
  return err instanceof JobDisabledError;
}

/** Merge UI/form values into existing jobs_enabled JSON. */
export function mergeJobsEnabled(
  existing: Json | null | undefined,
  patch: Partial<JobsEnabledMap>,
): JobsEnabledMap {
  const base = parseJobsEnabled(existing);
  for (const key of PROFILE_TOGGLE_JOBS) {
    if (typeof patch[key] === "boolean") {
      base[key] = patch[key]!;
    }
  }
  return base;
}
