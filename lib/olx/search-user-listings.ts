import { assertOlxAllowed } from "@/lib/olx/net-guard";
import {
  fetchAllPriceBuckets,
  priceBucketsForProfile,
  type PriceRange,
} from "@/lib/olx/price-buckets";
import { generateBrowserIdentity } from "@/lib/profile/browser-identity";
import { paginationForProfile } from "@/lib/profile/pagination";

/**
 * Javni search API, particionisan preko cjenovnih pragova (po profilu).
 * Zamjena za stari desc+asc pristup, koji je bio ograničen na ~20.000
 * oglasa po nalogu (Elasticsearch max_result_window = 10.000 po smjeru).
 * https://olx.ba/api/search?user_id=…&price_from=…&price_to=…&per_page=…
 */

const SEARCH_BASE = "https://olx.ba/api/search";

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
  return trimmed.replace(/\/listings\/(\d+)\/sm\//, "/listings/$1/lg/");
}

/** Koherentan set browser headera za ovaj profil (anti-detekcija). */
function buildHeaders(profileId: string): Record<string, string> {
  const identity = generateBrowserIdentity(profileId);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": identity.acceptLanguage,
    "User-Agent": identity.userAgent,
    "Accept-Encoding": "gzip, deflate, br",
  };
  if (identity.secChUa) headers["sec-ch-ua"] = identity.secChUa;
  if (identity.secChUaMobile) headers["sec-ch-ua-mobile"] = identity.secChUaMobile;
  if (identity.secChUaPlatform) headers["sec-ch-ua-platform"] = identity.secChUaPlatform;
  return headers;
}

async function fetchSearchPage(params: {
  userId: number;
  range: PriceRange;
  page: number;
  perPage: number;
  headers: Record<string, string>;
}): Promise<{ ads: OlxSearchListing[]; total: number; lastPage: number }> {
  const qs = new URLSearchParams({
    attr: "",
    attr_encoded: "1",
    page: String(params.page),
    sort_by: "date",
    sort_order: "desc",
    user_id: String(params.userId),
    per_page: String(params.perPage),
    price_from: String(params.range.from),
  });
  if (params.range.to != null) {
    qs.set("price_to", String(params.range.to));
  }

  const res = await fetch(`${SEARCH_BASE}?${qs}`, { headers: params.headers });

  if (!res.ok) {
    throw new Error(
      `OLX search HTTP ${res.status} (price=${params.range.from}-${params.range.to ?? "+"}, page=${params.page})`,
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
    imageUrl: normalizeListingImageUrl(row.image ?? row.images?.[0] ?? null),
  }));

  return {
    ads,
    total: json.meta?.total ?? 0,
    lastPage: json.meta?.last_page ?? 1,
  };
}

/**
 * Svi aktivni oglasi korisnika preko search API-ja, particionisano po
 * cjenovnim pragovima (jitterovani po profilu — probija plafon od ~20k
 * koji je desc+asc pristup imao, i daje dodatni sloj anti-detekcije jer
 * dva profila ne šalju identičan skup upita).
 */
export async function fetchAllUserListingsViaSearch(
  userId: number,
  profileId: string,
  pacing: { minMs: number; maxMs: number },
): Promise<Map<number, OlxSearchListing>> {
  assertOlxAllowed("search-user-listings");
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error(`Neispravan OLX user_id: ${userId}`);
  }

  const { perPage, maxPage } = paginationForProfile(profileId);
  const headers = buildHeaders(profileId);
  const ranges = priceBucketsForProfile(profileId);

  const randomDelay = () =>
    new Promise<void>((resolve) => {
      const ms =
        pacing.minMs + Math.floor(Math.random() * (pacing.maxMs - pacing.minMs + 1));
      setTimeout(resolve, ms);
    });

  let expectedTotal = 0;

  const byId = await fetchAllPriceBuckets<OlxSearchListing>(ranges, {
    maxPage,
    delay: randomDelay,
    getId: (ad) => ad.id,
    fetchPage: async (range, page) => {
      const { ads, total, lastPage } = await fetchSearchPage({
        userId,
        range,
        page,
        perPage,
        headers,
      });
      return { items: ads, total, lastPage };
    },
    onBucketSplit: (range, mid, total) => {
      console.log(
        `OLX search: split bucket ${range.from}-${range.to} (total=${total}) → ${range.from}-${mid}, ${mid}-${range.to}`,
      );
    },
    onBucketDone: (range, info) => {
      // Leaf bucketi tile-uju cijelu osu cijena bez rupa/preklapanja, pa je
      // zbir njihovih `total` vrijednosti tačan ukupan broj oglasa naloga.
      expectedTotal += info.total;
      console.log(
        `OLX search bucket ${range.from}-${range.to ?? "+"}: total=${info.total}, ukupno_prikupljeno=${info.collectedSoFar}`,
      );
    },
  });

  if (byId.size < expectedTotal) {
    console.warn(
      `OLX search: prikupljeno ${byId.size}/${expectedTotal} — moguć manjak ` +
        `(oglasi bez cijene mogu promašiti cjenovne pragove, ili je oglas obrisan/izmijenjen tokom obilaska).`,
    );
  } else {
    console.log(`OLX search: kompletno ${byId.size} oglasa (${ranges.length} pragova).`);
  }

  return byId;
}
