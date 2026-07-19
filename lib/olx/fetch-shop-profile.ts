import "server-only";

import { unstable_cache } from "next/cache";

import { createClientForProfileId } from "@/lib/listings/profile-client";

export type OlxShopHeaderData = {
  username: string;
  avatarUrl: string | null;
  packageName: string | null;
  profileUrl: string;
};

async function fetchOlxShopUncached(
  profileId: string,
  username: string,
): Promise<OlxShopHeaderData | null> {
  try {
    const client = await createClientForProfileId(profileId);
    const user = await client.getUser(username);
    const packageName = user.shop?.package?.trim() || null;
    return {
      username: user.username || username,
      avatarUrl: user.avatar || null,
      packageName,
      profileUrl: `https://olx.ba/shop/${encodeURIComponent(user.username || username)}`,
    };
  } catch (err) {
    console.warn(
      `OLX shop profil nije učitan (${username}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Keš ~1h po profilu/username. */
export function fetchOlxShopProfile(
  profileId: string,
  username: string,
): Promise<OlxShopHeaderData | null> {
  const normalized = username.trim();
  if (!normalized) return Promise.resolve(null);

  return unstable_cache(
    () => fetchOlxShopUncached(profileId, normalized),
    ["olx-shop-profile", profileId, normalized.toLowerCase()],
    { revalidate: 3600 },
  )();
}
