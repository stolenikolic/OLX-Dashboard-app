import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;
type JobType = Database["public"]["Enums"]["job_type"];
type JobStatus = Database["public"]["Enums"]["job_status"];
type LogLevel = "info" | "warn" | "error";

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
