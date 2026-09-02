import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import { assertOlxAllowed } from "@/lib/olx/net-guard";
import {
  DEFAULT_PRICE_BUCKETS,
  fetchPriceBucket,
  type PriceRange,
} from "@/lib/olx/price-buckets";
import { generateBrowserIdentity } from "@/lib/profile/browser-identity";
import { paginationForRun } from "@/lib/profile/pagination";
import { loadCompetitorSellers } from "@/lib/pricing/competitor/sellers";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

const SEARCH_BASE = "https://olx.ba/api/search";
const UPSERT_BATCH = 500;
/** Anti-detekcija: bez fiksnog razmaka — jitter umjesto konstantnih 120 ms. */
const DELAY_MIN_MS = 90;
const DELAY_MAX_MS = 180;

/** @deprecated Koristi DEFAULT_PRICE_BUCKETS iz lib/olx/price-buckets.ts. Ostaje radi kompatibilnosti postojećeg re-exporta. */
export const PRICE_BUCKETS = DEFAULT_PRICE_BUCKETS;

type SearchAd = {
  id: number;
  title: string;
  price: number | null;
  discounted_price: number | null;
  category_id: number | null;
};

export type SyncCompetitorsResult = {
  sellers: number;
  fetched: number;
  upserted: number;
  bucketsSplit: number;
  errors: string[];
};

async function fetchSearchPage(params: {
  userId: number;
  range: PriceRange;
  page: number;
  perPage: number;
  headers: Record<string, string>;
}): Promise<{ ads: SearchAd[]; total: number; lastPage: number }> {
  const qs = new URLSearchParams({
    attr: "",
    attr_encoded: "1",
    user_id: String(params.userId),
    price_from: String(params.range.from),
    per_page: String(params.perPage),
    state: "1",
    page: String(params.page),
    sort_by: "price",
    sort_order: "asc",
  });
  if (params.range.to != null) {
    qs.set("price_to", String(params.range.to));
  }

  const res = await fetch(`${SEARCH_BASE}?${qs}`, { headers: params.headers });

  if (!res.ok) {
    throw new Error(
      `OLX search HTTP ${res.status} user=${params.userId} ` +
        `price=${params.range.from}-${params.range.to ?? "+"} page=${params.page}`,
    );
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: number;
      title?: string;
      price?: number;
      discounted_price_float?: number | null;
      category_id?: number;
    }>;
    meta?: { total?: number; last_page?: number };
  };

  const ads: SearchAd[] = (json.data ?? []).map((row) => {
    const listPrice =
      typeof row.price === "number" ? row.price : Number(row.price) || null;
    const discounted =
      typeof row.discounted_price_float === "number"
        ? row.discounted_price_float
        : listPrice;
    return {
      id: row.id,
      title: row.title ?? "",
      price: listPrice,
      discounted_price: discounted,
      category_id: row.category_id ?? null,
    };
  });

  return {
    ads,
    total: json.meta?.total ?? ads.length,
    lastPage: json.meta?.last_page ?? 1,
  };
}

async function upsertBatch(
  admin: Admin,
  rows: Database["public"]["Tables"]["competitor_listings"]["Insert"][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await admin.from("competitor_listings").upsert(rows, {
    onConflict: "olx_listing_id",
  });
  if (error) {
    throw new Error(`Upsert competitor_listings: ${error.message}`);
  }
  return rows.length;
}

/** Headeri za javni search — koherentan set generisan jednom po run-u (nije vezano za profil). */
function buildRunHeaders(seed: string): Record<string, string> {
  const identity = generateBrowserIdentity(seed);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": identity.acceptLanguage,
    "User-Agent": identity.userAgent,
    "Accept-Encoding": "gzip, deflate, br",
  };
  if (identity.secChUa) headers["sec-ch-ua"] = identity.secChUa;
  if (identity.secChUaMobile) headers["sec-ch-ua-mobile"] = identity.secChUaMobile;
  if (identity.secChUaPlatform) headers["sec-ch-ua-platform"] = identity.secChUaPlatform;
  return headers;
}

/**
 * TRUNCATE + re-fetch all competitor listings via price buckets.
 * Shared across all mode-2 profiles in one refresh cycle.
 */
export async function syncCompetitorListings(
  admin: Admin,
): Promise<SyncCompetitorsResult> {
  assertOlxAllowed("sync-competitor-listings");
  const sellers = await loadCompetitorSellers(admin);
  const result: SyncCompetitorsResult = {
    sellers: sellers.length,
    fetched: 0,
    upserted: 0,
    bucketsSplit: 0,
    errors: [],
  };

  if (sellers.length === 0) {
    console.log("Nema aktivnih competitor_sellers — sync preskočen.");
    return result;
  }

  // Brisanje svih redova (PostgREST nema TRUNCATE; filter pokriva sve ID-eve)
  const { error: truncError } = await admin
    .from("competitor_listings")
    .delete()
    .gte("olx_listing_id", 0);

  if (truncError) {
    throw new Error(
      `Brisanje competitor_listings nije uspjelo: ${truncError.message}`,
    );
  }

  const fetchedAt = new Date().toISOString();
  // Anti-detekcija: per_page i browser identitet se biraju jednom po run-u
  // (ovo je globalan job, nije vezan za jedan profil).
  const { perPage, maxPage } = paginationForRun();
  const headers = buildRunHeaders(`competitor-run:${fetchedAt}`);

  for (const seller of sellers) {
    console.log(
      `Sync competitor ${seller.name} (user_id=${seller.olx_user_id})…`,
    );
    const byId = new Map<number, SearchAd>();

    for (const range of DEFAULT_PRICE_BUCKETS) {
      try {
        await fetchPriceBucket(range, byId, {
          maxPage,
          delay: () => sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS)),
          getId: (ad) => ad.id,
          fetchPage: async (r, page) => {
            const { ads, total, lastPage } = await fetchSearchPage({
              userId: seller.olx_user_id,
              range: r,
              page,
              perPage,
              headers,
            });
            return { items: ads, total, lastPage };
          },
          onBucketSplit: (splitRange, mid, total) => {
            result.bucketsSplit++;
            console.log(
              `  Split bucket ${splitRange.from}-${splitRange.to} (total=${total}) → ${splitRange.from}-${mid}, ${mid}-${splitRange.to}`,
            );
          },
          onBucketDone: (doneRange, info) => {
            console.log(
              `  Bucket ${doneRange.from}-${doneRange.to ?? "+"}: total=${info.total}, collected=${info.collectedSoFar}`,
            );
          },
        });
        await sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${seller.name} ${range.from}-${range.to}: ${msg}`);
        console.error(msg);
      }
    }

    result.fetched += byId.size;

    const rows: Database["public"]["Tables"]["competitor_listings"]["Insert"][] =
      [];
    for (const ad of byId.values()) {
      rows.push({
        olx_listing_id: ad.id,
        seller_user_id: seller.olx_user_id,
        seller_name: seller.name,
        title: ad.title,
        category_id: ad.category_id,
        price: ad.price,
        discounted_price: ad.discounted_price,
        fetched_at: fetchedAt,
      });
    }

    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const chunk = rows.slice(i, i + UPSERT_BATCH);
      result.upserted += await upsertBatch(admin, chunk);
    }

    console.log(`  ${seller.name}: upserted ${byId.size} listings`);
  }

  return result;
}
