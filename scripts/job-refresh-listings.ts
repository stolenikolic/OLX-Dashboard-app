import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import {
  runRefreshListingsJob,
  runRefreshListingsWorker,
} from "@/lib/listings/refresh-listings";
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
    const stats = await runRefreshListingsWorker(admin, {
      profileId,
      dryRun: true,
      // --force: bez cap-a; inače env REFRESH_LISTINGS_MAX_PER_RUN ili default 20
      maxRefreshes: force
        ? Number.POSITIVE_INFINITY
        : process.env.REFRESH_LISTINGS_MAX_PER_RUN
          ? Number(process.env.REFRESH_LISTINGS_MAX_PER_RUN)
          : 20,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runRefreshListingsJob(admin, profileId);
  console.log(
    `Završeno: obnovljeno=${stats.refreshed}, kandidati=${stats.candidates}, ` +
      `budžet=${stats.remaining}/${stats.freeLimit}, greške=${stats.failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
