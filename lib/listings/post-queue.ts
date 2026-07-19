import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type CategoryQueueItem = {
  categoryId: string;
  olxCategoryId: number;
  slug: string;
  priority: number;
};

export async function getPostingCategoryQueue(
  admin: Admin,
  profileId: string,
): Promise<CategoryQueueItem[]> {
  const { data: priorityRows } = await admin
    .from("profile_category_priority")
    .select(
      `
      priority,
      enabled,
      categories (
        id,
        internal_slug,
        olx_category_id,
        is_postable
      )
    `,
    )
    .eq("profile_id", profileId)
    .eq("enabled", true)
    .order("priority");

  const fromPriority = (priorityRows ?? [])
    .map((row) => {
      const cat = row.categories;
      if (!cat?.olx_category_id || !cat.is_postable) return null;
      return {
        categoryId: cat.id,
        olxCategoryId: Number(cat.olx_category_id),
        slug: cat.internal_slug,
        priority: row.priority,
      };
    })
    .filter((row): row is CategoryQueueItem => row != null);

  if (fromPriority.length > 0) return fromPriority;

  const { data: mapped, error } = await admin
    .from("categories")
    .select("id, internal_slug, olx_category_id")
    .not("olx_category_id", "is", null)
    .eq("is_postable", true)
    .order("internal_slug");

  if (error) {
    throw new Error(`Učitavanje kategorija nije uspjelo: ${error.message}`);
  }

  return (mapped ?? []).map((cat, index) => ({
    categoryId: cat.id,
    olxCategoryId: Number(cat.olx_category_id),
    slug: cat.internal_slug,
    priority: index,
  }));
}

export async function countPostedToday(
  admin: Admin,
  profileId: string,
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await admin
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("last_published_at", startOfDay.toISOString())
    .in("status", ["active", "draft"]);

  if (error) {
    throw new Error(`Brojanje dnevnih oglasa nije uspjelo: ${error.message}`);
  }

  return count ?? 0;
}

const PAGE_SIZE = 1000;

/** Svi product_id iz listings za profil (paginacija — PostgREST default limit je 1000). */
export async function loadListedProductIds(
  admin: Admin,
  profileId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("listings")
      .select("product_id, status")
      .eq("profile_id", profileId)
      .not("product_id", "is", null)
      .order("product_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Učitavanje listings nije uspjelo: ${error.message}`);
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (row.product_id && row.status !== "failed") {
        ids.add(row.product_id);
      }
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

async function loadEligibleProductIds(
  admin: Admin,
  categoryId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("products")
      .select("id")
      .eq("category_id", categoryId)
      .eq("in_feed", true)
      .eq("blacklisted", false)
      .not("main_image_url", "is", null)
      .order("title", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Učitavanje kandidata nije uspjelo: ${error.message}`);
    }

    const rows = data ?? [];
    for (const row of rows) ids.push(row.id);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

export async function findCandidateProductIds(
  admin: Admin,
  _profileId: string,
  categoryId: string,
  listedProductIds: Set<string>,
  limit: number,
): Promise<string[]> {
  const eligible = await loadEligibleProductIds(admin, categoryId);
  const candidates: string[] = [];
  for (const id of eligible) {
    if (listedProductIds.has(id)) continue;
    candidates.push(id);
    if (candidates.length >= limit) break;
  }
  return candidates;
}

export type CategoryCandidateStats = {
  /** U feedu, eligible (in_feed, nije blacklist, ima sliku). */
  totalInFeed: number;
  /** Od toga već ima listing za profil. */
  alreadyListed: number;
  /** Još nisu listed — mogu se postaviti (prije dnevnog limita). */
  candidates: number;
};

/** Statistika kandidata u kategoriji (isti filteri kao post). */
export async function countCandidateProducts(
  admin: Admin,
  profileId: string,
  categoryId: string,
): Promise<CategoryCandidateStats> {
  const [listedProductIds, eligible] = await Promise.all([
    loadListedProductIds(admin, profileId),
    loadEligibleProductIds(admin, categoryId),
  ]);

  let alreadyListed = 0;
  let candidates = 0;
  for (const id of eligible) {
    if (listedProductIds.has(id)) alreadyListed++;
    else candidates++;
  }

  return {
    totalInFeed: eligible.length,
    alreadyListed,
    candidates,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelayMs(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}
