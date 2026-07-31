import { appendFileSync } from "fs";

import { listDuePostProfiles } from "@/lib/listings/post-schedule";
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
    // Ručni workflow_dispatch — bypass schedule filter.
    profiles = (await listActiveProfiles(admin)).filter((p) => p.id === onlyId);
    if (profiles.length === 0) {
      throw new Error(
        `Nema aktivnog profila s id=${onlyId} (provjeri da nije pauziran/suspendovan).`,
      );
    }
  } else {
    profiles = await listDuePostProfiles(admin);
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
