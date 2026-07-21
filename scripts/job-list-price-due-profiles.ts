import { appendFileSync } from "fs";

import { listPriceDueProfiles } from "@/lib/listings/list-price-due-profiles";
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
  const force =
    process.env.FORCE === "true" || process.env.FORCE === "1";

  const profiles = await listPriceDueProfiles(admin, {
    onlyProfileId: process.env.ONLY_PROFILE_ID,
    force,
  });

  const onlyId = process.env.ONLY_PROFILE_ID?.trim();
  if (onlyId && profiles.length === 0) {
    throw new Error(
      `Nema profila za refresh s id=${onlyId} (provjeri status / force flag).`,
    );
  }

  const hasCompetitorMode = profiles.some(
    (p) => p.price_mode === "competitor_minus_1",
  );

  const matrix = { profile: profiles.map(({ id, name }) => ({ id, name })) };
  writeGithubOutput([
    `has_profiles=${profiles.length > 0}`,
    `has_competitor_mode=${hasCompetitorMode}`,
    `matrix=${JSON.stringify(matrix)}`,
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
