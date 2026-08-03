import { appendFileSync } from "fs";

import { listDuePostProfiles } from "@/lib/listings/post-schedule";
import {
  isJobEnabledForProfile,
  JOB_TOGGLE_LABELS,
  recordJobSkipped,
} from "@/lib/workers/jobs-enabled";
import { listActiveProfiles } from "@/lib/workers/profile";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

function writeGithubOutput(lines: string[]) {
  for (const line of lines) {
    console.log(line);
  }
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(out, `${lines.join("\n")}\n`);
  }
}

async function main() {
  const admin = createJobAdminClient();

  const onlyId = process.env.ONLY_PROFILE_ID?.trim();
  let profiles: Array<{ id: string; name: string }>;

  if (onlyId) {
    // Ručni workflow_dispatch — bypass schedule filter, ali poštuje job toggle.
    profiles = (await listActiveProfiles(admin, { job: "post_listings" })).filter(
      (p) => p.id === onlyId,
    );
    if (profiles.length === 0) {
      throw new Error(
        `Nema aktivnog profila s id=${onlyId} (provjeri status ili da je "${JOB_TOGGLE_LABELS.post_listings}" uključen).`,
      );
    }
  } else {
    // Due po rasporedu među status-aktivnim, pa filtriraj job toggle + log skip.
    const dueAll = await listDuePostProfiles(admin, new Date(), {
      ignoreJobToggle: true,
    });

    profiles = [];
    for (const p of dueAll) {
      const { data } = await admin
        .from("profiles")
        .select("jobs_enabled")
        .eq("id", p.id)
        .maybeSingle();

      if (isJobEnabledForProfile(data ?? {}, "post_listings")) {
        profiles.push(p);
      } else {
        await recordJobSkipped(admin, {
          job: "post_listings",
          profileId: p.id,
          profileName: p.name,
        });
        console.log(
          `Preskočen ${p.name}: ${JOB_TOGGLE_LABELS.post_listings} isključen.`,
        );
      }
    }
  }

  const matrix = { profile: profiles };
  writeGithubOutput([
    `has_profiles=${profiles.length > 0}`,
    `matrix=${JSON.stringify(matrix)}`,
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
