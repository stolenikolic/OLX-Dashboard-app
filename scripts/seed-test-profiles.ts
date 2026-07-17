import { createJobAdminClient } from "@/lib/supabase/job-admin";

async function main() {
  const admin = createJobAdminClient();

  const profiles = [
    { name: "Test Profil A", olx_username: "test_profil_a" },
    { name: "Test Profil B", olx_username: "test_profil_b" },
  ];

  for (const p of profiles) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("name", p.name)
      .maybeSingle();

    if (existing) {
      console.log(`Profil "${p.name}" već postoji (${existing.id}).`);
      continue;
    }

    const { data, error } = await admin
      .from("profiles")
      .insert({
        name: p.name,
        olx_username: p.olx_username,
        status: "paused",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`Greška za ${p.name}:`, error.message);
    } else {
      console.log(`Kreiran profil "${p.name}" (${data.id}).`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
