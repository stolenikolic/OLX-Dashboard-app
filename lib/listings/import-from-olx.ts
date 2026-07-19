import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllUserListings } from "@/lib/listings/fetch-user-listings";
import {
  buildTitleIndex,
  findProductForOlxListing,
  type TitleMatchProduct,
} from "@/lib/listings/match-title";
import type { OlxClient } from "@/lib/olx/client";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

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

const PAGE_SIZE = 1000;

async function loadProductsForMatching(admin: Admin): Promise<TitleMatchProduct[]> {
  const products: TitleMatchProduct[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
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
      .eq("in_feed", true)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Učitavanje proizvoda za import nije uspjelo: ${error.message}`,
      );
    }

    const rows = data ?? [];
    for (const row of rows) {
      products.push({
        id: row.id,
        feed_uuid: row.feed_uuid,
        title: row.title,
        olxCategoryId: row.categories?.olx_category_id
          ? Number(row.categories.olx_category_id)
          : null,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return products;
}

async function loadExistingListingMaps(
  admin: Admin,
  profileId: string,
): Promise<{
  byProduct: Map<string | null, number | null>;
  byOlxId: Set<number>;
}> {
  const byProduct = new Map<string | null, number | null>();
  const byOlxId = new Set<number>();
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("listings")
      .select("product_id, olx_listing_id")
      .eq("profile_id", profileId)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Učitavanje postojećih listings nije uspjelo: ${error.message}`,
      );
    }

    const rows = data ?? [];
    for (const row of rows) {
      byProduct.set(row.product_id, row.olx_listing_id);
      if (row.olx_listing_id != null) byOlxId.add(row.olx_listing_id);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { byProduct, byOlxId };
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

  const { byProduct, byOlxId } = await loadExistingListingMaps(
    admin,
    profileId,
  );

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

  const olxListings = await fetchAllUserListings(client, username);
  const olxTotal = olxListings.size;
  const pages = Math.ceil(olxTotal / 1000);

  for (const olx of olxListings.values()) {
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

  console.log(
    `Import gotov: matched=${matched}, novi=${inserted}, preostalo=${pendingProductIds.size}`,
  );

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
