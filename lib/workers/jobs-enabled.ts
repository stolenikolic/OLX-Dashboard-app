import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkflowName } from "@/lib/github/dispatch";
import {
  isJobEnabledForProfile,
  isProfileToggleJob,
  JOB_TOGGLE_LABELS,
  JobDisabledError,
} from "@/lib/workers/jobs-enabled-config";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Database } from "@/types/database";

export * from "@/lib/workers/jobs-enabled-config";

type Admin = SupabaseClient<Database>;
type JobType = Database["public"]["Enums"]["job_type"];

export const WORKFLOW_TO_JOB: Record<WorkflowName, JobType | null> = {
  "sync-feed": null,
  "post-listings": "post_listings",
  "refresh-prices": "refresh_prices",
  "sync-stock": "sync_stock",
  "delete-unmapped": null,
  "sync-conversations": "sync_conversations",
  "refresh-listings": "refresh_listings",
  "sync-messages": "sync_messages",
  "manual-action": "manual_action",
};

export async function assertJobEnabledForProfile(
  admin: Admin,
  profileId: string,
  job: JobType,
): Promise<void> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, jobs_enabled")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(`Profil ${profileId} nije pronađen.`);
  }

  if (!isJobEnabledForProfile(data, job)) {
    throw new JobDisabledError(data.name, job);
  }
}

export async function recordJobSkipped(
  admin: Admin,
  input: {
    job: JobType;
    profileId: string;
    profileName?: string;
  },
): Promise<void> {
  const label = isProfileToggleJob(input.job)
    ? JOB_TOGGLE_LABELS[input.job]
    : input.job;
  const namePart = input.profileName ? ` "${input.profileName}"` : "";
  const summary = `Posao isključen za profil${namePart}.`;

  const jobRunId = await startJobRun(admin, {
    job: input.job,
    profileId: input.profileId,
  });

  await finishJobRun(admin, jobRunId, {
    status: "success",
    items_processed: 0,
    items_succeeded: 0,
    items_failed: 0,
    summary,
  });

  await appendJobLog(admin, jobRunId, {
    level: "info",
    message: "Posao isključen za profil",
    context: {
      job: input.job,
      job_label: label,
      profile_id: input.profileId,
      profile_name: input.profileName ?? null,
    },
  });
}
