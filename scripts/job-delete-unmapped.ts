import { runDeleteUnmappedJob, runDeleteUnmappedWorker } from "@/lib/listings/delete-unmapped";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

async function main() {
  const admin = createJobAdminClient();
  const profileId = process.env.PROFILE_ID?.trim();

  if (!profileId) {
    throw new Error("PROFILE_ID nije postavljen.");
  }

  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    const stats = await runDeleteUnmappedWorker(admin, {
      profileId,
      dryRun: true,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runDeleteUnmappedJob(admin, profileId);
  console.log(
    `Završeno: obrisano=${stats.deleted}, greške=${stats.failed}, kandidata=${stats.candidates}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
