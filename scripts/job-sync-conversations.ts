import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import {
  DEFAULT_BACKFILL_MONTHS,
  runSyncConversationsJob,
  runSyncConversationsWorker,
} from "@/lib/messages/sync-conversations";
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
  const backfillFlag = process.argv.includes("--backfill");
  const backfillEnv = process.env.BACKFILL_MONTHS?.trim();
  const backfillMonths = backfillFlag
    ? backfillEnv
      ? Number(backfillEnv)
      : DEFAULT_BACKFILL_MONTHS
    : undefined;

  if (backfillMonths != null && !Number.isFinite(backfillMonths)) {
    throw new Error("BACKFILL_MONTHS mora biti broj.");
  }

  if (dryRun) {
    const stats = await runSyncConversationsWorker(admin, {
      profileId,
      dryRun: true,
      backfillMonths,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runSyncConversationsJob(admin, profileId, {
    backfillMonths,
  });
  console.log(
    `Završeno: pages=${stats.pages}, scanned=${stats.scanned}, upserted=${stats.upserted}, stop=${stats.stoppedReason}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
