import { createJobAdminClient } from "@/lib/supabase/job-admin";
import { backfillAntiCorrelation } from "@/lib/workers/profile-auto-setup";

async function main() {
  const admin = createJobAdminClient();
  const result = await backfillAntiCorrelation(admin);
  console.log(`Backfill gotov: ažurirano ${result.updated} profila.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
