import { appendFileSync } from "fs";

import {
  isJobEnabledForProfile,
  isProfileToggleJob,
  JOB_TOGGLE_LABELS,
  recordJobSkipped,
  type ProfileToggleJob,
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

function resolveJobType(): ProfileToggleJob | undefined {
  const raw = process.env.JOB_TYPE?.trim();
  if (!raw) return undefined;
  if (!isProfileToggleJob(raw)) {
    throw new Error(
      `JOB_TYPE=${raw} nije validan per-profile posao (očekivano: ${Object.keys(JOB_TOGGLE_LABELS).join(", ")}).`,
    );
  }
  return raw;
}

async function main() {
  const admin = createJobAdminClient();
  const job = resolveJobType();
  const onlyId = process.env.ONLY_PROFILE_ID?.trim();

  let profiles: Array<{ id: string; name: string }>;

  if (onlyId) {
    // Status-aktivni bez job filtera — razlikuj "ne postoji" od "posao pauziran".
    const statusActive = await listActiveProfiles(admin);
    const target = statusActive.find((p) => p.id === onlyId);

    if (!target) {
      throw new Error(
        `Nema aktivnog profila s id=${onlyId} (provjeri da nije pauziran/suspendovan).`,
      );
    }

    if (job) {
      const { data } = await admin
        .from("profiles")
        .select("jobs_enabled")
        .eq("id", onlyId)
        .maybeSingle();

      if (!isJobEnabledForProfile(data ?? {}, job)) {
        await recordJobSkipped(admin, {
          job,
          profileId: target.id,
          profileName: target.name,
        });
        console.log(
          `${JOB_TOGGLE_LABELS[job]} je pauzirano za profil "${target.name}". Preskačem.`,
        );
        profiles = [];
      } else {
        profiles = [target];
      }
    } else {
      profiles = [target];
    }
  } else {
    profiles = await listActiveProfiles(admin, job ? { job } : undefined);
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
