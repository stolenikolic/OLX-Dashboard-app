import { listPriceDueProfiles } from "@/lib/listings/list-price-due-profiles";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

async function main() {
  const admin = createJobAdminClient();
  const force =
    process.env.FORCE === "true" || process.env.FORCE === "1";

  const profiles = await listPriceDueProfiles(admin, {
    onlyProfileId: process.env.ONLY_PROFILE_ID,
    force,
  });

  const matrix = { profile: profiles };
  console.log(`matrix=${JSON.stringify(matrix)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
