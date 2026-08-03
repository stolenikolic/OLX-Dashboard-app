import { appendFileSync } from "fs";

import {
  isProfileToggleJob,
  JOB_TOGGLE_LABELS,
  type ProfileToggleJob,
} from "@/lib/workers/jobs-enabled-config";
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
  let profiles = await listActiveProfiles(admin, job ? { job } : undefined);

  const onlyId = process.env.ONLY_PROFILE_ID?.trim();
  if (onlyId) {
    profiles = profiles.filter((p) => p.id === onlyId);
    if (profiles.length === 0) {
      const label = job ? JOB_TOGGLE_LABELS[job] : "posao";
      throw new Error(
        `Nema aktivnog profila s id=${onlyId}` +
          (job
            ? ` (provjeri status ili da je "${label}" uključen za profil).`
            : " (provjeri da nije pauziran/suspendovan)."),
      );
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
