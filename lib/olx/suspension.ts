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

const DAILY_LIMIT_MESSAGE =
  /prekora[cč]ili\s+ste\s+limit\s+objave\s+oglasa\s+od\s+350/i;

/** Izvuci OLX error.message iz JSON body-a (unicode escape \u010d → č). */
function olxErrorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof OlxApiError) {
    parts.push(error.message);
    if (error.body?.trim()) {
      try {
        const parsed = JSON.parse(error.body) as {
          error?: { message?: string; type?: string; status?: string | number };
          message?: string;
        };
        const msg =
          parsed.error?.message ??
          parsed.message ??
          (typeof parsed.error === "string" ? parsed.error : null);
        if (msg) parts.push(msg);
        if (parsed.error?.type) parts.push(parsed.error.type);
      } catch {
        parts.push(error.body);
      }
    }
  } else if (error instanceof Error) {
    parts.push(error.message);
  } else if (error != null) {
    parts.push(String(error));
  }
  return parts.join("\n");
}

/**
 * Detekcija OLX dnevnog limita objava (350/dan).
 * Tačan odgovor: 400 bad_request — "Prekoračili ste limit objave oglasa od 350 po danu!"
 */
export function isDailyPostLimitError(error: unknown): boolean {
  if (error instanceof OlxApiError && error.status === 400) {
    const text = olxErrorText(error);
    if (DAILY_LIMIT_MESSAGE.test(text)) return true;
  }

  const text = olxErrorText(error).toLowerCase();
  if (!text.trim()) return false;

  if (DAILY_LIMIT_MESSAGE.test(text)) return true;

  const patterns = [
    /limit\s+objave\s+oglasa\s+od\s+350/,
    /350\s+po\s+danu/,
    /dnevni\s+limit/,
    /daily\s+limit/,
  ];

  return patterns.some((re) => re.test(text));
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
