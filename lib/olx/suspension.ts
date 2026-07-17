import type { SupabaseClient } from "@supabase/supabase-js";

import { OlxApiError } from "@/lib/olx/client";
import { notifyAdmin } from "@/lib/notify/email";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

const SUSPENSION_HOURS = 24;

export function isAuthFailure(error: unknown): boolean {
  if (error instanceof OlxApiError) {
    return error.status === 401 || error.status === 403;
  }
  return false;
}

export async function suspendProfile(
  admin: Admin,
  profileId: string,
  profileName: string,
  reason: string,
): Promise<void> {
  const until = new Date();
  until.setHours(until.getHours() + SUSPENSION_HOURS);

  await admin
    .from("profiles")
    .update({
      status: "suspended",
      suspended_until: until.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  await notifyAdmin({
    subject: `[OLX Dashboard] Profil suspendovan: ${profileName}`,
    body: `Profil "${profileName}" je suspendovan do ${until.toISOString()}.\n\nRazlog: ${reason}`,
  });
}

export async function maybeResumeProfile(
  admin: Admin,
  profile: {
    id: string;
    status: Database["public"]["Enums"]["profile_status"];
    suspended_until: string | null;
  },
): Promise<boolean> {
  if (profile.status !== "suspended") return profile.status === "active";

  if (!profile.suspended_until) return false;

  if (new Date(profile.suspended_until) <= new Date()) {
    await admin
      .from("profiles")
      .update({
        status: "active",
        suspended_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    return true;
  }

  return false;
}

export async function handleOlxAuthFailure(
  admin: Admin,
  profileId: string,
  profileName: string,
  error: unknown,
): Promise<void> {
  if (!isAuthFailure(error)) return;
  const message =
    error instanceof Error ? error.message : "OLX auth greška";
  await suspendProfile(admin, profileId, profileName, message);
}
