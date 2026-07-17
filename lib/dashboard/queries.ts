import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type ProfileSummary = {
  id: string;
  name: string;
  status: Database["public"]["Enums"]["profile_status"];
  olx_username: string | null;
  daily_post_limit: number;
  activeListings: number;
  postedToday: number;
};

export type ListingRow = {
  id: string;
  profile_id: string;
  product_id: string | null;
  status: Database["public"]["Enums"]["listing_status"];
  posted_price: number | null;
  olx_listing_id: number | null;
  last_published_at: string | null;
  error: string | null;
  profileName: string;
  productTitle: string | null;
  productImage: string | null;
  categorySlug: string | null;
  inFeed: boolean;
  importOverride: Database["public"]["Enums"]["import_override"] | null;
};

export type JobRunRow = {
  id: string;
  job: Database["public"]["Enums"]["job_type"];
  status: Database["public"]["Enums"]["job_status"];
  started_at: string;
  finished_at: string | null;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  summary: string | null;
  profileName: string | null;
};

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchProfileSummaries(
  supabase: Client,
): Promise<ProfileSummary[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, status, olx_username, daily_post_limit")
    .order("name");

  if (error || !profiles) return [];

  const todayStart = startOfTodayIso();
  const summaries: ProfileSummary[] = [];

  for (const profile of profiles) {
    const [activeRes, todayRes] = await Promise.all([
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .eq("status", "active"),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .gte("last_published_at", todayStart)
        .in("status", ["active", "draft"]),
    ]);

    summaries.push({
      id: profile.id,
      name: profile.name,
      status: profile.status,
      olx_username: profile.olx_username,
      daily_post_limit: profile.daily_post_limit,
      activeListings: activeRes.count ?? 0,
      postedToday: todayRes.count ?? 0,
    });
  }

  return summaries;
}

export async function fetchListings(
  supabase: Client,
  options?: {
    status?: string;
    profileId?: string;
    search?: string;
    limit?: number;
  },
): Promise<ListingRow[]> {
  let productIds: string[] | null = null;
  if (options?.search?.trim()) {
    const q = `%${options.search.trim()}%`;
    const { data: products } = await supabase
      .from("products")
      .select("id")
      .ilike("title", q)
      .limit(200);
    productIds = (products ?? []).map((p) => p.id);
    if (productIds.length === 0) return [];
  }

  let query = supabase
    .from("listings")
    .select(
      `
      id,
      profile_id,
      product_id,
      status,
      posted_price,
      olx_listing_id,
      last_published_at,
      error,
      profiles ( name ),
      products (
        title,
        main_image_url,
        category_slug,
        in_feed,
        import_override
      )
    `,
    )
    .order("updated_at", { ascending: false })
    .limit(options?.limit ?? 60);

  if (productIds) {
    query = query.in("product_id", productIds);
  }

  if (options?.status && options.status !== "all") {
    query = query.eq(
      "status",
      options.status as Database["public"]["Enums"]["listing_status"],
    );
  }

  if (options?.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    profile_id: row.profile_id,
    product_id: row.product_id,
    status: row.status,
    posted_price: row.posted_price != null ? Number(row.posted_price) : null,
    olx_listing_id: row.olx_listing_id,
    last_published_at: row.last_published_at,
    error: row.error,
    profileName: row.profiles?.name ?? "—",
    productTitle: row.products?.title ?? null,
    productImage: row.products?.main_image_url ?? null,
    categorySlug: row.products?.category_slug ?? null,
    inFeed: row.products?.in_feed ?? true,
    importOverride: row.products?.import_override ?? null,
  }));
}

export async function fetchRecentJobRuns(
  supabase: Client,
  limit = 30,
): Promise<JobRunRow[]> {
  const { data, error } = await supabase
    .from("job_runs")
    .select(
      `
      id,
      job,
      status,
      started_at,
      finished_at,
      items_processed,
      items_succeeded,
      items_failed,
      summary,
      profiles ( name )
    `,
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    job: row.job,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    items_processed: row.items_processed,
    items_succeeded: row.items_succeeded,
    items_failed: row.items_failed,
    summary: row.summary,
    profileName: row.profiles?.name ?? null,
  }));
}

export async function fetchDashboardTotals(supabase: Client) {
  const [activeRes, productsRes] = await Promise.all([
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("in_feed", true),
  ]);

  return {
    activeListings: activeRes.count ?? 0,
    productsInFeed: productsRes.count ?? 0,
  };
}

export async function fetchErrorSummary(supabase: Client) {
  const [failedListings, failedJobs, suspendedProfiles] = await Promise.all([
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("job_runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte(
        "started_at",
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      ),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "suspended"),
  ]);

  return {
    failedListings: failedListings.count ?? 0,
    failedJobs: failedJobs.count ?? 0,
    suspendedProfiles: suspendedProfiles.count ?? 0,
  };
}

export async function fetchProfileById(supabase: Client, profileId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function fetchCategories(supabase: Client) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("internal_slug");
  if (error || !data) return [];
  return data;
}

export async function fetchProfileCategoryPriority(
  supabase: Client,
  profileId: string,
) {
  const { data, error } = await supabase
    .from("profile_category_priority")
    .select(
      `
      priority,
      enabled,
      category_id,
      categories (
        id,
        internal_slug,
        internal_name,
        olx_category_id
      )
    `,
    )
    .eq("profile_id", profileId)
    .order("priority");

  if (error || !data) return [];
  return data;
}

export async function fetchProfileMembers(supabase: Client) {
  const { data, error } = await supabase
    .from("profile_members")
    .select(
      `
      id,
      role,
      profile_id,
      user_id,
      profiles ( name )
    `,
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}
