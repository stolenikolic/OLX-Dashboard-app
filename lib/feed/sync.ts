import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeedProduct } from "@/lib/feed/types";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type OfferInsert = Database["public"]["Tables"]["product_offers"]["Insert"];
type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];

export type SyncStats = {
  total: number;
  invalid: number;
  upserted: number;
  offers: number;
  categoriesEnsured: number;
  pruned: number;
};

const CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Snapshots the validated feed products into the database:
 * - ensures categories exist (by internal_slug, without touching existing mappings)
 * - upserts products (by feed_uuid) and their offers (HU -> HUF, BA -> BIH)
 * - flags products no longer present in the feed as in_feed = false
 */
export async function syncFeed(
  admin: Admin,
  products: FeedProduct[],
  invalid: number,
): Promise<SyncStats> {
  const syncStartedAt = new Date().toISOString();

  const categoriesEnsured = await ensureCategories(admin, products);
  const slugToCategoryId = await loadCategoryMap(admin);

  let upserted = 0;
  let offers = 0;

  for (const part of chunk(products, CHUNK)) {
    const productRows: ProductInsert[] = part.map((p) => ({
      feed_uuid: p.id,
      title: p.title,
      shop_price: p.shop_price ?? null,
      category_slug: p.category.slug,
      category_id: slugToCategoryId.get(p.category.slug) ?? null,
      main_image_url: p.main_image ?? null,
      specs: (p.specs ?? {}) as Json,
      in_feed: true,
      last_seen_at: syncStartedAt,
      updated_at: syncStartedAt,
    }));

    const { data: upsertedRows, error: upsertError } = await admin
      .from("products")
      .upsert(productRows, { onConflict: "feed_uuid" })
      .select("id, feed_uuid");

    if (upsertError) {
      throw new Error(`Upsert proizvoda nije uspio: ${upsertError.message}`);
    }

    upserted += upsertedRows?.length ?? 0;

    const feedUuidToId = new Map<string, string>();
    for (const row of upsertedRows ?? []) {
      feedUuidToId.set(row.feed_uuid, row.id);
    }

    const productIds = Array.from(feedUuidToId.values());

    // Replace offers for this chunk to keep an exact snapshot.
    const { error: deleteError } = await admin
      .from("product_offers")
      .delete()
      .in("product_id", productIds);

    if (deleteError) {
      throw new Error(`Brisanje starih ponuda nije uspjelo: ${deleteError.message}`);
    }

    const offerRows: OfferInsert[] = [];
    for (const p of part) {
      const productId = feedUuidToId.get(p.id);
      if (!productId) continue;

      if (p.offers?.HU) {
        offerRows.push({
          product_id: productId,
          origin: "HUF",
          acquisition_price: p.offers.HU.acquisition_price,
          acquisition_currency: p.offers.HU.acquisition_currency,
          supplier_code: p.offers.HU.supplier_code ?? null,
        });
      }
      if (p.offers?.BA) {
        offerRows.push({
          product_id: productId,
          origin: "BIH",
          acquisition_price: p.offers.BA.acquisition_price,
          acquisition_currency: p.offers.BA.acquisition_currency,
          supplier_code: p.offers.BA.supplier_code ?? null,
        });
      }
    }

    if (offerRows.length > 0) {
      const { error: insertOffersError } = await admin
        .from("product_offers")
        .insert(offerRows);

      if (insertOffersError) {
        throw new Error(
          `Ubacivanje ponuda nije uspjelo: ${insertOffersError.message}`,
        );
      }
      offers += offerRows.length;
    }
  }

  // Anything not refreshed in this run is no longer in the feed.
  const { data: prunedRows, error: pruneError } = await admin
    .from("products")
    .update({ in_feed: false, updated_at: syncStartedAt })
    .lt("last_seen_at", syncStartedAt)
    .eq("in_feed", true)
    .select("id");

  if (pruneError) {
    throw new Error(`Označavanje uklonjenih proizvoda nije uspjelo: ${pruneError.message}`);
  }

  return {
    total: products.length + invalid,
    invalid,
    upserted,
    offers,
    categoriesEnsured,
    pruned: prunedRows?.length ?? 0,
  };
}

async function ensureCategories(
  admin: Admin,
  products: FeedProduct[],
): Promise<number> {
  const bySlug = new Map<string, string>();
  for (const p of products) {
    if (!bySlug.has(p.category.slug)) {
      bySlug.set(p.category.slug, p.category.name);
    }
  }

  if (bySlug.size === 0) return 0;

  const rows: CategoryInsert[] = Array.from(bySlug.entries()).map(
    ([slug, name]) => ({ internal_slug: slug, internal_name: name }),
  );

  // ignoreDuplicates so existing categories keep their OLX mapping / margins.
  const { error } = await admin
    .from("categories")
    .upsert(rows, { onConflict: "internal_slug", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Upsert kategorija nije uspio: ${error.message}`);
  }

  return bySlug.size;
}

async function loadCategoryMap(admin: Admin): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await admin
    .from("categories")
    .select("id, internal_slug");

  if (error) {
    throw new Error(`Učitavanje kategorija nije uspjelo: ${error.message}`);
  }

  for (const row of data ?? []) {
    map.set(row.internal_slug, row.id);
  }
  return map;
}
