import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

/** Osigurava TechZone test profil u bazi (za skripte / prvi run). */
export async function ensureTechZoneProfile(admin: Admin): Promise<string> {
  const username = process.env.OLX_USERNAME ?? "techzone";

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("olx_username", username)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await admin
    .from("profiles")
    .insert({
      name: "TechZone",
      olx_username: username,
      auth_method: "login",
      olx_login_email: username,
      olx_password_enc: process.env.OLX_PASSWORD ?? null,
      device_name: process.env.OLX_DEVICE_NAME ?? "api_integration",
      kurs: 380,
      kurs_uvoz: 350,
      description_template:
        "{{title}}\n\n{{specs}}\n\nTechZone — garancija i brza isporuka.",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`Kreiranje profila nije uspjelo: ${error?.message}`);
  }

  return inserted.id;
}
