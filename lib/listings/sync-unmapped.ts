import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllUserListings } from "@/lib/listings/fetch-user-listings";
import type { OlxClient } from "@/lib/olx/client";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type SyncUnmappedResult = {
  olxTotal: number;
  mappedOnOlx: number;
  unmapped: number;
  inserted: number;
  removedStale: number;
};

const UPSERT_CHUNK = 500;
/** PostgREST default max-rows — mora paginacija. */
const PAGE_SIZE = 1000;

async function fetchAllMappedOlxIds(
  admin: Admin,
  profileId: string,
): Promise<Set<number>> {
  const ids = new Set<number>();
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("listings")
      .select("olx_listing_id")
      .eq("profile_id", profileId)
      .not("olx_listing_id", "is", null)
      .order("olx_listing_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Učitavanje mapiranih listings nije uspjelo: ${error.message}`,
      );
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (row.olx_listing_id != null) ids.add(row.olx_listing_id);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

/**
 * Povlači aktivne OLX oglase profila i snima u unmapped_listings
 * one koji nisu u listings (nema veze na feed).
 */
export async function syncUnmappedListings(
  admin: Admin,
  client: OlxClient,
  profileId: string,
  username: string,
): Promise<SyncUnmappedResult> {
  const mappedOlxIds = await fetchAllMappedOlxIds(admin, profileId);
  console.log(`Mapiranih olx_listing_id u bazi: ${mappedOlxIds.size}`);

  const olxListings = await fetchAllUserListings(client, username);
  const olxTotal = olxListings.size;

  const unmappedRows: Array<{
    profile_id: string;
    olx_listing_id: number;
    title: string;
    price: number | null;
    olx_category_id: number | null;
    image_url: string | null;
    synced_at: string;
    updated_at: string;
  }> = [];

  let mappedOnOlx = 0;
  const now = new Date().toISOString();

  for (const olx of olxListings.values()) {
    if (mappedOlxIds.has(olx.id)) {
      mappedOnOlx++;
      continue;
    }
    unmappedRows.push({
      profile_id: profileId,
      olx_listing_id: olx.id,
      title: olx.title || `OLX #${olx.id}`,
      price: Number.isFinite(olx.price) ? olx.price : null,
      olx_category_id: olx.category_id > 0 ? olx.category_id : null,
      image_url: olx.image_url ?? null,
      synced_at: now,
      updated_at: now,
    });
  }

  // Full replace — izbjegava stale zbog PostgREST 1000-limit na select.
  const { count: beforeCount, error: countError } = await admin
    .from("unmapped_listings")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (countError) {
    throw new Error(
      `Brojanje unmapped_listings nije uspjelo: ${countError.message}`,
    );
  }

  const { error: deleteError } = await admin
    .from("unmapped_listings")
    .delete()
    .eq("profile_id", profileId);

  if (deleteError) {
    throw new Error(
      `Brisanje starog unmapped snapshota nije uspjelo: ${deleteError.message}`,
    );
  }

  const removedStale = beforeCount ?? 0;

  let inserted = 0;
  for (let i = 0; i < unmappedRows.length; i += UPSERT_CHUNK) {
    const chunk = unmappedRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await admin.from("unmapped_listings").insert(chunk);
    if (error) {
      throw new Error(`Insert unmapped_listings nije uspio: ${error.message}`);
    }
    inserted += chunk.length;
  }

  console.log(
    `Sync unmapped: olx=${olxTotal}, mapirano=${mappedOnOlx}, nemapirano=${unmappedRows.length}, insert=${inserted}, obrisano_starih=${removedStale}`,
  );

  return {
    olxTotal,
    mappedOnOlx,
    unmapped: unmappedRows.length,
    inserted,
    removedStale,
  };
}
