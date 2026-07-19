import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type DeleteUnmappedOptions = {
  profileId: string;
  dryRun?: boolean;
  maxDeletes?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
  jobRunId?: string;
};

export type DeleteUnmappedResult = {
  candidates: number;
  deleted: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function resolveMaxDeletes(explicit?: number): number | null {
  if (explicit != null) return explicit;
  const fromEnv = process.env.DELETE_UNMAPPED_MAX_PER_RUN;
  if (fromEnv != null && fromEnv !== "") {
    const n = Number(fromEnv);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

export async function runDeleteUnmappedWorker(
  admin: Admin,
  options: DeleteUnmappedOptions,
): Promise<DeleteUnmappedResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const client = await createClientForProfile(admin, profile);

  const { data: rows, error } = await admin
    .from("unmapped_listings")
    .select("id, olx_listing_id, title")
    .eq("profile_id", options.profileId)
    .order("olx_listing_id");

  if (error) {
    throw new Error(
      `Učitavanje unmapped_listings nije uspjelo: ${error.message}`,
    );
  }

  const candidates = rows ?? [];
  const maxDeletes = resolveMaxDeletes(options.maxDeletes);
  const toProcess =
    maxDeletes != null ? candidates.slice(0, maxDeletes) : candidates;

  const result: DeleteUnmappedResult = {
    candidates: candidates.length,
    deleted: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const delayMin = options.delayMinMs ?? 800;
  const delayMax = options.delayMaxMs ?? 2200;

  if (options.jobRunId) {
    await appendJobLog(admin, options.jobRunId, {
      level: "info",
      message: `Brisanje nemapiranih: kandidata=${candidates.length}, u_ovom_runu=${toProcess.length}${options.dryRun ? " (dry-run)" : ""}`,
    });
  }

  for (const row of toProcess) {
    if (options.dryRun) {
      result.skipped++;
      continue;
    }

    try {
      await client.deleteListing(row.olx_listing_id);
      const { error: delError } = await admin
        .from("unmapped_listings")
        .delete()
        .eq("id", row.id);

      if (delError) {
        throw new Error(
          `OLX obrisan, ali snapshot red nije: ${delError.message}`,
        );
      }

      result.deleted++;
      if (options.jobRunId && result.deleted % 25 === 0) {
        await appendJobLog(admin, options.jobRunId, {
          level: "info",
          message: `Napredak: obrisano=${result.deleted}/${toProcess.length}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push(`#${row.olx_listing_id}: ${message}`);

      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(
          admin,
          options.profileId,
          profile.name,
          err,
        );
        if (options.jobRunId) {
          await appendJobLog(admin, options.jobRunId, {
            level: "error",
            message: `Auth greška — prekid: ${message}`,
          });
        }
        break;
      }

      if (options.jobRunId) {
        await appendJobLog(admin, options.jobRunId, {
          level: "error",
          message: `Delete fail #${row.olx_listing_id} (${row.title}): ${message}`,
        });
      }
    }

    await sleep(randomDelayMs(delayMin, delayMax));
  }

  return result;
}

export async function runDeleteUnmappedJob(
  admin: Admin,
  profileId: string,
  options?: Omit<DeleteUnmappedOptions, "profileId" | "jobRunId">,
): Promise<DeleteUnmappedResult> {
  const profile = await loadProfileForWorker(admin, profileId);

  const jobRunId = await startJobRun(admin, {
    job: "delete_unmapped",
    profileId,
  });

  try {
    const stats = await runDeleteUnmappedWorker(admin, {
      ...options,
      profileId,
      jobRunId,
    });

    const status =
      stats.failed === 0
        ? "success"
        : stats.deleted > 0
          ? "partial"
          : "failed";

    const summary = `obrisano=${stats.deleted}, greške=${stats.failed}, dry_skip=${stats.skipped}`;

    await finishJobRun(admin, jobRunId, {
      status,
      items_processed: stats.candidates,
      items_succeeded: stats.deleted,
      items_failed: stats.failed,
      summary,
    });

    if (status === "failed") {
      await notifyJobFailed(
        "delete_unmapped",
        profile.name,
        stats.errors.slice(0, 5).join("; ") || summary,
      );
    }

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });
    await notifyJobFailed("delete_unmapped", profile.name, message);
    throw err;
  }
}
