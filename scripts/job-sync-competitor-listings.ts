import { syncCompetitorListings } from "@/lib/pricing/competitor";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import { createJobAdminClient } from "@/lib/supabase/job-admin";
import type { Json } from "@/types/database";

async function main() {
  const admin = createJobAdminClient();
  const startedAt = Date.now();

  const jobRunId = await startJobRun(admin, {
    job: "sync_competitors",
  });

  try {
    const stats = await syncCompetitorListings(admin);
    const durationMs = Date.now() - startedAt;
    const summary =
      `Selleri=${stats.sellers}; fetch=${stats.fetched}; upsert=${stats.upserted}; ` +
      `split=${stats.bucketsSplit}; greške=${stats.errors.length}.`;

    const status =
      stats.errors.length > 0 && stats.upserted === 0
        ? "failed"
        : stats.errors.length > 0
          ? "partial"
          : "success";

    await finishJobRun(admin, jobRunId, {
      status,
      items_processed: stats.fetched,
      items_succeeded: stats.upserted,
      items_failed: stats.errors.length,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: stats.errors.length > 0 ? "warn" : "info",
      message: "sync_competitors završen",
      context: { ...stats, durationMs } as unknown as Json,
    });

    console.log(summary);
    if (status === "failed") process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });
    await appendJobLog(admin, jobRunId, {
      level: "error",
      message: "sync_competitors neuspješan",
      context: { error: message },
    });
    console.error(err);
    process.exit(1);
  }
}

main();
