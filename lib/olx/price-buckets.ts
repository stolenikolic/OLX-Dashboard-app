import { fnv1a } from "@/lib/workers/profile-shuffle";

/**
 * Generički obilazak OLX search-a preko cjenovnih pragova, sa auto-splitom
 * kad pojedinačni raspon pređe Elasticsearch max_result_window (~10.000).
 * Izdvojeno iz lib/pricing/competitor/fetch-competitor-listings.ts da ga
 * dijele i konkurenti i uvoz vlastitih oglasa (probija plafon od ~20.000
 * koji desc+asc pristup ima).
 */

export type PriceRange = { from: number; to: number | null };

export type PriceBucketPage<T> = {
  items: T[];
  total: number;
  lastPage: number;
};

export type PriceBucketOptions<T> = {
  /** Dohvata jednu stranicu za dati cjenovni raspon (1-indeksirano). */
  fetchPage: (range: PriceRange, page: number) => Promise<PriceBucketPage<T>>;
  /** Jedinstveni ključ stavke — za dedupe preko preklapajućih bucketa. */
  getId: (item: T) => number;
  /** Maksimalan broj stranica po bucketu (iz paginationForProfile/paginationForRun). */
  maxPage: number;
  /** Pauza između uzastopnih HTTP poziva. */
  delay: () => Promise<void> | void;
  /** Prag iznad kojeg se bucket rekurzivno dijeli na pola (default 10.000). */
  esLimit?: number;
  onBucketSplit?: (range: PriceRange, mid: number, total: number) => void;
  onBucketDone?: (
    range: PriceRange,
    info: { total: number; collectedSoFar: number },
  ) => void;
};

const DEFAULT_ES_LIMIT = 10_000;

/** Obilazi jedan cjenovni raspon; rekurzivno se dijeli ako total pređe esLimit. */
export async function fetchPriceBucket<T>(
  range: PriceRange,
  into: Map<number, T>,
  options: PriceBucketOptions<T>,
): Promise<void> {
  const esLimit = options.esLimit ?? DEFAULT_ES_LIMIT;
  const first = await options.fetchPage(range, 1);

  // Auto-split — raspon ima previše rezultata da stane u jedan ES prozor.
  if (first.total > esLimit && range.to != null && range.to - range.from > 1) {
    const mid = Math.floor((range.from + range.to) / 2);
    options.onBucketSplit?.(range, mid, first.total);
    await fetchPriceBucket({ from: range.from, to: mid }, into, options);
    await options.delay();
    await fetchPriceBucket({ from: mid, to: range.to }, into, options);
    return;
  }

  for (const item of first.items) into.set(options.getId(item), item);

  const lastPage = Math.min(first.lastPage, options.maxPage);
  for (let page = 2; page <= lastPage; page++) {
    await options.delay();
    const { items } = await options.fetchPage(range, page);
    if (items.length === 0) break;
    for (const item of items) into.set(options.getId(item), item);
  }

  options.onBucketDone?.(range, { total: first.total, collectedSoFar: into.size });
}

/** Obilazi listu cjenovnih raspona i vraća dedup-ovanu mapu po id-u. */
export async function fetchAllPriceBuckets<T>(
  ranges: PriceRange[],
  options: PriceBucketOptions<T>,
): Promise<Map<number, T>> {
  const into = new Map<number, T>();
  for (const range of ranges) {
    await fetchPriceBucket(range, into, options);
    await options.delay();
  }
  return into;
}

/** Statični, globalni pragovi — koriste ih konkurentski sync-evi (nisu vezani za jedan profil). */
export const DEFAULT_PRICE_BUCKETS: PriceRange[] = [
  { from: 1, to: 50 },
  { from: 50, to: 90 },
  { from: 90, to: 130 },
  { from: 130, to: 250 },
  { from: 250, to: 800 },
  { from: 800, to: null },
];

const BASE_BOUNDARIES = [50, 90, 130, 250, 800] as const;

/**
 * Cjenovni pragovi jitterovani po profilu (±15% oko baznih granica).
 * Anti-detekcija: dva profila ne šalju identičan skup upita ka istom API-ju.
 * Prvi raspon uvijek kreće od 1, zadnji je otvoren (bez gornje granice).
 */
export function priceBucketsForProfile(profileId: string): PriceRange[] {
  const boundaries: number[] = [];
  let prevBoundary = 0;

  for (let i = 0; i < BASE_BOUNDARIES.length; i++) {
    const base = BASE_BOUNDARIES[i]!;
    const h = fnv1a(`price-bucket:${profileId}:${i}`);
    const jitterPct = -0.15 + (h % 1000 / 1000) * 0.3; // -15%..+15%
    const boundary = Math.max(
      Math.round(base * (1 + jitterPct)),
      prevBoundary + 5,
    );
    boundaries.push(boundary);
    prevBoundary = boundary;
  }

  const ranges: PriceRange[] = [];
  // Kreni od 0, ne od 1 — hvata i oglase sa price=0 ("po dogovoru" na OLX-u
  // često ima cijenu 0, ne null). Vidi napomenu o riziku u planu.
  let from = 0;
  for (const boundary of boundaries) {
    ranges.push({ from, to: boundary });
    from = boundary;
  }
  ranges.push({ from, to: null });
  return ranges;
}
