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

export async function loadListedProductIds(
  admin: Admin,
  profileId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("listings")
    .select("product_id, status")
    .eq("profile_id", profileId)
    .not("product_id", "is", null);

  if (error) {
    throw new Error(`Učitavanje listings nije uspjelo: ${error.message}`);
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.product_id && row.status !== "failed") {
      ids.add(row.product_id);
    }
  }
  return ids;
}

export async function findCandidateProductIds(
  admin: Admin,
  profileId: string,
  categoryId: string,
  listedProductIds: Set<string>,
  limit: number,
): Promise<string[]> {
  const { data, error } = await admin
    .from("products")
    .select("id")
    .eq("category_id", categoryId)
    .eq("in_feed", true)
    .eq("blacklisted", false)
    .not("main_image_url", "is", null)
    .order("title")
    .limit(limit * 3);

  if (error) {
    throw new Error(`Učitavanje kandidata nije uspjelo: ${error.message}`);
  }

  const candidates: string[] = [];
  for (const row of data ?? []) {
    if (listedProductIds.has(row.id)) continue;
    candidates.push(row.id);
    if (candidates.length >= limit) break;
  }

  return candidates;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelayMs(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}
