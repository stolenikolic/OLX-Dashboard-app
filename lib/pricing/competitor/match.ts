import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesRule } from "@/lib/pricing/competitor/match-rules";
import {
  normalizeForCategory,
  normalizeGeneric,
} from "@/lib/pricing/competitor/normalize-title";
import type { CompetitorMatchInfo } from "@/lib/pricing/resolve-listing-price";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type CompetitorIndexEntry = {
  title: string;
  norm: string;
  discounted: number;
  sellerId: number;
  sellerName: string | null;
  categoryId: number | null;
};

export type CompetitorIndex = Map<number, CompetitorIndexEntry[]>;

const PAGE_SIZE = 1000;

/**
 * Build in-memory index of competitor listings keyed by OLX category_id.
 * Listings without category go into bucket -1.
 */
export async function buildCompetitorIndex(
  admin: Admin,
): Promise<CompetitorIndex> {
  const index: CompetitorIndex = new Map();
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("competitor_listings")
      .select(
        "olx_listing_id, seller_user_id, seller_name, title, category_id, discounted_price, price",
      )
      .order("olx_listing_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Učitavanje competitor_listings nije uspjelo: ${error.message}`,
      );
    }

    const rows = data ?? [];
    for (const row of rows) {
      const catId = row.category_id != null ? Number(row.category_id) : -1;
      const discounted =
        row.discounted_price != null
          ? Number(row.discounted_price)
          : row.price != null
            ? Number(row.price)
            : NaN;
      if (!Number.isFinite(discounted) || discounted <= 0) continue;

      const entry: CompetitorIndexEntry = {
        title: row.title,
        norm: normalizeForCategory(row.title, catId === -1 ? null : catId),
        discounted,
        sellerId: Number(row.seller_user_id),
        sellerName: row.seller_name,
        categoryId: catId === -1 ? null : catId,
      };

      const bucket = index.get(catId) ?? [];
      bucket.push(entry);
      index.set(catId, bucket);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  let total = 0;
  for (const list of index.values()) total += list.length;
  console.log(
    `Competitor indeks: ${total} oglasa u ${index.size} kategorija`,
  );

  return index;
}

/**
 * Find lowest discounted competitor price matching our listing.
 */
export function findCompetitorMin(
  index: CompetitorIndex,
  ourTitle: string,
  olxCategoryId: number | null,
): CompetitorMatchInfo | null {
  if (!ourTitle.trim()) return null;

  const ourNorm = normalizeForCategory(ourTitle, olxCategoryId);
  const ourGeneric = normalizeGeneric(ourTitle);

  const candidates: CompetitorIndexEntry[] = [];
  if (olxCategoryId != null) {
    candidates.push(...(index.get(olxCategoryId) ?? []));
  }
  // Also scan uncategorized bucket if present
  if (olxCategoryId == null) {
    for (const list of index.values()) candidates.push(...list);
  }

  let best: CompetitorMatchInfo | null = null;

  for (const entry of candidates) {
    // Same category required when we have one
    if (
      olxCategoryId != null &&
      entry.categoryId != null &&
      entry.categoryId !== olxCategoryId
    ) {
      continue;
    }

    const ok =
      matchesRule(olxCategoryId, ourNorm, entry.norm) ||
      matchesRule(olxCategoryId, ourGeneric, entry.title);

    if (!ok) continue;

    if (!best || entry.discounted < best.price) {
      best = {
        price: entry.discounted,
        sellerId: entry.sellerId,
        sellerName: entry.sellerName,
        matchedTitle: entry.title,
      };
    }
  }

  return best;
}

/** Count rows in competitor_listings (for emptiness check). */
export async function countCompetitorListings(
  admin: Admin,
): Promise<number> {
  const { count, error } = await admin
    .from("competitor_listings")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(
      `Brojanje competitor_listings nije uspjelo: ${error.message}`,
    );
  }

  return count ?? 0;
}
