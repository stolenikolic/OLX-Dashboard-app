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

export type FeedProductRow = {
  id: string;
  feedUuid: string;
  title: string;
  mainImageUrl: string | null;
  shopPrice: number | null;
  categorySlug: string | null;
  importOverride: Database["public"]["Enums"]["import_override"];
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const DEFAULT_PAGE_SIZE = 60;

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

function emptyPage<T>(page: number, pageSize: number): PaginatedResult<T> {
  return { items: [], total: 0, page, pageSize, totalPages: 0 };
}

function mapListingRow(row: {
  id: string;
  profile_id: string;
  product_id: string | null;
  status: Database["public"]["Enums"]["listing_status"];
  posted_price: number | null;
  olx_listing_id: number | null;
  last_published_at: string | null;
  error: string | null;
  profiles: { name: string } | null;
  products: {
    title: string;
    main_image_url: string | null;
    category_slug: string | null;
    in_feed: boolean;
    import_override: Database["public"]["Enums"]["import_override"];
  } | null;
}): ListingRow {
  return {
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
  };
}

export async function fetchListings(
  supabase: Client,
  options?: {
    status?: string;
    profileId?: string;
    search?: string;
    categorySlug?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedResult<ListingRow>> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const search = options?.search?.trim() || "";
  const categorySlug = options?.categorySlug?.trim() || "";
  // Inner join kad filtriramo po proizvodu — izbjegava ogromni .in(product_id, …).
  const productsJoin =
    search || categorySlug
      ? `products!inner (
        title,
        main_image_url,
        category_slug,
        in_feed,
        import_override
      )`
      : `products (
        title,
        main_image_url,
        category_slug,
        in_feed,
        import_override
      )`;

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
      ${productsJoin}
    `,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (categorySlug) {
    query = query.eq("products.category_slug", categorySlug);
  }
  if (search) {
    query = query.ilike("products.title", `%${search}%`);
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

  const { data, error, count } = await query;
  if (error || !data) {
    console.error("fetchListings:", error?.message ?? "nema podataka");
    return emptyPage(page, pageSize);
  }

  const total = count ?? 0;
  return {
    items: data.map(mapListingRow),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function fetchFeedProducts(
  supabase: Client,
  options?: {
    search?: string;
    categorySlug?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedResult<FeedProductRow>> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("products")
    .select(
      "id, feed_uuid, title, main_image_url, shop_price, category_slug, import_override",
      { count: "exact" },
    )
    .eq("in_feed", true)
    .order("title", { ascending: true })
    .range(from, to);

  if (options?.search?.trim()) {
    query = query.ilike("title", `%${options.search.trim()}%`);
  }
  if (options?.categorySlug) {
    query = query.eq("category_slug", options.categorySlug);
  }

  const { data, error, count } = await query;
  if (error || !data) return emptyPage(page, pageSize);

  const total = count ?? 0;
  return {
    items: data.map((row) => ({
      id: row.id,
      feedUuid: row.feed_uuid,
      title: row.title,
      mainImageUrl: row.main_image_url,
      shopPrice: row.shop_price != null ? Number(row.shop_price) : null,
      categorySlug: row.category_slug,
      importOverride: row.import_override,
    })),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

/** Distinct category slugs from products currently in feed (for filter UI). */
export async function fetchFeedCategorySlugs(
  supabase: Client,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("internal_slug")
    .order("internal_slug");

  if (error || !data) return [];
  return data.map((c) => c.internal_slug).filter(Boolean);
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

export type UnmappedListingRow = {
  id: string;
  profile_id: string;
  olx_listing_id: number;
  title: string;
  price: number | null;
  olx_category_id: number | null;
  image_url: string | null;
  synced_at: string;
};

export async function fetchUnmappedListings(
  supabase: Client,
  options: {
    profileId: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedResult<UnmappedListingRow>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("unmapped_listings")
    .select(
      "id, profile_id, olx_listing_id, title, price, olx_category_id, image_url, synced_at",
      { count: "exact" },
    )
    .eq("profile_id", options.profileId)
    .order("synced_at", { ascending: false })
    .range(from, to);

  if (options.search?.trim()) {
    query = query.ilike("title", `%${options.search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error || !data) return emptyPage(page, pageSize);

  const total = count ?? 0;
  return {
    items: data.map((row) => ({
      id: row.id,
      profile_id: row.profile_id,
      olx_listing_id: row.olx_listing_id,
      title: row.title,
      price: row.price != null ? Number(row.price) : null,
      olx_category_id: row.olx_category_id,
      image_url: row.image_url,
      synced_at: row.synced_at,
    })),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export type ProductSearchHit = {
  id: string;
  feedUuid: string;
  title: string;
  mainImageUrl: string | null;
  categorySlug: string | null;
};

export async function searchProductsForConnect(
  supabase: Client,
  query: string,
  limit = 20,
): Promise<ProductSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id, feed_uuid, title, main_image_url, category_slug")
    .eq("in_feed", true)
    .ilike("title", `%${q}%`)
    .order("title")
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    feedUuid: row.feed_uuid,
    title: row.title,
    mainImageUrl: row.main_image_url,
    categorySlug: row.category_slug,
  }));
}

export type ActivePostJob = {
  id: string;
  status: Database["public"]["Enums"]["job_status"];
  started_at: string;
  items_succeeded: number;
  items_failed: number;
  items_processed: number;
  summary: string | null;
  cancel_requested: boolean;
  github_run_id: number | null;
};

export async function fetchActivePostJob(
  supabase: Client,
  profileId: string,
): Promise<ActivePostJob | null> {
  const { data, error } = await supabase
    .from("job_runs")
    .select(
      `
      id,
      status,
      started_at,
      items_succeeded,
      items_failed,
      items_processed,
      summary,
      cancel_requested,
      github_run_id
    `,
    )
    .eq("profile_id", profileId)
    .eq("job", "post_listings")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export type JobLogRow = {
  id: string;
  level: string;
  message: string;
  context: Database["public"]["Tables"]["job_logs"]["Row"]["context"];
  created_at: string;
};

export async function fetchJobLogs(
  supabase: Client,
  jobRunId: string,
  options?: { afterCreatedAt?: string; limit?: number },
): Promise<JobLogRow[]> {
  let query = supabase
    .from("job_logs")
    .select("id, level, message, context, created_at")
    .eq("job_run_id", jobRunId)
    .order("created_at", { ascending: true })
    .limit(options?.limit ?? 200);

  if (options?.afterCreatedAt) {
    query = query.gt("created_at", options.afterCreatedAt);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}
