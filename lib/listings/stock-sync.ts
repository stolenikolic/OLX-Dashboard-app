import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { OlxClient } from "@/lib/olx/client";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

type StockListingRow = {
  id: string;
  product_id: string;
  olx_listing_id: number;
  status: Database["public"]["Enums"]["listing_status"];
  products: {
    id: string;
    title: string;
    in_feed: boolean;
  } | null;
};

export type StockSyncOptions = {
  profileId: string;
  dryRun?: boolean;
  maxActions?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
  jobRunId?: string;
};

export type StockSyncResult = {
  hideCandidates: number;
  unhideCandidates: number;
  hidden: number;
  unhidden: number;
  skipped: number;
  failed: number;
  errors: string[];
};

function resolveMaxActions(explicit?: number): number | null {
  if (explicit != null) return explicit;
  const fromEnv = process.env.STOCK_SYNC_MAX_PER_RUN;
  if (fromEnv != null && fromEnv !== "") {
    const n = Number(fromEnv);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

async function loadHideCandidates(
  admin: Admin,
  profileId: string,
): Promise<StockListingRow[]> {
  const { data, error } = await admin
    .from("listings")
    .select(
      `
      id,
      product_id,
      olx_listing_id,
      status,
      products!inner (
        id,
        title,
        in_feed
      )
    `,
    )
    .eq("profile_id", profileId)
    .eq("status", "active")
    .eq("products.in_feed", false)
    .not("olx_listing_id", "is", null)
    .not("product_id", "is", null);

  if (error) {
    throw new Error(`Učitavanje kandidata za hide nije uspjelo: ${error.message}`);
  }

  return (data ?? []) as StockListingRow[];
}

async function loadUnhideCandidates(
  admin: Admin,
  profileId: string,
): Promise<StockListingRow[]> {
  const { data, error } = await admin
    .from("listings")
    .select(
      `
      id,
      product_id,
      olx_listing_id,
      status,
      products!inner (
        id,
        title,
        in_feed
      )
    `,
    )
    .eq("profile_id", profileId)
    .eq("status", "hidden")
    .eq("products.in_feed", true)
    .not("olx_listing_id", "is", null)
    .not("product_id", "is", null);

  if (error) {
    throw new Error(
      `Učitavanje kandidata za unhide nije uspjelo: ${error.message}`,
    );
  }

  return (data ?? []) as StockListingRow[];
}

export async function runStockSyncWorker(
  admin: Admin,
  options: StockSyncOptions,
): Promise<StockSyncResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const dryRun = options.dryRun ?? false;
  const maxActions = resolveMaxActions(options.maxActions);
  const delayMinMs = options.delayMinMs ?? 500;
  const delayMaxMs = options.delayMaxMs ?? 1500;

  const result: StockSyncResult = {
    hideCandidates: 0,
    unhideCandidates: 0,
    hidden: 0,
    unhidden: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const toHide = await loadHideCandidates(admin, profile.id);
  const toUnhide = await loadUnhideCandidates(admin, profile.id);

  result.hideCandidates = toHide.length;
  result.unhideCandidates = toUnhide.length;

  if (toHide.length === 0 && toUnhide.length === 0) {
    console.log("Nema oglasa za hide/unhide.");
    return result;
  }

  let client: OlxClient | null = null;
  if (!dryRun) {
    client = await createClientForProfile(admin, profile);
  }

  const jobRunId = options.jobRunId;

  let actionsDone = 0;

  console.log(
    `Stock sync${dryRun ? " (DRY RUN)" : ""}: hide=${toHide.length}, unhide=${toUnhide.length}.`,
  );

  for (const listing of toHide) {
    if (maxActions != null && actionsDone >= maxActions) break;

    try {
      if (dryRun) {
        console.log(
          `[dry-run] HIDE OLX #${listing.olx_listing_id} "${listing.products?.title}"`,
        );
        result.hidden++;
        actionsDone++;
        continue;
      }

      await client!.hideListing(listing.olx_listing_id);

      await admin
        .from("listings")
        .update({
          status: "hidden",
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);

      result.hidden++;
      actionsDone++;
      console.log(`Sakriveno OLX #${listing.olx_listing_id}`);

      if (maxActions == null || actionsDone < maxActions) {
        await sleep(randomDelayMs(delayMinMs, delayMaxMs));
      }
    } catch (err) {
      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(admin, profile.id, profile.name, err);
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push(`hide #${listing.olx_listing_id}: ${message}`);
      if (jobRunId) {
        await appendJobLog(admin, jobRunId, {
          level: "error",
          message: "Greška hide",
          context: { olxListingId: listing.olx_listing_id, error: message },
        });
      }
      await admin
        .from("listings")
        .update({ error: message, updated_at: new Date().toISOString() })
        .eq("id", listing.id);
    }
  }

  for (const listing of toUnhide) {
    if (maxActions != null && actionsDone >= maxActions) break;

    try {
      if (dryRun) {
        console.log(
          `[dry-run] UNHIDE OLX #${listing.olx_listing_id} "${listing.products?.title}"`,
        );
        result.unhidden++;
        actionsDone++;
        continue;
      }

      await client!.unhideListing(listing.olx_listing_id);

      await admin
        .from("listings")
        .update({
          status: "active",
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);

      result.unhidden++;
      actionsDone++;
      console.log(`Vraćeno OLX #${listing.olx_listing_id}`);

      if (maxActions == null || actionsDone < maxActions) {
        await sleep(randomDelayMs(delayMinMs, delayMaxMs));
      }
    } catch (err) {
      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(admin, profile.id, profile.name, err);
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push(`unhide #${listing.olx_listing_id}: ${message}`);
      if (jobRunId) {
        await appendJobLog(admin, jobRunId, {
          level: "error",
          message: "Greška unhide",
          context: { olxListingId: listing.olx_listing_id, error: message },
        });
      }
      await admin
        .from("listings")
        .update({ error: message, updated_at: new Date().toISOString() })
        .eq("id", listing.id);
    }
  }

  return result;
}

export async function runStockSyncJob(
  admin: Admin,
  profileId: string,
  options?: { dryRun?: boolean },
): Promise<StockSyncResult> {
  const profile = await loadProfileForWorker(admin, profileId);

  const jobRunId = await startJobRun(admin, {
    job: "sync_stock",
    profileId,
  });
  const startedAt = Date.now();

  try {
    const stats = await runStockSyncWorker(admin, {
      profileId,
      dryRun: options?.dryRun,
      jobRunId,
    });
    const durationMs = Date.now() - startedAt;
    const summary = `hide=${stats.hidden}/${stats.hideCandidates}; unhide=${stats.unhidden}/${stats.unhideCandidates}; greške=${stats.failed}.`;

    const status =
      stats.failed > 0 && stats.hidden + stats.unhidden === 0
        ? "failed"
        : stats.failed > 0
          ? "partial"
          : "success";

    await finishJobRun(admin, jobRunId, {
      status,
      items_processed: stats.hideCandidates + stats.unhideCandidates,
      items_succeeded: stats.hidden + stats.unhidden,
      items_failed: stats.failed,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: stats.failed > 0 ? "warn" : "info",
      message: "sync_stock završen",
      context: { ...stats, durationMs } as unknown as Json,
    });

    if (status === "failed") {
      await notifyJobFailed("sync_stock", profile.name, summary);
    }

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });

    await appendJobLog(admin, jobRunId, {
      level: "error",
      message: "sync_stock neuspješan",
      context: { error: message },
    });

    await notifyJobFailed("sync_stock", profile.name, message);

    throw err;
  }
}
