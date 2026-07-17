import { fetchFeed } from "@/lib/feed/fetch";
import { syncFeed } from "@/lib/feed/sync";
import { createJobAdminClient } from "@/lib/supabase/job-admin";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Json } from "@/types/database";

async function main() {
  const admin = createJobAdminClient();
  const jobRunId = await startJobRun(admin, { job: "sync_feed" });
  const startedAt = Date.now();

  try {
    console.log("Preuzimam feed…");
    const { products, invalid, total } = await fetchFeed();
    console.log(
      `Feed: ${total} stavki (validnih ${products.length}, nevažećih ${invalid}).`,
    );

    const stats = await syncFeed(admin, products, invalid);
    const durationMs = Date.now() - startedAt;
    const summary = `Sinhronizovano ${stats.upserted} proizvoda, ${stats.offers} ponuda; uklonjeno iz feed-a ${stats.pruned}.`;
    console.log(summary);

    await finishJobRun(admin, jobRunId, {
      status: "success",
      items_processed: stats.upserted + stats.invalid,
      items_succeeded: stats.upserted,
      items_failed: stats.invalid,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: "info",
      message: "sync_feed završen",
      context: { ...stats, durationMs } as unknown as Json,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync_feed greška:", message);

    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });

    await appendJobLog(admin, jobRunId, {
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
