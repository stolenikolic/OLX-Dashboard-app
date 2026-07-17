import type { SupabaseClient } from "@supabase/supabase-js";

import { listActiveProfiles } from "@/lib/listings/profile-client";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export async function listPriceDueProfiles(
  admin: Admin,
  options?: { onlyProfileId?: string; force?: boolean },
): Promise<Array<{ id: string; name: string }>> {
  const force =
    options?.force === true ||
    process.env.FORCE === "true" ||
    process.env.FORCE === "1";

  let profiles = await listActiveProfiles(admin);
  const onlyId = options?.onlyProfileId?.trim() ?? process.env.ONLY_PROFILE_ID?.trim();
  if (onlyId) {
    profiles = profiles.filter((p) => p.id === onlyId);
  }

  if (force) return profiles;

  const due: Array<{ id: string; name: string }> = [];

  for (const profile of profiles) {
    const { data: settings, error: settingsError } = await admin
      .from("profiles")
      .select("price_refresh_days")
      .eq("id", profile.id)
      .single();

    if (settingsError || !settings) continue;

    const { data: lastRun } = await admin
      .from("job_runs")
      .select("finished_at")
      .eq("profile_id", profile.id)
      .eq("job", "refresh_prices")
      .in("status", ["success", "partial"])
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastRun?.finished_at) {
      due.push(profile);
      continue;
    }

    const daysSince =
      (Date.now() - new Date(lastRun.finished_at).getTime()) / 86_400_000;

    if (daysSince >= settings.price_refresh_days) {
      due.push(profile);
    }
  }

  return due;
}
