/**
 * Javni search API — sort_order asc/desc radi (za razliku od /users/.../listings).
 * https://olx.ba/api/search?user_id=…&per_page=1000&sort_by=date&sort_order=desc|asc
 */

const SEARCH_BASE = "https://olx.ba/api/search";
const PER_PAGE = 1000;
const MAX_PAGE = 10; // ES max_result_window
const DELAY_MS = 120;

export type OlxSearchListing = {
  id: number;
  title: string;
  price: number;
  categoryId: number | null;
  /** Glavna slika (search `image`); preferira lg veličinu ako je sm URL. */
  imageUrl: string | null;
};

/** Search vraća sm; za kartice bolje lg kad postoji isti path. */
function normalizeListingImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  return trimmed.replace(
    /\/listings\/(\d+)\/sm\//,
    "/listings/$1/lg/",
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSearchPage(
  userId: number,
  page: number,
  sortOrder: "asc" | "desc",
): Promise<{
  ads: OlxSearchListing[];
  total: number;
  lastPage: number;
}> {
  const params = new URLSearchParams({
    attr: "",
    attr_encoded: "1",
    page: String(page),
    sort_by: "date",
    sort_order: sortOrder,
    user_id: String(userId),
    per_page: String(PER_PAGE),
  });

  const res = await fetch(`${SEARCH_BASE}?${params}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(
      `OLX search HTTP ${res.status} (page=${page}, sort=${sortOrder})`,
    );
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: number;
      title?: string;
      price?: number;
      category_id?: number;
      image?: string | null;
      images?: string[];
    }>;
    meta?: { total?: number; last_page?: number };
  };

  const ads: OlxSearchListing[] = (json.data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
    price: typeof row.price === "number" ? row.price : Number(row.price) || 0,
    categoryId: row.category_id ?? null,
    imageUrl: normalizeListingImageUrl(
      row.image ?? row.images?.[0] ?? null,
    ),
  }));

  return {
    ads,
    total: json.meta?.total ?? 0,
    lastPage: json.meta?.last_page ?? 1,
  };
}

async function pullDirection(
  userId: number,
  sortOrder: "asc" | "desc",
  byId: Map<number, OlxSearchListing>,
  targetTotal: number,
): Promise<void> {
  for (let page = 1; page <= MAX_PAGE; page++) {
    if (targetTotal > 0 && byId.size >= targetTotal) break;

    const { ads, total, lastPage } = await fetchSearchPage(
      userId,
      page,
      sortOrder,
    );
    let added = 0;
    for (const ad of ads) {
      if (!byId.has(ad.id)) added++;
      byId.set(ad.id, ad);
    }

    console.log(
      `OLX search [${sortOrder}] page ${page}: +${added}, ukupno=${byId.size}/${total}`,
    );

    if (ads.length === 0) break;
    if (targetTotal > 0 && byId.size >= targetTotal) break;
    if (page >= lastPage) break;
    // Ako nema novih i nismo na početku asc overlap zone — nastavi još malo
    if (added === 0 && sortOrder === "asc" && page >= 4) break;

    await sleep(DELAY_MS);
  }
}

/**
 * Svi aktivni oglasi korisnika preko search API-ja (desc + asc, dedupe).
 */
export async function fetchAllUserListingsViaSearch(
  userId: number,
): Promise<Map<number, OlxSearchListing>> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error(`Neispravan OLX user_id: ${userId}`);
  }

  const byId = new Map<number, OlxSearchListing>();
  const first = await fetchSearchPage(userId, 1, "desc");
  const targetTotal = first.total;

  for (const ad of first.ads) byId.set(ad.id, ad);
  console.log(
    `OLX search [desc] page 1: +${first.ads.length}, ukupno=${byId.size}/${targetTotal}`,
  );

  for (let page = 2; page <= MAX_PAGE; page++) {
    if (byId.size >= targetTotal) break;
    const { ads, lastPage } = await fetchSearchPage(userId, page, "desc");
    let added = 0;
    for (const ad of ads) {
      if (!byId.has(ad.id)) added++;
      byId.set(ad.id, ad);
    }
    console.log(
      `OLX search [desc] page ${page}: +${added}, ukupno=${byId.size}/${targetTotal}`,
    );
    if (ads.length === 0 || page >= lastPage) break;
    await sleep(DELAY_MS);
  }

  if (byId.size < targetTotal) {
    console.log(
      `OLX search: nedostaje ${targetTotal - byId.size} — reverse asc…`,
    );
    await pullDirection(userId, "asc", byId, targetTotal);
  }

  if (byId.size < targetTotal) {
    console.warn(
      `OLX search: prikupljeno ${byId.size}/${targetTotal} (moguća sitna razlika zbog brisanja oglasa).`,
    );
  } else {
    console.log(`OLX search: kompletno ${byId.size}/${targetTotal}`);
  }

  return byId;
}
