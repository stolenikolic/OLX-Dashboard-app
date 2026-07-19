import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllUserListingPrices } from "@/lib/listings/fetch-user-listings";
import { parseMappingCsv } from "@/lib/listings/parse-mapping-csv";
import type { OlxClient } from "@/lib/olx/client";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

const IN_CHUNK = 200;
const UPSERT_CHUNK = 100;
const DELETE_CHUNK = 100;

export type ImportFromCsvResult = {
  totalRows: number;
  pairs: number;
  inserted: number;
  updated: number;
  skippedEmptyFeed: number;
  skippedInvalid: number;
  skippedUnknownFeed: number;
  skippedNotOnOlx: number;
  skippedAlreadyMapped: number;
  deletedConflicts: number;
};

async function loadProductsByFeedUuid(
  admin: Admin,
  feedUuids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (let i = 0; i < feedUuids.length; i += IN_CHUNK) {
    const chunk = feedUuids.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("products")
      .select("id, feed_uuid")
      .in("feed_uuid", chunk);

    if (error) {
      throw new Error(`Učitavanje proizvoda nije uspjelo: ${error.message}`);
    }

    for (const row of data ?? []) {
      map.set(row.feed_uuid, row.id);
    }
  }

  return map;
}

type ExistingListing = {
  id: string;
  product_id: string | null;
  olx_listing_id: number | null;
};

async function loadExistingListings(
  admin: Admin,
  profileId: string,
): Promise<ExistingListing[]> {
  const { data, error } = await admin
    .from("listings")
    .select("id, product_id, olx_listing_id")
    .eq("profile_id", profileId);

  if (error) {
    throw new Error(`Učitavanje postojećih oglasa nije uspjelo: ${error.message}`);
  }

  return data ?? [];
}

async function deleteByIds(admin: Admin, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_CHUNK);
    const { error } = await admin.from("listings").delete().in("id", chunk);
    if (error) {
      throw new Error(`Brisanje konfliktnih veza nije uspjelo: ${error.message}`);
    }
  }
}

async function upsertMappings(
  admin: Admin,
  profileId: string,
  rows: Array<{
    product_id: string;
    feed_uuid: string;
    olx_listing_id: number;
    posted_price: number;
  }>,
): Promise<void> {
  const now = new Date().toISOString();
  const totalChunks = Math.ceil(rows.length / UPSERT_CHUNK);

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunkIndex = Math.floor(i / UPSERT_CHUNK) + 1;
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((row) => ({
      profile_id: profileId,
      product_id: row.product_id,
      feed_uuid: row.feed_uuid,
      olx_listing_id: row.olx_listing_id,
      status: "active" as const,
      posted_price: row.posted_price,
      error: null,
      updated_at: now,
    }));

    const { error } = await admin.from("listings").upsert(chunk, {
      onConflict: "profile_id,product_id",
    });

    if (error) {
      throw new Error(`Upis mapiranja nije uspio: ${error.message}`);
    }

    console.log(
      `Upsert: chunk ${chunkIndex}/${totalChunks} (${Math.min(i + UPSERT_CHUNK, rows.length)}/${rows.length})`,
    );
  }
}

/**
 * Uvozi CSV mapiranje feed uuid → olx_listing_id za jedan profil.
 * Upisuje i posted_price iz OLX liste. was_import ostaje default (false).
 */
