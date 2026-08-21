import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SLOT_COUNT,
  SLOT_START_MINUTES,
  SLOT_STEP_MINUTES,
  slotToTime,
  timeToSlotMinutes,
} from "@/lib/listings/post-schedule-time";
import { DEFAULT_REFRESH_SCORE_CONFIG } from "@/lib/listings/refresh-score";
import {
  generateVarianceForNewProfile,
  type VarianceRange,
} from "@/lib/pricing/variance";
import {
  generatePacingForNewProfile,
  parseJobPacing,
  type JobPacing,
} from "@/lib/workers/job-pacing";
import { generateScheduleForNewProfile } from "@/lib/workers/job-schedule";
import { profileOrderKey } from "@/lib/workers/profile-shuffle";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

export function pickNaturalScheduleSlot(takenMinutes: number[]): string {
  const taken = new Set(takenMinutes);
  const free: number[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const mins = SLOT_START_MINUTES + i * SLOT_STEP_MINUTES;
    if (!taken.has(mins)) free.push(i);
  }
  const allowCollision = Math.random() < 0.2;
  const pool =
    !allowCollision && free.length > 0 ? free : [...Array(SLOT_COUNT).keys()];
  return slotToTime(pool[Math.floor(Math.random() * pool.length)]!);
}

function pickPriceRefreshDays(used: number[]): number {
  const pool = [];
  for (let d = 2; d <= 15; d++) {
    if (!used.includes(d)) pool.push(d);
  }
  const src = pool.length > 0 ? pool : Array.from({ length: 14 }, (_, i) => i + 2);
  return src[Math.floor(Math.random() * src.length)]!;
}

function jitterWeight(base: number): number {
  return Number((base * (0.85 + Math.random() * 0.3)).toFixed(4));
}

export async function autoConfigureNewProfile(
  admin: Admin,
  profileId: string,
): Promise<void> {
  const { data: others, error } = await admin
    .from("profiles")
    .select(
      "id, post_schedule_time, job_pacing, price_refresh_days, price_variance_low_pct, price_variance_high_pct",
    )
    .neq("id", profileId);

  if (error) {
    throw new Error(`Učitavanje profila za auto-setup nije uspjelo: ${error.message}`);
  }

  const takenSlots = (others ?? [])
    .filter((r) => r.post_schedule_time)
    .map((r) => timeToSlotMinutes(r.post_schedule_time!));

  const existingPacings: Array<JobPacing | null> = (others ?? []).map((r) =>
    parseJobPacing(r.job_pacing),
  );

  const usedDays = (others ?? []).map((r) => Number(r.price_refresh_days));
  const existingVariance: VarianceRange[] = (others ?? [])
    .filter(
      (r) =>
        r.price_variance_low_pct != null && r.price_variance_high_pct != null,
    )
    .map((r) => ({
      low: Number(r.price_variance_low_pct),
      high: Number(r.price_variance_high_pct),
    }));

  const scheduleTime = pickNaturalScheduleSlot(takenSlots);
  const pacing = generatePacingForNewProfile(existingPacings);
  const jobSchedule = generateScheduleForNewProfile();
  const priceRefreshDays = pickPriceRefreshDays(usedDays);
  const variance = generateVarianceForNewProfile(existingVariance);

  const { data: settings } = await admin
    .from("app_settings")
    .select(
      "refresh_w_inquiry, refresh_w_category, refresh_w_value, refresh_w_staleness, refresh_unmapped_penalty",
    )
    .eq("id", 1)
    .maybeSingle();

  const refreshOverrides = {
    wInquiry: jitterWeight(
      Number(settings?.refresh_w_inquiry ?? DEFAULT_REFRESH_SCORE_CONFIG.wInquiry),
    ),
    wCategory: jitterWeight(
      Number(settings?.refresh_w_category ?? DEFAULT_REFRESH_SCORE_CONFIG.wCategory),
    ),
    wValue: jitterWeight(
      Number(settings?.refresh_w_value ?? DEFAULT_REFRESH_SCORE_CONFIG.wValue),
    ),
    wStaleness: jitterWeight(
      Number(
        settings?.refresh_w_staleness ?? DEFAULT_REFRESH_SCORE_CONFIG.wStaleness,
      ),
    ),
    unmappedPenalty: jitterWeight(
      Number(
        settings?.refresh_unmapped_penalty ??
          DEFAULT_REFRESH_SCORE_CONFIG.unmappedPenalty,
      ),
    ),
  };

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      post_schedule_time: scheduleTime,
      job_pacing: pacing as unknown as Json,
      job_schedule: jobSchedule as unknown as Json,
      price_refresh_days: priceRefreshDays,
      price_variance_low_pct: variance.low,
      price_variance_high_pct: variance.high,
      refresh_overrides: refreshOverrides as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (updateError) {
    throw new Error(`Auto-setup profila nije uspio: ${updateError.message}`);
  }

  const { data: categories, error: catError } = await admin
    .from("categories")
    .select("id")
    .eq("is_postable", true)
    .not("olx_category_id", "is", null);

  if (catError) {
    throw new Error(`Učitavanje kategorija nije uspjelo: ${catError.message}`);
  }

  const sorted = [...(categories ?? [])].sort(
    (a, b) =>
      profileOrderKey(profileId, a.id) - profileOrderKey(profileId, b.id),
  );

  if (sorted.length > 0) {
    const rows = sorted.map((cat, index) => ({
      profile_id: profileId,
      category_id: cat.id,
      priority: index,
      enabled: true,
    }));
    const { error: prioError } = await admin
      .from("profile_category_priority")
      .upsert(rows, { onConflict: "profile_id,category_id" });
    if (prioError) {
      throw new Error(
        `Upis prioriteta kategorija nije uspio: ${prioError.message}`,
      );
    }
  }
}

export async function backfillAntiCorrelation(admin: Admin): Promise<{
  updated: number;
}> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, post_schedule_time, job_pacing, job_schedule, price_refresh_days, price_variance_low_pct, price_variance_high_pct",
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Učitavanje profila nije uspjelo: ${error.message}`);
  }

  let updated = 0;
  const donePacing: Array<JobPacing | null> = [];
  const doneVariance: VarianceRange[] = [];

  for (const profile of profiles ?? []) {
    const patch: Database["public"]["Tables"]["profiles"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    let dirty = false;

    if (!profile.job_pacing) {
      const pacing = generatePacingForNewProfile(donePacing);
      patch.job_pacing = pacing as unknown as Json;
      donePacing.push(pacing);
      dirty = true;
    } else {
      donePacing.push(parseJobPacing(profile.job_pacing));
    }

    if (!profile.job_schedule) {
      patch.job_schedule = generateScheduleForNewProfile() as unknown as Json;
      dirty = true;
    }

    if (
      profile.price_variance_low_pct == null ||
      profile.price_variance_high_pct == null
    ) {
      const v = generateVarianceForNewProfile(doneVariance);
      patch.price_variance_low_pct = v.low;
      patch.price_variance_high_pct = v.high;
      doneVariance.push(v);
      dirty = true;
    } else {
      doneVariance.push({
        low: Number(profile.price_variance_low_pct),
        high: Number(profile.price_variance_high_pct),
      });
    }

    if (dirty) {
      const { error: uerr } = await admin
        .from("profiles")
        .update(patch)
        .eq("id", profile.id);
      if (uerr) {
        throw new Error(`Backfill ${profile.id} nije uspio: ${uerr.message}`);
      }
      updated++;
    }
  }

  return { updated };
}
