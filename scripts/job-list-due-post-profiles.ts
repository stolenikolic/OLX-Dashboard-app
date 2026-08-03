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
    // Ručni workflow_dispatch — bypass schedule; job toggle = skip (ne fail).
    const statusActive = await listActiveProfiles(admin);
    const target = statusActive.find((p) => p.id === onlyId);

    if (!target) {
      throw new Error(
        `Nema aktivnog profila s id=${onlyId} (provjeri da nije pauziran/suspendovan).`,
      );
    }

    const { data } = await admin
      .from("profiles")
      .select("jobs_enabled")
      .eq("id", onlyId)
      .maybeSingle();

    if (!isJobEnabledForProfile(data ?? {}, "post_listings")) {
      await recordJobSkipped(admin, {
        job: "post_listings",
        profileId: target.id,
        profileName: target.name,
      });
      console.log(
        `${JOB_TOGGLE_LABELS.post_listings} je pauzirano za profil "${target.name}". Preskačem.`,
      );
      profiles = [];
    } else {
      profiles = [target];
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
          `${JOB_TOGGLE_LABELS.post_listings} je pauzirano za profil "${p.name}". Preskačem.`,
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
