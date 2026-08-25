import "./_olx-guard";

import { dispatchGitHubWorkflow } from "@/lib/github/dispatch";
import { createJobAdminClient } from "@/lib/supabase/job-admin";
import { isJobRunningForProfile, reapStaleJobRuns } from "@/lib/workers/job-log";
import {
  SCHEDULE_JOBS,
  SCHEDULE_TO_WORKFLOW,
  getNextRunAt,
  type ScheduleJob,
} from "@/lib/workers/job-schedule";
import { listActiveProfiles } from "@/lib/workers/profile";

async function main() {
  const admin = createJobAdminClient();
  const now = new Date();
  const dispatched: Array<{ profileId: string; job: ScheduleJob }> = [];

  const reaped = await reapStaleJobRuns(admin);
  if (reaped > 0) {
    console.log(`Zatvoreno ${reaped} zaglavljenih job_runs.`);
  }

  for (const job of SCHEDULE_JOBS) {
    const profiles = await listActiveProfiles(admin, { job });
    if (profiles.length === 0) continue;

    const { data, error } = await admin
      .from("profiles")
      .select("id, job_schedule")
      .in(
        "id",
        profiles.map((p) => p.id),
      );

    if (error) {
      throw new Error(`Čitanje job_schedule nije uspjelo: ${error.message}`);
    }

    for (const row of data ?? []) {
      const next = getNextRunAt(row, job);
      const due = next == null || next.getTime() <= now.getTime();
      if (!due) continue;

      if (await isJobRunningForProfile(admin, row.id, job)) {
        console.log(`Preskačem ${job} ${row.id}: već running.`);
        continue;
      }

      const workflow = SCHEDULE_TO_WORKFLOW[job];
      const inputs: Record<string, string> = { profile_id: row.id };
      if (job === "refresh_prices") inputs.force = "true";
      const result = await dispatchGitHubWorkflow(workflow, inputs);
      if (!result.ok) {
        console.error(`Dispatch ${workflow} ${row.id}: ${result.message}`);
        continue;
      }
      dispatched.push({ profileId: row.id, job });
      console.log(`Dispatch ${workflow} za ${row.id}`);
    }
  }

  console.log(`Dispatched ${dispatched.length} jobova.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
