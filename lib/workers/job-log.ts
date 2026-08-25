import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;
type JobType = Database["public"]["Enums"]["job_type"];
type JobStatus = Database["public"]["Enums"]["job_status"];
type LogLevel = "info" | "warn" | "error";

/**
 * GHA ubije proces na timeout/cancel bez da finishJobRun stigne da se izvrši,
 * pa red ostane "running" zauvijek i trajno zaključa profil. Sve iznad ovog
 * praga se tretira kao mrtvo — duže od najdužeg workflow timeouta (120 min).
 */
export const STALE_JOB_RUN_MS = 3 * 60 * 60 * 1000;

function staleRunCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - STALE_JOB_RUN_MS).toISOString();
}

export async function startJobRun(
  admin: Admin,
  input: { job: JobType; profileId?: string },
): Promise<string> {
  const { data, error } = await admin
    .from("job_runs")
    .insert({
      job: input.job,
      profile_id: input.profileId ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Kreiranje job_runs nije uspjelo: ${error?.message ?? "nepoznato"}`,
    );
  }

  return data.id;
}

export async function attachGithubRunId(
  admin: Admin,
  jobRunId: string,
  runId: number,
): Promise<void> {
  await admin
    .from("job_runs")
    .update({ github_run_id: runId })
    .eq("id", jobRunId);
}

export async function isJobCancelRequested(
  admin: Admin,
  jobRunId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("job_runs")
    .select("cancel_requested")
    .eq("id", jobRunId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Provjera cancel_requested nije uspjela: ${error.message}`,
    );
  }

  return data?.cancel_requested === true;
}

export async function requestJobCancel(
  admin: Admin,
  jobRunId: string,
): Promise<void> {
  const { error } = await admin
    .from("job_runs")
    .update({ cancel_requested: true })
    .eq("id", jobRunId)
    .eq("status", "running");

  if (error) {
    throw new Error(`Zahtjev za cancel nije uspio: ${error.message}`);
  }
}

export async function finishJobRun(
  admin: Admin,
  jobRunId: string,
  input: {
    status: JobStatus;
    items_processed?: number;
    items_succeeded?: number;
    items_failed?: number;
    summary?: string;
  },
): Promise<void> {
  await admin
    .from("job_runs")
    .update({
      status: input.status,
      finished_at: new Date().toISOString(),
      items_processed: input.items_processed ?? 0,
      items_succeeded: input.items_succeeded ?? 0,
      items_failed: input.items_failed ?? 0,
      summary: input.summary ?? null,
    })
    .eq("id", jobRunId);
}

export async function isJobRunningForProfile(
  admin: Admin,
  profileId: string,
  job: JobType,
): Promise<boolean> {
  const { data, error } = await admin
    .from("job_runs")
    .select("id")
    .eq("profile_id", profileId)
    .eq("job", job)
    .eq("status", "running")
    .gte("started_at", staleRunCutoff())
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Provjera running joba nije uspjela: ${error.message}`);
  }
  return data != null;
}

export async function getProfileIdsWithRunningPostJob(
  admin: Admin,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("job_runs")
    .select("profile_id")
    .eq("job", "post_listings")
    .eq("status", "running")
    .gte("started_at", staleRunCutoff())
    .not("profile_id", "is", null);

  if (error) {
    throw new Error(
      `Lista aktivnih post jobova nije uspjela: ${error.message}`,
    );
  }

  return new Set(
    (data ?? [])
      .map((row) => row.profile_id)
      .filter((id): id is string => id != null),
  );
}

/**
 * Zatvara redove koje je ubijen proces ostavio u "running". Bez ovoga jedan
 * timeout trajno blokira profil, jer running provjere nemaju drugi izlaz.
 */
export async function reapStaleJobRuns(admin: Admin): Promise<number> {
  const { data, error } = await admin
    .from("job_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      summary: "Prekinut bez završetka (timeout/cancel); zatvoreno automatski.",
    })
    .eq("status", "running")
    .lt("started_at", staleRunCutoff())
    .select("id");

  if (error) {
    throw new Error(
      `Zatvaranje zaglavljenih job_runs nije uspjelo: ${error.message}`,
    );
  }

  return data?.length ?? 0;
}

export async function appendJobLog(
  admin: Admin,
  jobRunId: string,
  input: {
    level: LogLevel;
    message: string;
    context?: Json;
  },
): Promise<void> {
  await admin.from("job_logs").insert({
    job_run_id: jobRunId,
    level: input.level,
    message: input.message,
    context: input.context ?? null,
  });
}
