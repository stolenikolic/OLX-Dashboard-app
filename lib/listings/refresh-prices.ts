import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  isJobDisabledError,
  recordJobSkipped,
} from "@/lib/workers/jobs-enabled";
import { getPacing } from "@/lib/workers/job-pacing";
import { scheduleNextRun } from "@/lib/workers/job-schedule";
import { sortByProfileOrder } from "@/lib/workers/profile-shuffle";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import {
  buildCompetitorIndex,
  findCompetitorMin,
  type CompetitorIndex,
} from "@/lib/pricing/competitor";
import {
  loadProfilePriceMode,
  resolveProductListingPrice,
} from "@/lib/pricing/context";
import type { PriceMode } from "@/lib/pricing";
import type { OlxClient } from "@/lib/olx/client";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

type ActiveListingRow = {
  id: string;
  product_id: string;
  olx_listing_id: number;
  posted_price: number | null;
  manual_price: number | null;
  last_price_sync_at: string | null;
  products: {
    id: string;
    title: string;
    in_feed: boolean;
    categories: {
      olx_category_id: number | null;
    } | null;
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
  /** Oglasi koji nisu stigli u ovaj run — signal da pass nije završen. */
  remaining: number;
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

/**
 * Katalog od ~13k oglasa se ne može obraditi u jednom GHA runu, pa se dijeli na
 * batcheve. Redoslijed ide po last_price_sync_at, tako da svaki run nastavi tamo
 * gdje je prethodni stao, a ostatak se rasporedi na sljedeći dan.
 */
const DEFAULT_BATCH_SIZE = 3000;

/** Ispod GHA timeouta (90 min), da finishJobRun uvijek stigne da se izvrši. */
const DEFAULT_TIME_BUDGET_MS = 55 * 60 * 1000;

function resolveEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PAGE_SIZE = 1000;

const ACTIVE_LISTING_SELECT = `
  id,
  product_id,
  olx_listing_id,
  posted_price,
  manual_price,
  last_price_sync_at,
  products!inner (
    id,
    title,
    in_feed,
    categories (
      olx_category_id
    )
  )
`;

/**
 * Oglasi sa manual_price ili proizvodom van feed-a se ionako preskaču u petlji.
 * Sa batchom bi trajno sjedili na početku redoslijeda i pojeli cijeli budžet,
 * pa se filtriraju već u upitu.
 */
async function countRefreshableListings(
  admin: Admin,
  profileId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("listings")
    .select("id, products!inner(in_feed)", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("status", "active")
    .not("olx_listing_id", "is", null)
    .not("product_id", "is", null)
    .is("manual_price", null)
    .eq("products.in_feed", true);

  if (error) {
    throw new Error(`Brojanje aktivnih oglasa nije uspjelo: ${error.message}`);
  }

  return count ?? 0;
}

async function loadActiveListings(
  admin: Admin,
  profileId: string,
  limit: number,
): Promise<ActiveListingRow[]> {
  const all: ActiveListingRow[] = [];
  let from = 0;

  while (all.length < limit) {
    const pageSize = Math.min(PAGE_SIZE, limit - all.length);
    const { data, error } = await admin
      .from("listings")
      .select(ACTIVE_LISTING_SELECT)
      .eq("profile_id", profileId)
      .eq("status", "active")
      .not("olx_listing_id", "is", null)
      .not("product_id", "is", null)
      .is("manual_price", null)
      .eq("products.in_feed", true)
      .order("last_price_sync_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `Učitavanje aktivnih oglasa nije uspjelo: ${error.message}`,
      );
    }

    const rows = (data ?? []) as unknown as ActiveListingRow[];
    all.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  // Batch je odabran po starosti, ali se unutar runa obrađuje u per-profil
  // izmiješanom redoslijedu (anti-korelacija).
  sortByProfileOrder(all, profileId, (row) => row.id);
  return all;
}

export async function runRefreshPricesWorker(
  admin: Admin,
  options: RefreshPricesOptions,
): Promise<RefreshPricesResult> {
  const profile = await loadProfileForWorker(admin, options.profileId, {
    job: "refresh_prices",
  });
  const dryRun = options.dryRun ?? false;
  const maxUpdates = resolveMaxUpdates(options.maxUpdates);
  const pacing = getPacing(profile, "refresh_prices");
  const delayMinMs = options.delayMinMs ?? pacing.minMs;
  const delayMaxMs = options.delayMaxMs ?? pacing.maxMs;
  console.log(`Pacing refresh_prices: ${delayMinMs}–${delayMaxMs} ms`);

  const result: RefreshPricesResult = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
    errors: [],
  };

  const batchSize = resolveEnvNumber(
    "REFRESH_PRICES_BATCH_SIZE",
    DEFAULT_BATCH_SIZE,
  );
  const timeBudgetMs = resolveEnvNumber(
    "REFRESH_PRICES_TIME_BUDGET_MS",
    DEFAULT_TIME_BUDGET_MS,
  );
  const deadline = Date.now() + timeBudgetMs;

  const total = await countRefreshableListings(admin, profile.id);
  const listings = await loadActiveListings(admin, profile.id, batchSize);
  if (listings.length === 0) {
    console.log("Nema aktivnih oglasa za osvježavanje cijena.");
    return result;
  }

  console.log(
    `Batch ${listings.length}/${total} oglasa, budžet ${Math.round(timeBudgetMs / 60_000)} min.`,
  );

  const priceMode: PriceMode = await loadProfilePriceMode(admin, profile.id);

  let competitorIndex: CompetitorIndex | null = null;
  if (priceMode === "competitor_minus_1") {
    competitorIndex = await buildCompetitorIndex(admin);
  }

  let client: OlxClient | null = null;
  if (!dryRun) {
    client = await createClientForProfile(admin, profile);
  }

  const jobRunId = options.jobRunId;

  console.log(
    `Osvježavanje cijena (${priceMode}): ${listings.length} oglasa` +
      `${dryRun ? " (DRY RUN)" : ""}` +
      `${maxUpdates != null ? `, max ${maxUpdates} update-a` : ""}.`,
  );

  for (const listing of listings) {
    if (maxUpdates != null && result.updated >= maxUpdates) break;

    if (Date.now() >= deadline) {
      console.log(
        `Vremenski budžet potrošen nakon ${result.scanned} oglasa; ostatak ide u sljedeći run.`,
      );
      break;
    }

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
      const title = listing.products.title;
      const olxCategoryId =
        listing.products.categories?.olx_category_id != null
          ? Number(listing.products.categories.olx_category_id)
          : null;

      const competitorMin =
        priceMode === "competitor_minus_1" && competitorIndex
          ? findCompetitorMin(competitorIndex, title, olxCategoryId)
          : null;

      const pricing = await resolveProductListingPrice(
        admin,
        profile.id,
        listing.product_id,
        {
          mode: priceMode,
          competitorMin,
          applyVariance: true,
        },
      );

      const currentPrice =
        listing.posted_price != null
          ? Math.round(Number(listing.posted_price))
          : null;
      const newPrice = pricing.finalPrice;

      if (currentPrice === newPrice) {
        result.unchanged++;
        await admin
          .from("listings")
          .update({
            last_price_sync_at: new Date().toISOString(),
            competitor_price: competitorMin?.price ?? null,
            competitor_seller_id: competitorMin?.sellerId ?? null,
            competitor_matched_title: competitorMin?.matchedTitle ?? null,
            price_floor_applied: pricing.floorApplied,
            updated_at: new Date().toISOString(),
          })
          .eq("id", listing.id);
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] OLX #${listing.olx_listing_id} "${title}": ` +
            `${currentPrice ?? "?"} → ${newPrice} KM ` +
            `(target=${pricing.target}, floor=${pricing.floor}, ` +
            `comp=${competitorMin?.price ?? "—"}, floorApplied=${pricing.floorApplied})`,
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
          competitor_price: competitorMin?.price ?? null,
          competitor_seller_id: competitorMin?.sellerId ?? null,
          competitor_matched_title: competitorMin?.matchedTitle ?? null,
          price_floor_applied: pricing.floorApplied,
          updated_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", listing.id);

      result.updated++;
      console.log(
        `Ažurirano OLX #${listing.olx_listing_id}: ${currentPrice ?? "?"} → ${newPrice} KM` +
          ` (target=${pricing.target}, floor=${pricing.floor}, comp=${competitorMin?.price ?? "—"})`,
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

      // I neuspjeli oglas mora pomjeriti kursor, inače trajno blokira batch.
      await admin
        .from("listings")
        .update({
          error: message,
          last_price_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id);
    }
  }

  result.remaining = Math.max(0, total - result.scanned);
  return result;
}

export async function runRefreshPricesJob(
  admin: Admin,
  profileId: string,
  options?: { dryRun?: boolean },
): Promise<RefreshPricesResult> {
  let profile;
  try {
    profile = await loadProfileForWorker(admin, profileId, {
      job: "refresh_prices",
    });
  } catch (err) {
    if (isJobDisabledError(err)) {
      await recordJobSkipped(admin, {
        job: "refresh_prices",
        profileId,
        profileName: err.profileName,
      });
      return {
        scanned: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        failed: 0,
        remaining: 0,
        errors: [],
      };
    }
    throw err;
  }

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
    const summary =
      `Skenirano=${stats.scanned}; ažurirano=${stats.updated}; isto=${stats.unchanged}; ` +
      `preskočeno=${stats.skipped}; greške=${stats.failed}; ostalo=${stats.remaining}.`;

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

    if (status === "success" || status === "partial") {
      // Nedovršen pass se vraća već sutra, umjesto da čeka cijeli interval.
      await scheduleNextRun(
        admin,
        profile,
        "refresh_prices",
        undefined,
        stats.remaining > 0 ? { overrideIntervalDays: 1 } : undefined,
      );
    }

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
