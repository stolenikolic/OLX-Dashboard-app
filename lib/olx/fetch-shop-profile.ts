import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type OlxShopHeaderData = {
  username: string;
  avatarUrl: string | null;
  packageName: string | null;
  profileUrl: string;
};

function fromStored(
  stored: Json | null | undefined,
  fallbackUsername: string,
): OlxShopHeaderData | null {
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const o = stored as Record<string, unknown>;
    const username =
      (typeof o.username === "string" && o.username) || fallbackUsername;
    return {
      username,
      avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : null,
      packageName: typeof o.packageName === "string" ? o.packageName : null,
      profileUrl:
        typeof o.profileUrl === "string"
          ? o.profileUrl
          : `https://olx.ba/shop/${encodeURIComponent(username)}`,
    };
  }
  if (!fallbackUsername.trim()) return null;
  const username = fallbackUsername.trim();
  return {
    username,
    avatarUrl: null,
    packageName: null,
    profileUrl: `https://olx.ba/shop/${encodeURIComponent(username)}`,
  };
}

/** Čita keširani OLX shop profil iz baze (ne zove OLX). */
export async function fetchOlxShopProfile(
  profileId: string,
  username: string,
): Promise<OlxShopHeaderData | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("olx_shop_profile, olx_username")
    .eq("id", profileId)
    .maybeSingle();

  return fromStored(
    data?.olx_shop_profile ?? null,
    username || data?.olx_username || "",
  );
}
