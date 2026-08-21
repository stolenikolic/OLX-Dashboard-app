import "./_olx-guard";

import { createJobAdminClient } from "@/lib/supabase/job-admin";
import {
  parseManualAction,
  runManualActionJob,
} from "@/lib/listings/manual-action";

async function main() {
  const profileId = process.env.PROFILE_ID?.trim();
  if (!profileId) {
    throw new Error("PROFILE_ID nije postavljen.");
  }

  const action = parseManualAction(process.env.MANUAL_ACTION);
  const listingId = process.env.LISTING_ID?.trim() || undefined;
  const allowPaid =
    process.env.ALLOW_PAID === "true" || process.env.ALLOW_PAID === "1";

  const admin = createJobAdminClient();
  const result = await runManualActionJob(admin, {
    profileId,
    action,
    listingId,
    allowPaid,
  });
  console.log(result.summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
