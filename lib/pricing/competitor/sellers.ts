import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type CompetitorSeller = {
  olx_user_id: number;
  name: string;
  grp: string;
};

export async function loadCompetitorSellers(
  admin: Admin,
): Promise<CompetitorSeller[]> {
  const { data, error } = await admin
    .from("competitor_sellers")
    .select("olx_user_id, name, grp")
    .eq("enabled", true)
    .order("name");

  if (error) {
    throw new Error(
      `Učitavanje competitor_sellers nije uspjelo: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    olx_user_id: Number(row.olx_user_id),
    name: row.name,
    grp: row.grp,
  }));
}
