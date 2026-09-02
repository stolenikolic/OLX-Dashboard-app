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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomMs(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

async function main() {
  const admin = createJobAdminClient();
  const now = new Date();
  const dispatched: Array<{ profileId: string; job: ScheduleJob }> = [];

  const reaped = await reapStaleJobRuns(admin);
  if (reaped > 0) {
    console.log(`Zatvoreno ${reaped} zaglavljenih job_runs.`);
  }

  // Anti-detekcija: ne kreni tačno na cron tik — random pauza 0-300s prije
  // prve provjere, da dispatch-evi različitih profila ne startuju u istoj sekundi.
  const startupDelay = randomMs(0, 300_000);
  if (startupDelay > 0) {
    console.log(`Startup jitter: ${Math.round(startupDelay / 1000)}s…`);
    await sleep(startupDelay);
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
      // Anti-detekcija: stagger PRIJE svakog dispatcha osim prvog u ovom runu —
      // dva profila ne kreću istom sekundom prema OLX-u. Nema čekanja nakon
      // posljednjeg dispatcha (ne troši uzalud GHA minute).
      if (dispatched.length > 0) {
        const stagger = randomMs(45_000, 200_000);
        console.log(`Stagger pauza: ${Math.round(stagger / 1000)}s…`);
        await sleep(stagger);
      }

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
