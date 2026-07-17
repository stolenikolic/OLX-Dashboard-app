import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import {
  runStockSyncJob,
  runStockSyncWorker,
} from "@/lib/listings/stock-sync";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

async function main() {
  const admin = createJobAdminClient();

  let profileId = process.env.PROFILE_ID?.trim();
  if (!profileId && process.env.OLX_USERNAME) {
    profileId = await ensureTechZoneProfile(admin);
  }

  if (!profileId) {
    throw new Error("PROFILE_ID nije postavljen.");
  }

  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    const stats = await runStockSyncWorker(admin, { profileId, dryRun: true });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runStockSyncJob(admin, profileId);
  console.log(
    `Završeno: sakriveno=${stats.hidden}, vraćeno=${stats.unhidden}, greške=${stats.failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
