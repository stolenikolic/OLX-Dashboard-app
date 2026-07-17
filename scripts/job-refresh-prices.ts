import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import {
  runRefreshPricesJob,
  runRefreshPricesWorker,
} from "@/lib/listings/refresh-prices";
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
  const force = process.argv.includes("--force");

  if (dryRun) {
    const stats = await runRefreshPricesWorker(admin, {
      profileId,
      dryRun: true,
      maxUpdates: force ? undefined : 10,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runRefreshPricesJob(admin, profileId);
  console.log(
    `Završeno: ažurirano=${stats.updated}, isto=${stats.unchanged}, preskočeno=${stats.skipped}, greške=${stats.failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
