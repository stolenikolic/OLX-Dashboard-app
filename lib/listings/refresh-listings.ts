import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import {
  DEFAULT_REFRESH_SCORE_CONFIG,
  aggregateInquiries,
  categoryDemandScores,
  remainingDaysInMonth,
  scoreListings,
  type CatalogListing,
  type DbListingInfo,
  type InquiryEvent,
  type RefreshScoreConfig,
  type ScoredListing,
} from "@/lib/listings/refresh-score";
import type { OlxClient } from "@/lib/olx/client";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

const DELAY_MIN_MS = 300;
const DELAY_MAX_MS = 800;
const PAGE_SIZE = 1000;
/** OLX free manual refresh cooldown (shop packages). */
const REFRESH_COOLDOWN_DAYS = 7;

export type RefreshListingsOptions = {
  profileId: string;
  dryRun?: boolean;
  maxRefreshes?: number;
  jobRunId?: string;
};

export type RefreshListingsResult = {
  freeLimit: number;
  freeCount: number;
  remaining: number;
  dailyCap: number;
  catalogSize: number;
  candidates: number;
  refreshed: number;
  skipped: number;
  failed: number;
  topScores: Array<{
    olxListingId: number;
    score: number;
    inquiryRaw: number;
    price: number;
  }>;
  errors: string[];
};

