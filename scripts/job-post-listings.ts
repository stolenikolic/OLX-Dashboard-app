import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import { runPostListingsJob, runPostListingsWorker } from "@/lib/listings/post-worker";
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
  const importOnly = process.argv.includes("--import-only");
  const categoryId = process.env.CATEGORY_ID?.trim() || undefined;
  const skipImport =
    process.argv.includes("--skip-import") ||
    process.env.SKIP_IMPORT === "true" ||
    process.env.SKIP_IMPORT === "1" ||
    Boolean(categoryId);

  if (dryRun || importOnly) {
    const stats = await runPostListingsWorker(admin, {
      profileId,
      dryRun: dryRun && !importOnly,
      skipImport,
      categoryId,
      maxPosts: importOnly ? 0 : undefined,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const stats = await runPostListingsJob(admin, profileId, {
    skipImport,
    categoryId,
  });
  console.log(
    `Završeno: objavljeno=${stats.posted}, preskočeno=${stats.skipped}, greške=${stats.failed}, cancelled=${stats.cancelled}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
