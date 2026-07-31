import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getNextEligibleAt,
  isPostingWindowOpen,
  SLOT_COUNT,
  SLOT_START_MINUTES,
  SLOT_STEP_MINUTES,
  slotToTime,
  slotsConflict,
  timeToSlotMinutes,
  type PostScheduleFields,
} from "@/lib/listings/post-schedule-time";
import { listActiveProfiles } from "@/lib/workers/profile";
import type { Database } from "@/types/database";

export {
  POST_SCHEDULE_TZ,
  POST_SCHEDULE_WINDOW_MS,
  formatScheduleTime,
  getNextEligibleAt,
  getWindowEndAt,
  isPostingWindowOpen,
  parseScheduleTime,
  sarajevoLocalToUtc,
  scheduleTodayAt,
} from "@/lib/listings/post-schedule-time";

type Admin = SupabaseClient<Database>;

export type PostScheduleProfile = {
  id: string;
  name: string;
} & PostScheduleFields;

export async function listDuePostProfiles(
  admin: Admin,
  now: Date = new Date(),
): Promise<Array<{ id: string; name: string }>> {
  const active = await listActiveProfiles(admin);
  if (active.length === 0) return [];

  const ids = active.map((p) => p.id);
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, post_schedule_time, posting_window_started_at")
    .in("id", ids);

  if (error) {
    throw new Error(`Lista due profila nije uspjela: ${error.message}`);
  }

  const due: Array<{ id: string; name: string }> = [];
  for (const row of data ?? []) {
    const next = getNextEligibleAt(row, now);
    if (next && now.getTime() >= next.getTime()) {
      due.push({ id: row.id, name: row.name });
    }
  }

  due.sort((a, b) => a.name.localeCompare(b.name));
  return due;
}

/** Random HH:MM u 08:00–20:00, izbjegava zauzete slotove (±20 min). */
export async function assignPostScheduleTime(
  admin: Admin,
  profileId: string,
): Promise<string> {
  const { data: rows, error } = await admin
    .from("profiles")
    .select("id, post_schedule_time");

  if (error) {
    throw new Error(`Učitavanje rasporeda nije uspjelo: ${error.message}`);
  }

  const taken = (rows ?? [])
    .filter((r) => r.id !== profileId && r.post_schedule_time)
    .map((r) => timeToSlotMinutes(r.post_schedule_time!));

  const freeSlots: number[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const mins = SLOT_START_MINUTES + i * SLOT_STEP_MINUTES;
    if (!taken.some((t) => slotsConflict(t, mins))) {
      freeSlots.push(i);
    }
  }

  const pool = freeSlots.length > 0 ? freeSlots : [...Array(SLOT_COUNT).keys()];
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  const time = slotToTime(pick);

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      post_schedule_time: time,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (updateError) {
    throw new Error(
      `Dodjela termina nije uspjela: ${updateError.message}`,
    );
  }

  return time;
}

/**
 * Postavi posting_window_started_at samo ako nema aktivnog prozora
 * (null ili at >= window + 24h).
 */
export async function ensurePostingWindowStarted(
  admin: Admin,
  profileId: string,
  at: Date = new Date(),
): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("posting_window_started_at")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(
      `Profil ${profileId} nije pronađen za posting window: ${error?.message}`,
    );
  }

  const existing = data.posting_window_started_at;
  if (isPostingWindowOpen(existing, at) && existing) {
    return existing;
  }

  const iso = at.toISOString();
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      posting_window_started_at: iso,
      updated_at: iso,
    })
    .eq("id", profileId);

  if (updateError) {
    throw new Error(
      `Upis posting_window_started_at nije uspio: ${updateError.message}`,
    );
  }

  return iso;
}

export async function loadPostScheduleProfile(
  admin: Admin,
  profileId: string,
): Promise<PostScheduleProfile> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, post_schedule_time, posting_window_started_at")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(`Profil ${profileId} nije pronađen.`);
  }

  return data;
}