function resolveMaxRefreshes(explicit?: number): number | null {
  if (explicit != null) {
    if (!Number.isFinite(explicit)) return null;
    return Math.max(0, explicit);
  }
  const fromEnv = process.env.REFRESH_LISTINGS_MAX_PER_RUN;
  if (fromEnv != null && fromEnv !== "") {
    const n = Number(fromEnv);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

function isLocallyRefreshAvailable(
  lastRefreshedAt: string | null,
  nowMs = Date.now(),
): boolean {
  if (!lastRefreshedAt) return true;
  const ageMs = nowMs - new Date(lastRefreshedAt).getTime();
  return ageMs >= REFRESH_COOLDOWN_DAYS * 86_400_000;
}

async function loadScoreConfig(
  admin: Admin,
  profileId: string,
): Promise<RefreshScoreConfig> {
  const { data: settings } = await admin
    .from("app_settings")
    .select(
      `
      refresh_enabled,
      refresh_w_inquiry,
      refresh_w_category,
      refresh_w_value,
      refresh_w_staleness,
      refresh_inquiry_window_days,
      refresh_inquiry_halflife_days,
      refresh_staleness_cap_days,
      refresh_unmapped_penalty
    `,
    )
    .eq("id", 1)
    .maybeSingle();

  const base: RefreshScoreConfig = {
    wInquiry: Number(
      settings?.refresh_w_inquiry ?? DEFAULT_REFRESH_SCORE_CONFIG.wInquiry,
    ),
    wCategory: Number(
      settings?.refresh_w_category ?? DEFAULT_REFRESH_SCORE_CONFIG.wCategory,
    ),
    wValue: Number(
      settings?.refresh_w_value ?? DEFAULT_REFRESH_SCORE_CONFIG.wValue,
    ),
    wStaleness: Number(
      settings?.refresh_w_staleness ?? DEFAULT_REFRESH_SCORE_CONFIG.wStaleness,
    ),
    inquiryWindowDays: Number(
      settings?.refresh_inquiry_window_days ??
        DEFAULT_REFRESH_SCORE_CONFIG.inquiryWindowDays,
    ),
    inquiryHalflifeDays: Number(
      settings?.refresh_inquiry_halflife_days ??
        DEFAULT_REFRESH_SCORE_CONFIG.inquiryHalflifeDays,
    ),
    stalenessCapDays: Number(
      settings?.refresh_staleness_cap_days ??
        DEFAULT_REFRESH_SCORE_CONFIG.stalenessCapDays,
    ),
    unmappedPenalty: Number(
      settings?.refresh_unmapped_penalty ??
        DEFAULT_REFRESH_SCORE_CONFIG.unmappedPenalty,
    ),
  };

  if (settings && settings.refresh_enabled === false) {
    throw new Error(
      "Automatsko obnavljanje oglasa je isključeno (app_settings.refresh_enabled=false).",
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("refresh_overrides")
    .eq("id", profileId)
    .maybeSingle();

  const overrides = profile?.refresh_overrides;
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    const o = overrides as Record<string, unknown>;
    if (typeof o.wInquiry === "number") base.wInquiry = o.wInquiry;
    if (typeof o.wCategory === "number") base.wCategory = o.wCategory;
    if (typeof o.wValue === "number") base.wValue = o.wValue;
    if (typeof o.wStaleness === "number") base.wStaleness = o.wStaleness;
    if (typeof o.inquiryWindowDays === "number")
      base.inquiryWindowDays = o.inquiryWindowDays;
    if (typeof o.inquiryHalflifeDays === "number")
      base.inquiryHalflifeDays = o.inquiryHalflifeDays;
    if (typeof o.stalenessCapDays === "number")
      base.stalenessCapDays = o.stalenessCapDays;
    if (typeof o.unmappedPenalty === "number")
      base.unmappedPenalty = o.unmappedPenalty;
  }

  return base;
}

/**
 * Katalog iz naše baze (mapirani + unmapped listings sa olx_listing_id).
 * refresh_available = lokalni 7-dnevni cooldown od last_refreshed_at.
 */
async function loadDbCatalog(
  admin: Admin,
  profileId: string,
  nowMs = Date.now(),
): Promise<{
  catalog: CatalogListing[];
  dbMap: Map<number, DbListingInfo>;
}> {
  const catalog: CatalogListing[] = [];
  const dbMap = new Map<number, DbListingInfo>();
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("listings")
      .select(
        `
        id,
        olx_listing_id,
        status,
        posted_price,
        last_refreshed_at,
        last_published_at,
        product_id,
        products (
          in_feed,
          blacklisted,
          categories (
            olx_category_id
          )
        )
      `,
      )
      .eq("profile_id", profileId)
      .eq("status", "active")
      .not("olx_listing_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Učitavanje listings nije uspjelo: ${error.message}`);
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (row.olx_listing_id == null) continue;

      const product = row.products as
        | {
            in_feed: boolean;
            blacklisted: boolean;
            categories: { olx_category_id: number | null } | null;
          }
        | null
        | undefined;

      const unmapped = row.product_id == null || product == null;
      const categoryId = product?.categories?.olx_category_id
        ? Number(product.categories.olx_category_id)
        : 0;
      const price = row.posted_price != null ? Number(row.posted_price) : 0;
      const refreshAvailable = isLocallyRefreshAvailable(
        row.last_refreshed_at,
        nowMs,
      );

      let olxDate: number | null = null;
      const stamp = row.last_refreshed_at ?? row.last_published_at;
      if (stamp) {
        olxDate = Math.floor(new Date(stamp).getTime() / 1000);
      }

      dbMap.set(row.olx_listing_id, {
        listingId: row.id,
        inFeed: unmapped ? null : (product?.in_feed ?? null),
        blacklisted: product?.blacklisted ?? false,
        lastRefreshedAt: row.last_refreshed_at,
        unmapped,
      });

      catalog.push({
        olxListingId: row.olx_listing_id,
        categoryId,
        price,
        status: row.status,
        refreshAvailable,
        olxDate,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { catalog, dbMap };
}

async function loadInquiryEvents(
  admin: Admin,
  profileId: string,
  windowDays: number,
): Promise<InquiryEvent[]> {
  const since = new Date(
    Date.now() - windowDays * 86_400_000,
  ).toISOString();
  const events: InquiryEvent[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("conversations")
      .select("olx_listing_id, olx_category_id, inquiry_at")
      .eq("profile_id", profileId)
      .eq("is_system", false)
      .not("olx_listing_id", "is", null)
      .not("inquiry_at", "is", null)
      .gte("inquiry_at", since)
      .order("inquiry_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Učitavanje upita nije uspjelo: ${error.message}`);
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (row.olx_listing_id == null || row.inquiry_at == null) continue;
      events.push({
        olxListingId: row.olx_listing_id,
        olxCategoryId: row.olx_category_id,
        inquiryAt: row.inquiry_at,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return events;
}

async function cacheRefreshLimits(
  admin: Admin,
  profileId: string,
  freeLimit: number,
  freeCount: number,
): Promise<void> {
  await admin
    .from("profiles")
    .update({
      refresh_free_limit: freeLimit,
      refresh_free_count: freeCount,
      refresh_limits_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
}

export async function runRefreshListingsWorker(
  admin: Admin,
  options: RefreshListingsOptions,
): Promise<RefreshListingsResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const dryRun = options.dryRun ?? false;
  const maxRefreshes = resolveMaxRefreshes(options.maxRefreshes);

  const config = await loadScoreConfig(admin, profile.id);
  const client = await createClientForProfile(admin, profile);

  let limits;
  try {
    limits = await client.getRefreshLimits();
  } catch (err) {
    if (isAuthFailure(err)) {
      await handleOlxAuthFailure(admin, profile.id, profile.name, err);
    }
    throw err;
  }

  const remaining = Math.max(0, limits.free_limit - limits.free_count);
  await cacheRefreshLimits(
    admin,
    profile.id,
    limits.free_limit,
    limits.free_count,
  );

  const daysLeft = remainingDaysInMonth();
  let dailyCap = Math.floor(remaining / daysLeft);
  if (maxRefreshes != null) {
    dailyCap = Math.min(dailyCap, maxRefreshes);
  }
  dailyCap = Math.min(dailyCap, remaining);

  const result: RefreshListingsResult = {
    freeLimit: limits.free_limit,
    freeCount: limits.free_count,
    remaining,
    dailyCap,
    catalogSize: 0,
    candidates: 0,
    refreshed: 0,
    skipped: 0,
    failed: 0,
    topScores: [],
    errors: [],
  };

  if (dailyCap <= 0) {
    console.log(
      `Refresh listings: budžet 0 (free=${limits.free_count}/${limits.free_limit}).`,
    );
    return result;
  }

  console.log(
    `Refresh listings: remaining=${remaining}, daysLeft=${daysLeft}, dailyCap=${dailyCap}` +
      (dryRun ? " (DRY RUN)" : "") +
      " [DB katalog]",
  );

  const [{ catalog, dbMap }, inquiryEvents] = await Promise.all([
    loadDbCatalog(admin, profile.id),
    loadInquiryEvents(admin, profile.id, config.inquiryWindowDays),
  ]);
  result.catalogSize = catalog.length;

  const { byListing, byCategory } = aggregateInquiries(inquiryEvents, config);

  const activeCountByCat = new Map<number, number>();
  for (const c of catalog) {
    if (c.status === "active") {
      activeCountByCat.set(
        c.categoryId,
        (activeCountByCat.get(c.categoryId) ?? 0) + 1,
      );
    }
  }
  const catDemand = categoryDemandScores(byCategory, activeCountByCat);

  const scored = scoreListings(
    catalog,
    dbMap,
    byListing,
    catDemand,
    config,
  );
  result.candidates = scored.length;
  result.topScores = scored.slice(0, 20).map((s) => ({
    olxListingId: s.olxListingId,
    score: Number(s.score.toFixed(4)),
    inquiryRaw: Number(s.inquiryRaw.toFixed(3)),
    price: s.price,
  }));

  console.log(
    `DB katalog=${catalog.length}; kandidata=${scored.length}; ` +
      `top score=${scored[0]?.score.toFixed(4) ?? "n/a"}`,
  );

  if (dryRun) {
    for (const s of scored.slice(0, dailyCap)) {
      console.log(
        `[dry-run] #${s.olxListingId} score=${s.score.toFixed(4)} ` +
          `inq=${s.inquiryRaw.toFixed(2)} cat=${s.categoryRaw.toFixed(3)} ` +
          `val=${s.valueRaw.toFixed(2)} stale=${s.stalenessRaw.toFixed(2)} ` +
          `price=${s.price}` +
          (s.unmapped ? " [unmapped]" : ""),
      );
      result.refreshed++;
    }
    return result;
  }

  let usedThisRun = 0;
  for (const s of scored) {
    if (usedThisRun >= dailyCap) break;
    if (limits.free_count + usedThisRun >= limits.free_limit) {
      console.log("Hard-stop: free_limit dostignut.");
      break;
    }

    try {
      await client.refreshListing(s.olxListingId);
      usedThisRun++;
      result.refreshed++;

      const nowIso = new Date().toISOString();
      await admin.from("refresh_events").insert({
        profile_id: profile.id,
        listing_id: s.listingId,
        olx_listing_id: s.olxListingId,
        refreshed_at: nowIso,
        score_at_time: s.score,
        was_manual: false,
        was_paid: false,
      });

      if (s.listingId) {
        await admin
          .from("listings")
          .update({
            last_refreshed_at: nowIso,
            refresh_available: false,
            refresh_score: s.score,
            last_score_at: nowIso,
            updated_at: nowIso,
            error: null,
          })
          .eq("id", s.listingId);
      }

      console.log(
        `Obnovljeno #${s.olxListingId} score=${s.score.toFixed(4)} (${usedThisRun}/${dailyCap})`,
      );

      if (usedThisRun < dailyCap) {
        await sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      }
    } catch (err) {
      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(admin, profile.id, profile.name, err);
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push(`#${s.olxListingId}: ${message}`);
      console.error(`Greška refresh #${s.olxListingId}: ${message}`);

      if (/refresh|obnov|cooldown|limit/i.test(message) && s.listingId) {
        await admin
          .from("listings")
          .update({
            refresh_available: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", s.listingId);
      }

      if (options.jobRunId) {
        await appendJobLog(admin, options.jobRunId, {
          level: "error",
          message: "Greška refresh oglasa",
          context: {
            olxListingId: s.olxListingId,
            error: message,
          },
        });
      }
    }
  }

  await cacheRefreshLimits(
    admin,
    profile.id,
    limits.free_limit,
    limits.free_count + usedThisRun,
  );

  return result;
}

export async function runRefreshListingsJob(
  admin: Admin,
  profileId: string,
  options?: { dryRun?: boolean; maxRefreshes?: number },
): Promise<RefreshListingsResult> {
  const profile = await loadProfileForWorker(admin, profileId);
  const jobRunId = await startJobRun(admin, {
    job: "refresh_listings",
    profileId,
  });
  const startedAt = Date.now();

  try {
    const stats = await runRefreshListingsWorker(admin, {
      profileId,
      dryRun: options?.dryRun,
      maxRefreshes: options?.maxRefreshes,
      jobRunId,
    });
    const durationMs = Date.now() - startedAt;
    const summary =
      `Budžet=${stats.remaining}/${stats.freeLimit}; cap=${stats.dailyCap}; ` +
      `katalog=${stats.catalogSize}; kandidati=${stats.candidates}; ` +
      `obnovljeno=${stats.refreshed}; greške=${stats.failed}.`;

    const status =
      stats.failed > 0 && stats.refreshed === 0
        ? "failed"
        : stats.failed > 0
          ? "partial"
          : "success";

    await finishJobRun(admin, jobRunId, {
      status,
      items_processed: stats.candidates,
      items_succeeded: stats.refreshed,
      items_failed: stats.failed,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: stats.failed > 0 ? "warn" : "info",
      message: "refresh_listings završen",
      context: {
        ...stats,
        durationMs,
        topScores: stats.topScores,
      } as unknown as Json,
    });

    if (status === "failed") {
      await notifyJobFailed("refresh_listings", profile.name, summary);
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
      message: "refresh_listings neuspješan",
      context: { error: message },
    });
    await notifyJobFailed("refresh_listings", profile.name, message);
    throw err;
  }
}

/** Exposed for manual bump action. */
export async function bumpListingManual(
  admin: Admin,
  client: OlxClient,
  profileId: string,
  listingId: string,
  olxListingId: number,
  allowPaid: boolean,
): Promise<{ wasPaid: boolean }> {
  const limits = await client.getRefreshLimits();
  const remaining = Math.max(0, limits.free_limit - limits.free_count);

  if (remaining <= 0 && !allowPaid) {
    throw new Error(
      "Nema preostalih besplatnih obnavljanja. Potvrdi naplatu da nastaviš.",
    );
  }

  const wasPaid = remaining <= 0;
  await client.refreshListing(olxListingId);

  const nowIso = new Date().toISOString();
  await admin.from("refresh_events").insert({
    profile_id: profileId,
    listing_id: listingId,
    olx_listing_id: olxListingId,
    refreshed_at: nowIso,
    score_at_time: null,
    was_manual: true,
    was_paid: wasPaid,
  });

  await admin
    .from("listings")
    .update({
      last_refreshed_at: nowIso,
      refresh_available: false,
      updated_at: nowIso,
      error: null,
    })
    .eq("id", listingId);

  await cacheRefreshLimits(
    admin,
    profileId,
    limits.free_limit,
    wasPaid ? limits.free_count : limits.free_count + 1,
  );

  return { wasPaid };
}

export type { ScoredListing };
