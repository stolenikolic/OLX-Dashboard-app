import type { SupabaseClient } from "@supabase/supabase-js";

import { listActiveProfiles } from "@/lib/listings/profile-client";
import type { Database } from "@/types/database";
import type { PriceMode } from "@/lib/pricing";

type Admin = SupabaseClient<Database>;

export type PriceDueProfile = {
  id: string;
  name: string;
  price_mode: PriceMode;
};

export async function listPriceDueProfiles(
  admin: Admin,
  options?: { onlyProfileId?: string; force?: boolean },
): Promise<PriceDueProfile[]> {
  const force =
    options?.force === true ||
    process.env.FORCE === "true" ||
    process.env.FORCE === "1";

  let profiles = await listActiveProfiles(admin);
  const onlyId =
    options?.onlyProfileId?.trim() ?? process.env.ONLY_PROFILE_ID?.trim();
  if (onlyId) {
    profiles = profiles.filter((p) => p.id === onlyId);
  }

  const due: PriceDueProfile[] = [];

  for (const profile of profiles) {
    const { data: settings, error: settingsError } = await admin
      .from("profiles")
      .select("price_refresh_days, price_mode")
      .eq("id", profile.id)
      .single();

    if (settingsError || !settings) continue;

    const priceMode: PriceMode = settings.price_mode ?? "original";

    if (force) {
      due.push({ id: profile.id, name: profile.name, price_mode: priceMode });
      continue;
    }

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
      due.push({ id: profile.id, name: profile.name, price_mode: priceMode });
      continue;
    }

    const daysSince =
      (Date.now() - new Date(lastRun.finished_at).getTime()) / 86_400_000;

    if (daysSince >= settings.price_refresh_days) {
      due.push({ id: profile.id, name: profile.name, price_mode: priceMode });
    }
  }

  return due;
}
