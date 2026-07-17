import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTitleIndex,
  findProductForOlxListing,
  type TitleMatchProduct,
} from "@/lib/listings/match-title";
import type { OlxClient } from "@/lib/olx/client";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

const PAGE_DELAY_MS = 350;

async function getMappedOlxCategoryIds(admin: Admin): Promise<number[]> {
  const { data, error } = await admin
    .from("categories")
    .select("olx_category_id")
    .not("olx_category_id", "is", null);

  if (error) {
    throw new Error(`Učitavanje mapiranih kategorija nije uspjelo: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => Number(row.olx_category_id))
    .filter((id) => Number.isFinite(id));
}

export type ImportFromOlxResult = {
  pages: number;
  olxTotal: number;
  matched: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmatched: number;
};

async function loadProductsForMatching(admin: Admin): Promise<TitleMatchProduct[]> {
  const { data, error } = await admin
    .from("products")
    .select(
      `
      id,
      feed_uuid,
      title,
      categories (
        olx_category_id
      )
    `,
    )
    .eq("in_feed", true);

  if (error) {
    throw new Error(`Učitavanje proizvoda za import nije uspjelo: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    feed_uuid: row.feed_uuid,
    title: row.title,
    olxCategoryId: row.categories?.olx_category_id
      ? Number(row.categories.olx_category_id)
      : null,
  }));
}

export async function importListingsFromOlx(
  admin: Admin,
  client: OlxClient,
  profileId: string,
  username: string,
): Promise<ImportFromOlxResult> {
  const products = await loadProductsForMatching(admin);
  const { index, byCategory } = buildTitleIndex(products);
  const mappedCategories = await getMappedOlxCategoryIds(admin);

  if (mappedCategories.length === 0) {
    console.log("Nema mapiranih OLX kategorija — import preskočen.");
    return {
      pages: 0,
      olxTotal: 0,
      matched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      unmatched: 0,
    };
  }

  console.log(
    `Import samo mapiranih kategorija: ${mappedCategories.join(", ")}`,
  );

  const { data: existingRows } = await admin
    .from("listings")
    .select("product_id, olx_listing_id")
    .eq("profile_id", profileId);

  const byProduct = new Map(
    (existingRows ?? []).map((r) => [r.product_id, r.olx_listing_id]),
  );
  const byOlxId = new Set(
    (existingRows ?? [])
      .map((r) => r.olx_listing_id)
      .filter((id): id is number => id != null),
  );

  let pages = 0;
  let olxTotal = 0;
  let matched = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let unmatched = 0;

  const mappedSet = new Set(mappedCategories);
  const pendingProductIds = new Set(
    products
      .filter((p) => p.olxCategoryId != null && mappedSet.has(p.olxCategoryId))
      .map((p) => p.id)
      .filter((id) => !byProduct.has(id)),
  );

  console.log(
    `Proizvoda bez zapisa u listings: ${pendingProductIds.size} (mapirane kategorije)`,
  );

  let page = 1;
  let lastPage = 1;

  do {
    const res = await client.getUserListings(username, page);
    olxTotal += res.data.length;
    lastPage = res.meta.last_page;
    pages++;

    for (const olx of res.data) {
      if (byOlxId.has(olx.id)) {
        skipped++;
        continue;
      }

      const product = findProductForOlxListing(
        index,
        olx.title,
        olx.category_id,
        byCategory,
      );

      if (!product || !mappedSet.has(product.olxCategoryId ?? -1)) {
        unmatched++;
        continue;
      }

      matched++;

      const existingOlxId = byProduct.get(product.id);
      if (existingOlxId === olx.id) {
        skipped++;
        pendingProductIds.delete(product.id);
        continue;
      }

      const { error } = await admin.from("listings").upsert(
        {
          profile_id: profileId,
          product_id: product.id,
          feed_uuid: product.feed_uuid,
          olx_listing_id: olx.id,
          status: olx.status === "active" ? "active" : "draft",
          posted_price: olx.price,
          last_published_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,product_id" },
      );

      if (error) {
        skipped++;
        continue;
      }

      byProduct.set(product.id, olx.id);
      byOlxId.add(olx.id);
      pendingProductIds.delete(product.id);
      if (existingOlxId == null) inserted++;
      else updated++;
    }

    if (page % 25 === 0 || page === lastPage || pendingProductIds.size === 0) {
      console.log(
        `Import: stranica ${page}/${lastPage} (matched=${matched}, novi=${inserted}, preostalo=${pendingProductIds.size})`,
      );
    }

    if (pendingProductIds.size === 0) {
      console.log("Svi mapirani proizvodi pronađeni na OLX-u — raniji izlaz.");
      break;
    }

    page++;
    if (page <= lastPage) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  } while (page <= lastPage);

  return {
    pages,
    olxTotal,
    matched,
    inserted,
    updated,
    skipped,
    unmatched,
  };
}
