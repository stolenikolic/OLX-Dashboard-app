import { listActiveProfiles } from "@/lib/workers/profile";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

async function main() {
  const admin = createJobAdminClient();
  let profiles = await listActiveProfiles(admin);

  const onlyId = process.env.ONLY_PROFILE_ID?.trim();
  if (onlyId) {
    profiles = profiles.filter((p) => p.id === onlyId);
  }

  const matrix = { profile: profiles };
  // GitHub Actions očekuje JSON na stdout
  console.log(`matrix=${JSON.stringify(matrix)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
