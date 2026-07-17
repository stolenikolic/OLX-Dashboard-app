import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFeed } from "@/lib/feed/fetch";
import { syncFeed } from "@/lib/feed/sync";
import type { Json } from "@/types/database";

async function main() {
  const admin = createAdminClient();

  const { data: run, error: runError } = await admin
    .from("job_runs")
    .insert({ job: "sync_feed", status: "running" })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(
      `Kreiranje job_runs zapisa nije uspjelo: ${runError?.message ?? "nepoznato"}`,
    );
  }

  const jobRunId = run.id;
  const startedAt = Date.now();

  try {
    console.log("Preuzimam feed…");
    const { products, invalid, total } = await fetchFeed();
    console.log(`Feed: ${total} stavki (validnih ${products.length}, nevažećih ${invalid}).`);

    const stats = await syncFeed(admin, products, invalid);
    const durationMs = Date.now() - startedAt;

    const summary = `Sinhronizovano ${stats.upserted} proizvoda, ${stats.offers} ponuda, ${stats.categoriesEnsured} kategorija; uklonjeno iz feed-a ${stats.pruned}; nevažećih ${stats.invalid}.`;
    console.log(summary);

    await admin
      .from("job_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        items_processed: stats.total,
        items_succeeded: stats.upserted,
        items_failed: stats.invalid,
        summary,
      })
      .eq("id", jobRunId);

    await admin.from("job_logs").insert({
      job_run_id: jobRunId,
      level: "info",
      message: "sync_feed završen",
      context: { ...stats, durationMs } as unknown as Json,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync_feed greška:", message);

    await admin
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        summary: message,
      })
      .eq("id", jobRunId);

    await admin.from("job_logs").insert({
      job_run_id: jobRunId,
      level: "error",
      message: "sync_feed neuspješan",
      context: { error: message },
    });

    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