export async function importListingsFromCsv(
  admin: Admin,
  client: OlxClient,
  profileId: string,
  username: string,
  csvText: string,
): Promise<ImportFromCsvResult> {
  console.log(
    `CSV import start (profil ${profileId}, user ${username})…`,
  );
  const parsed = parseMappingCsv(csvText);
  console.log(
    `CSV parsiran: redova=${parsed.totalRows}, veza=${parsed.pairs.length}, prazan_feed=${parsed.skippedEmptyFeed}, neispravno=${parsed.skippedInvalid}`,
  );

  const result: ImportFromCsvResult = {
    totalRows: parsed.totalRows,
    pairs: parsed.pairs.length,
    inserted: 0,
    updated: 0,
    skippedEmptyFeed: parsed.skippedEmptyFeed,
    skippedInvalid: parsed.skippedInvalid,
    skippedUnknownFeed: 0,
    skippedNotOnOlx: 0,
    skippedAlreadyMapped: 0,
    deletedConflicts: 0,
  };

  if (parsed.pairs.length === 0) {
    console.log("CSV import: nema validnih veza — kraj.");
    return result;
  }

  console.log("Povlačenje OLX oglasa profila…");
  const olxPrices = await fetchAllUserListingPrices(client, username);
  console.log(`OLX oglasa na profilu: ${olxPrices.size}`);

  console.log("Lookup feed UUID → products…");
  const feedUuids = parsed.pairs.map((p) => p.feedUuid);
  const productsByFeed = await loadProductsByFeedUuid(admin, feedUuids);
  console.log(`Pronađeno proizvoda u bazi: ${productsByFeed.size}`);

  console.log("Učitavanje postojećih listings…");
  const existing = await loadExistingListings(admin, profileId);
  console.log(`Postojećih listings redova: ${existing.length}`);

  const desiredOlxToProduct = new Map<number, string>();
  const desiredRows: Array<{
    product_id: string;
    feed_uuid: string;
    olx_listing_id: number;
    posted_price: number;
  }> = [];

  for (const pair of parsed.pairs) {
    const olxPrice = olxPrices.get(pair.olxListingId);
    if (olxPrice == null) {
      result.skippedNotOnOlx++;
      continue;
    }

    const productId = productsByFeed.get(pair.feedUuid);
    if (!productId) {
      result.skippedUnknownFeed++;
      continue;
    }

    desiredOlxToProduct.set(pair.olxListingId, productId);
    desiredRows.push({
      product_id: productId,
      feed_uuid: pair.feedUuid,
      olx_listing_id: pair.olxListingId,
      posted_price: olxPrice,
    });
  }

  console.log(
    `Nakon filtera: za upis=${desiredRows.length}, nije_na_olx=${result.skippedNotOnOlx}, nepoznat_feed=${result.skippedUnknownFeed}`,
  );

  if (desiredRows.length === 0) {
    console.log("CSV import: ništa za upis — kraj.");
    return result;
  }

  const deleteIds: string[] = [];
  for (const row of existing) {
    if (row.olx_listing_id == null) continue;
    const owner = desiredOlxToProduct.get(row.olx_listing_id);
    if (owner != null && row.product_id !== owner) {
      deleteIds.push(row.id);
    }
  }

  if (deleteIds.length > 0) {
    console.log(`Brisanje konfliktnih veza: ${deleteIds.length}`);
    await deleteByIds(admin, deleteIds);
    result.deletedConflicts = deleteIds.length;
  }

  const deletedSet = new Set(deleteIds);
  const existingByProduct = new Map<string, ExistingListing>();
  for (const row of existing) {
    if (deletedSet.has(row.id)) continue;
    if (row.product_id) {
      existingByProduct.set(row.product_id, row);
    }
  }

  const toUpsert: typeof desiredRows = [];

  for (const row of desiredRows) {
    const prev = existingByProduct.get(row.product_id);
    if (prev && prev.olx_listing_id === row.olx_listing_id) {
      // Veza već postoji — i dalje upsert radi posted_price.
      result.skippedAlreadyMapped++;
    } else if (prev) {
      result.updated++;
    } else {
      result.inserted++;
    }
    toUpsert.push(row);
  }

  console.log(
    `Upsert plan: novi=${result.inserted}, update=${result.updated}, već_mapirano(refresh cijene)=${result.skippedAlreadyMapped}`,
  );

  if (toUpsert.length > 0) {
    await upsertMappings(admin, profileId, toUpsert);
  }

  console.log("CSV import gotov:", result);
  return result;
}
