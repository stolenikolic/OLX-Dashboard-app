import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  createClientForProfile as createClientForProfileWorker,
  loadProfileForWorker,
  type ProfileForWorker,
} from "@/lib/workers/profile";

export {
  clearProfileTokenCache,
  listActiveProfiles,
  loadProfileForWorker,
  type ProfileForWorker,
} from "@/lib/workers/profile";

/** Dashboard helper — učitava profil i vraća OLX klijent. */
export async function createClientForProfileRecord(
  profile: ProfileForWorker,
) {
  const admin = createAdminClient();
  return createClientForProfileWorker(admin, profile);
}

/** Dashboard helper — po ID-u profila. */
export async function createClientForProfileId(profileId: string) {
  const admin = createAdminClient();
  const profile = await loadProfileForWorker(admin, profileId);
  return createClientForProfileWorker(admin, profile);
}
