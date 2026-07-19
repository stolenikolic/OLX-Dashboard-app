import { appendFileSync } from "fs";

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
  let profiles = await listActiveProfiles(admin);

  const onlyId = process.env.ONLY_PROFILE_ID?.trim();
  if (onlyId) {
    profiles = profiles.filter((p) => p.id === onlyId);
    if (profiles.length === 0) {
      throw new Error(
        `Nema aktivnog profila s id=${onlyId} (provjeri da nije pauziran/suspendovan).`,
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
