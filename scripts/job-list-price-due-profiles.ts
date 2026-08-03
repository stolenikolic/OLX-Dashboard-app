import { appendFileSync } from "fs";

import { listPriceDueProfiles } from "@/lib/listings/list-price-due-profiles";
import {
  isJobEnabledForProfile,
  JOB_TOGGLE_LABELS,
  recordJobSkipped,
} from "@/lib/workers/jobs-enabled";
import { listActiveProfiles } from "@/lib/workers/profile";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

function writeGithubOutput(lines: string[]) {
  for (const line of lines) {
    console.log(line);
  }
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(out, `${lines.join("\n")}\n`);
  }
}

async function main() {
  const admin = createJobAdminClient();
  const force =
    process.env.FORCE === "true" || process.env.FORCE === "1";
  const onlyId = process.env.ONLY_PROFILE_ID?.trim();

  // Due bez job filtera, pa filtriraj + log skip.
  const dueAll = await listPriceDueProfiles(admin, {
    onlyProfileId: onlyId,
    force,
    ignoreJobToggle: true,
  });

  const profiles = [];
  for (const p of dueAll) {
    const { data } = await admin
      .from("profiles")
      .select("jobs_enabled")
      .eq("id", p.id)
      .maybeSingle();

    if (isJobEnabledForProfile(data ?? {}, "refresh_prices")) {
      profiles.push(p);
    } else {
      await recordJobSkipped(admin, {
        job: "refresh_prices",
        profileId: p.id,
        profileName: p.name,
      });
      console.log(
        `${JOB_TOGGLE_LABELS.refresh_prices} je pauzirano za profil "${p.name}". Preskačem.`,
      );
    }
  }

  if (onlyId && profiles.length === 0) {
    // Razlikuj: profil nije aktivan / nije due vs. posao pauziran.
    const statusActive = await listActiveProfiles(admin);
    const target = statusActive.find((p) => p.id === onlyId);

    if (!target) {
      throw new Error(
        `Nema aktivnog profila s id=${onlyId} (provjeri status / force flag).`,
      );
    }

    const { data } = await admin
      .from("profiles")
      .select("jobs_enabled")
      .eq("id", onlyId)
      .maybeSingle();

    if (!isJobEnabledForProfile(data ?? {}, "refresh_prices")) {
      // Već logovano gore ako je bio u dueAll; inače loguj sad.
      if (!dueAll.some((p) => p.id === onlyId)) {
        await recordJobSkipped(admin, {
          job: "refresh_prices",
          profileId: target.id,
          profileName: target.name,
        });
        console.log(
          `${JOB_TOGGLE_LABELS.refresh_prices} je pauzirano za profil "${target.name}". Preskačem.`,
        );
      }
      // has_profiles=false — prepare zelen, worker se skip-uje
    } else if (dueAll.length === 0) {
      // Aktivan, job uključen, ali nije due (bez force) — nije greška za cron-like dispatch.
      console.log(
        `Profil "${target.name}" nije due za ${JOB_TOGGLE_LABELS.refresh_prices} (force=${force}). Preskačem.`,
      );
    }
  }

  const hasCompetitorMode = profiles.some(
    (p) => p.price_mode === "competitor_minus_1",
  );

  const matrix = { profile: profiles.map(({ id, name }) => ({ id, name })) };
  writeGithubOutput([
    `has_profiles=${profiles.length > 0}`,
    `has_competitor_mode=${hasCompetitorMode}`,
    `matrix=${JSON.stringify(matrix)}`,
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
