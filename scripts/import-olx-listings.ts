import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import { importListingsFromOlx } from "@/lib/listings/import-from-olx";
import { createJobAdminClient } from "@/lib/supabase/job-admin";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";

async function main() {
  const admin = createJobAdminClient();

  let profileId = process.env.PROFILE_ID?.trim();
  if (!profileId) {
    profileId = await ensureTechZoneProfile(admin);
  }

  const profile = await loadProfileForWorker(admin, profileId);
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) {
    throw new Error("Profil nema olx_username.");
  }

  const client = await createClientForProfile(admin, profile);
  console.log(`Import OLX oglasa za profil ${profile.name} (${username})…`);

  const result = await importListingsFromOlx(
    admin,
    client,
    profileId,
    username,
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
