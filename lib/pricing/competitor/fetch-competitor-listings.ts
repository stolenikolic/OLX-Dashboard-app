import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCompetitorSellers } from "@/lib/pricing/competitor/sellers";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

const SEARCH_BASE = "https://olx.ba/api/search";
const PER_PAGE = 1000;
const MAX_PAGE = 10;
const ES_LIMIT = 10_000;
const DELAY_MS = 120;
const UPSERT_BATCH = 500;

/** Price buckets to stay under ES 10k window. Last is open-ended. */
export const PRICE_BUCKETS: Array<{ from: number; to: number | null }> = [
  { from: 1, to: 50 },
  { from: 50, to: 90 },
  { from: 90, to: 130 },
  { from: 130, to: 250 },
  { from: 250, to: 800 },
  { from: 800, to: null },
];

type SearchAd = {
  id: number;
  title: string;
  price: number | null;
  discounted_price: number | null;
  category_id: number | null;
};

type SearchPage = {
  ads: SearchAd[];
  total: number;
  lastPage: number;
};

export type SyncCompetitorsResult = {
  sellers: number;
  fetched: number;
  upserted: number;
  bucketsSplit: number;
  errors: string[];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSearchPage(params: {
  userId: number;
  priceFrom: number;
  priceTo: number | null;
  page: number;
}): Promise<SearchPage> {
  const qs = new URLSearchParams({
    attr: "",
    attr_encoded: "1",
    user_id: String(params.userId),
    price_from: String(params.priceFrom),
    per_page: String(PER_PAGE),
    state: "1",
    page: String(params.page),
    sort_by: "price",
    sort_order: "asc",
  });
  if (params.priceTo != null) {
    qs.set("price_to", String(params.priceTo));
  }

  const res = await fetch(`${SEARCH_BASE}?${qs}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(
      `OLX search HTTP ${res.status} user=${params.userId} ` +
        `price=${params.priceFrom}-${params.priceTo ?? "+"} page=${params.page}`,
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

async function fetchBucket(
  userId: number,
  priceFrom: number,
  priceTo: number | null,
  into: Map<number, SearchAd>,
  stats: { bucketsSplit: number },
): Promise<void> {
  const first = await fetchSearchPage({
    userId,
    priceFrom,
    priceTo,
    page: 1,
  });

  // Auto-split if ES window would truncate results.
  if (
    first.total > ES_LIMIT &&
    priceTo != null &&
    priceTo - priceFrom > 1
  ) {
    stats.bucketsSplit++;
    const mid = Math.floor((priceFrom + priceTo) / 2);
    console.log(
      `  Split bucket ${priceFrom}-${priceTo} (total=${first.total}) → ${priceFrom}-${mid}, ${mid}-${priceTo}`,
    );
    await fetchBucket(userId, priceFrom, mid, into, stats);
    await sleep(DELAY_MS);
    await fetchBucket(userId, mid, priceTo, into, stats);
    return;
  }

  for (const ad of first.ads) into.set(ad.id, ad);

  const lastPage = Math.min(first.lastPage, MAX_PAGE);
  for (let page = 2; page <= lastPage; page++) {
    await sleep(DELAY_MS);
    const { ads } = await fetchSearchPage({
      userId,
      priceFrom,
      priceTo,
      page,
    });
    if (ads.length === 0) break;
    for (const ad of ads) into.set(ad.id, ad);
  }

  console.log(
    `  Bucket ${priceFrom}-${priceTo ?? "+"}: total=${first.total}, collected=${into.size}`,
  );
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

/**
 * TRUNCATE + re-fetch all competitor listings via price buckets.
 * Shared across all mode-2 profiles in one refresh cycle.
 */
export async function syncCompetitorListings(
  admin: Admin,
): Promise<SyncCompetitorsResult> {
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
    // Fallback: delete all via filter that matches everything
    throw new Error(
      `Brisanje competitor_listings nije uspjelo: ${truncError.message}`,
    );
  }

  const fetchedAt = new Date().toISOString();

  for (const seller of sellers) {
    console.log(
      `Sync competitor ${seller.name} (user_id=${seller.olx_user_id})…`,
    );
    const byId = new Map<number, SearchAd>();

    for (const bucket of PRICE_BUCKETS) {
      try {
        await fetchBucket(
          seller.olx_user_id,
          bucket.from,
          bucket.to,
          byId,
          result,
        );
        await sleep(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${seller.name} ${bucket.from}-${bucket.to}: ${msg}`);
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

    console.log(
      `  ${seller.name}: upserted ${byId.size} listings`,
    );
  }

  return result;
}
