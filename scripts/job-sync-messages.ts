import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import {
  runSyncMessagesJob,
  runSyncMessagesWorker,
} from "@/lib/messages/sync-messages";
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
    const stats = await runSyncMessagesWorker(admin, {
      profileId,
      dryRun: true,
      onlyUnread: true,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runSyncMessagesJob(admin, profileId, {
    onlyUnread: true,
  });
  console.log(
    `Završeno: conversations=${stats.conversations}, scanned=${stats.scanned}, upserted=${stats.upserted}, failed=${stats.failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
