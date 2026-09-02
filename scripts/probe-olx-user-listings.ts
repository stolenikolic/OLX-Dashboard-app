import "./_olx-guard";

import { createClientForProfile, loadProfileForWorker } from "@/lib/workers/profile";
import { createJobAdminClient } from "@/lib/supabase/job-admin";

/**
 * Probe za autentifikovani /users/:username/listings endpoint.
 * Provjerava (bez ikakvih izmjena u bazi):
 *   1. Da li price_from/price_to filtriraju rezultat i da li meta.total prati filter.
 *   2. Da li selected_category radi na ovom endpointu.
 *   3. Ponašanje na page × per_page > 10.000 (potvrda ES window granice).
 *
 * Rezultat određuje dizajn particionisanja u
 * lib/listings/fetch-user-listings-authed.ts (cjenovni pragovi vs. kategorije).
 *
 * Pokreće se preko workflow_dispatch na GHA (_olx-guard traži GITHUB_ACTIONS=true).
 */

async function main() {
  const admin = createJobAdminClient();

  const { data: candidates, error } = await admin
    .from("profiles")
    .select("id, name")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(`Učitavanje profila nije uspjelo: ${error.message}`);
  const candidate = candidates?.[0];
  if (!candidate) {
    console.log("Nema aktivnih profila — probe preskočen.");
    return;
  }

  const profile = await loadProfileForWorker(admin, candidate.id);
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) {
    throw new Error(`Profil "${profile.name}" nema OLX username.`);
  }

  console.log(`Probe profil: ${profile.name} (username=${username})`);
  const client = await createClientForProfile(admin, profile);

  const results: Record<string, unknown> = {};

  // 1) Baseline — bez filtera.
  const baseline = await client.getUserListingsAuthed(username, 1, 50, "desc");
  const grandTotal = baseline.meta?.total ?? baseline.data.length;
  const samplePrices = baseline.data
    .map((r) => (typeof r.price === "number" ? r.price : Number(r.price)))
    .filter((p) => Number.isFinite(p)) as number[];
  results.baseline = {
    total: grandTotal,
    n: baseline.data.length,
    samplePriceMin: samplePrices.length ? Math.min(...samplePrices) : null,
    samplePriceMax: samplePrices.length ? Math.max(...samplePrices) : null,
  };
  console.log("1) Baseline (bez filtera):", JSON.stringify(results.baseline));

  // 2) price_from / price_to — podijeli na dvije polovine oko medijane uzorka.
  const mid =
    samplePrices.length > 0
      ? Math.round(samplePrices.reduce((a, b) => a + b, 0) / samplePrices.length)
      : 100;

  const lowHalf = await client.getUserListingsAuthed(username, 1, 50, "desc", {
    priceTo: mid,
  });
  const highHalf = await client.getUserListingsAuthed(username, 1, 50, "desc", {
    priceFrom: mid,
  });

  const lowTotal = lowHalf.meta?.total ?? lowHalf.data.length;
  const highTotal = highHalf.meta?.total ?? highHalf.data.length;
  const lowPricesOk = lowHalf.data.every((r) => {
    const p = typeof r.price === "number" ? r.price : Number(r.price);
    return !Number.isFinite(p) || p <= mid;
  });
  const highPricesOk = highHalf.data.every((r) => {
    const p = typeof r.price === "number" ? r.price : Number(r.price);
    return !Number.isFinite(p) || p >= mid;
  });

  results.priceFilter = {
    splitAt: mid,
    lowTotal,
    highTotal,
    sumMatchesGrandTotal:
      grandTotal === 0 ? null : Math.abs(lowTotal + highTotal - grandTotal) <= 2,
    lowPricesRespectFilter: lowPricesOk,
    highPricesRespectFilter: highPricesOk,
    priceFilterAppearsSupported:
      (lowTotal !== grandTotal || highTotal !== grandTotal) &&
      lowPricesOk &&
      highPricesOk,
  };
  console.log("2) price_from/price_to:", JSON.stringify(results.priceFilter));

  // 3) selected_category — probaj sa kategorijom prvog oglasa iz baseline-a (ako postoji).
  const sampleCategoryId = baseline.data[0]?.category_id;
  if (sampleCategoryId != null) {
    const byCategory = await client.getUserListingsAuthed(username, 1, 50, "desc", {
      selectedCategoryId: sampleCategoryId,
    });
    const catTotal = byCategory.meta?.total ?? byCategory.data.length;
    const allMatchCategory = byCategory.data.every(
      (r) => r.category_id === sampleCategoryId,
    );
    results.categoryFilter = {
      categoryId: sampleCategoryId,
      total: catTotal,
      allMatchCategory,
      categoryFilterAppearsSupported: catTotal !== grandTotal || allMatchCategory,
    };
  } else {
    results.categoryFilter = { skipped: "baseline nema oglasa sa category_id" };
  }
  console.log("3) selected_category:", JSON.stringify(results.categoryFilter));

  // 4) ES window granica — page*per_page > 10.000.
  try {
    const overWindow = await client.getUserListingsAuthed(username, 11, 1000, "desc");
    results.esWindow = {
      page: 11,
      perPage: 1000,
      offset: 11_000,
      status: "ok",
      n: overWindow.data.length,
      total: overWindow.meta?.total ?? null,
    };
  } catch (err) {
    results.esWindow = {
      page: 11,
      perPage: 1000,
      offset: 11_000,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  console.log("4) ES window (page=11, per_page=1000):", JSON.stringify(results.esWindow));

  console.log("\n=== PROBE SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
