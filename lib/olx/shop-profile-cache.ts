import type { SupabaseClient } from "@supabase/supabase-js";

import type { OlxClient } from "@/lib/olx/client";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

type ShopPayload = {
  username: string;
  avatarUrl: string | null;
  packageName: string | null;
  profileUrl: string;
};

export async function persistOlxShopProfile(
  admin: Admin,
  client: OlxClient,
  profile: { id: string; olx_username: string | null; olx_login_email: string | null },
): Promise<void> {
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) return;

  try {
    const user = await client.getUser(username);
    const payload: ShopPayload = {
      username: user.username || username,
      avatarUrl: user.avatar || null,
      packageName: user.shop?.package?.trim() || null,
      profileUrl: `https://olx.ba/shop/${encodeURIComponent(user.username || username)}`,
    };
    await admin
      .from("profiles")
      .update({
        olx_shop_profile: payload as unknown as Json,
        olx_shop_profile_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
  } catch (err) {
    console.warn(
      `OLX shop profil nije keširan (${username}):`,
      err instanceof Error ? err.message : err,
    );
  }
}
