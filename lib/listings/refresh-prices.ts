import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import { calculateProductPrice } from "@/lib/pricing/context";
import type { OlxClient } from "@/lib/olx/client";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

type ActiveListingRow = {
  id: string;
  product_id: string;
  olx_listing_id: number;
  posted_price: number | null;
  manual_price: number | null;
  products: {
    id: string;
    title: string;
    in_feed: boolean;
  } | null;
};

export type RefreshPricesOptions = {
  profileId: string;
  dryRun?: boolean;
  maxUpdates?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
  jobRunId?: string;
};

export type RefreshPricesResult = {
  scanned: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  errors: string[];
};

function resolveMaxUpdates(explicit?: number): number | null {
  if (explicit != null) return explicit;
  const fromEnv = process.env.REFRESH_PRICES_MAX_PER_RUN;
  if (fromEnv != null && fromEnv !== "") {
    const n = Number(fromEnv);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

async function loadActiveListings(
  admin: Admin,
  profileId: string,
): Promise<ActiveListingRow[]> {
  const { data, error } = await admin
    .from("listings")
    .select(
      `
      id,
      product_id,
      olx_listing_id,
      posted_price,
      manual_price,
      products (
        id,
        title,
        in_feed
      )
    `,
    )
    .eq("profile_id", profileId)
    .eq("status", "active")
    .not("olx_listing_id", "is", null)
    .not("product_id", "is", null);

  if (error) {
    throw new Error(`Učitavanje aktivnih oglasa nije uspjelo: ${error.message}`);
  }

  return (data ?? []) as ActiveListingRow[];
}

export async function runRefreshPricesWorker(
  admin: Admin,
  options: RefreshPricesOptions,
): Promise<RefreshPricesResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const dryRun = options.dryRun ?? false;
  const maxUpdates = resolveMaxUpdates(options.maxUpdates);
  const delayMinMs = options.delayMinMs ?? 500;
  const delayMaxMs = options.delayMaxMs ?? 1500;

  const result: RefreshPricesResult = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const listings = await loadActiveListings(admin, profile.id);
  if (listings.length === 0) {
    console.log("Nema aktivnih oglasa za osvježavanje cijena.");
    return result;
  }

  let client: OlxClient | null = null;
  if (!dryRun) {
    client = await createClientForProfile(admin, profile);
  }

  const jobRunId = options.jobRunId;

  console.log(
    `Osvježavanje cijena: ${listings.length} oglasa${dryRun ? " (DRY RUN)" : ""}${maxUpdates != null ? `, max ${maxUpdates} update-a` : ""}.`,
  );

  for (const listing of listings) {
    if (maxUpdates != null && result.updated >= maxUpdates) break;

    result.scanned++;

    if (!listing.product_id || !listing.olx_listing_id) {
      result.skipped++;
      continue;
    }

    if (listing.manual_price != null) {
      result.skipped++;
      continue;
    }

    if (!listing.products?.in_feed) {
      result.skipped++;
      continue;
    }

    try {
      const pricing = await calculateProductPrice(
        admin,
        profile.id,
        listing.product_id,
        { applyVariance: true },
      );

      const currentPrice = listing.posted_price != null
        ? Math.round(Number(listing.posted_price))
        : null;
      const newPrice = pricing.finalPrice;

      if (currentPrice === newPrice) {
        result.unchanged++;
        await admin
          .from("listings")
          .update({
            last_price_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", listing.id);
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] OLX #${listing.olx_listing_id} "${listing.products.title}": ${currentPrice ?? "?"} → ${newPrice} KM`,
        );
        result.updated++;
        continue;
      }

      await client!.updateListing(listing.olx_listing_id, { price: newPrice });

      await admin
        .from("listings")
        .update({
          posted_price: newPrice,
          price_origin: pricing.origin,
          was_import: pricing.wasImport,
          last_price_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", listing.id);

      result.updated++;
      console.log(
        `Ažurirano OLX #${listing.olx_listing_id}: ${currentPrice ?? "?"} → ${newPrice} KM`,
      );

      if (maxUpdates == null || result.updated < maxUpdates) {
        await sleep(randomDelayMs(delayMinMs, delayMaxMs));
      }
    } catch (err) {
      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(admin, profile.id, profile.name, err);
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push(`#${listing.olx_listing_id}: ${message}`);
      console.error(`Greška OLX #${listing.olx_listing_id}: ${message}`);

      if (jobRunId) {
        await appendJobLog(admin, jobRunId, {
          level: "error",
          message: "Greška refresh cijene",
          context: {
            olxListingId: listing.olx_listing_id,
            productId: listing.product_id,
            error: message,
          },
        });
      }

      await admin
        .from("listings")
        .update({
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);
    }
  }

  return result;
}

export async function runRefreshPricesJob(
  admin: Admin,
  profileId: string,
  options?: { dryRun?: boolean },
): Promise<RefreshPricesResult> {
  const profile = await loadProfileForWorker(admin, profileId);

  const jobRunId = await startJobRun(admin, {
    job: "refresh_prices",
    profileId,
  });
  const startedAt = Date.now();

  try {
    const stats = await runRefreshPricesWorker(admin, {
      profileId,
      dryRun: options?.dryRun,
      jobRunId,
    });
    const durationMs = Date.now() - startedAt;
    const summary = `Skenirano=${stats.scanned}; ažurirano=${stats.updated}; isto=${stats.unchanged}; preskočeno=${stats.skipped}; greške=${stats.failed}.`;

    const status =
      stats.failed > 0 && stats.updated === 0
        ? "failed"
        : stats.failed > 0
          ? "partial"
          : "success";

    await finishJobRun(admin, jobRunId, {
      status,
      items_processed: stats.scanned,
      items_succeeded: stats.updated + stats.unchanged,
      items_failed: stats.failed,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: stats.failed > 0 ? "warn" : "info",
      message: "refresh_prices završen",
      context: { ...stats, durationMs } as unknown as Json,
    });

    if (status === "failed") {
      await notifyJobFailed("refresh_prices", profile.name, summary);
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
      message: "refresh_prices neuspješan",
      context: { error: message },
    });

    await notifyJobFailed("refresh_prices", profile.name, message);

    throw err;
  }
}
