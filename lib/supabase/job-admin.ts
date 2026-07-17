import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/** Admin klijent za GitHub Actions / job skripte (podržava oba naziva env varijabli). */
export function createJobAdminClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ili NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY) nisu postavljeni.",
    );
  }

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
