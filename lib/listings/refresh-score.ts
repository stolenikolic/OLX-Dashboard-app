/**
 * Demand-driven refresh scoring.
 *
 * Weights (defaults): inquiry 0.50 / category 0.20 / value 0.15 / staleness 0.15
 * Inquiry: one conversation = one event; recency half-life 60d; window 180d.
 * Category: demand prior/fallback from inquiry weights (smoothing for cold listings).
 * Normalisation: percentile rank within candidate set.
 */

export type RefreshScoreConfig = {
  wInquiry: number;
  wCategory: number;
  wValue: number;
  wStaleness: number;
  inquiryWindowDays: number;
  inquiryHalflifeDays: number;
  stalenessCapDays: number;
  unmappedPenalty: number;
};

export const DEFAULT_REFRESH_SCORE_CONFIG: RefreshScoreConfig = {
  wInquiry: 0.5,
  wCategory: 0.2,
  wValue: 0.15,
  wStaleness: 0.15,
  inquiryWindowDays: 180,
  inquiryHalflifeDays: 60,
  stalenessCapDays: 30,
  unmappedPenalty: 0.85,
};

export type InquiryEvent = {
  olxListingId: number;
  olxCategoryId: number | null;
  /** ISO timestamp of conversation.created_at */
  inquiryAt: string;
};

export type CatalogListing = {
  olxListingId: number;
  categoryId: number;
  price: number;
  status: string;
  refreshAvailable: boolean;
  /** Unix seconds from OLX date field */
  olxDate: number | null;
};

export type DbListingInfo = {
  listingId: string;
  inFeed: boolean | null;
  blacklisted: boolean;
  lastRefreshedAt: string | null;
  /** True when listing has no linked feed product. */
  unmapped?: boolean;
};

export type ScoredListing = {
  olxListingId: number;
  listingId: string | null;
  categoryId: number;
  price: number;
  score: number;
  inquiryRaw: number;
  categoryRaw: number;
  valueRaw: number;
  stalenessRaw: number;
  unmapped: boolean;
};

function ageDays(isoOrUnix: string | number, nowMs: number): number {
  const t =
    typeof isoOrUnix === "number"
      ? isoOrUnix * 1000
      : new Date(isoOrUnix).getTime();
  return Math.max(0, (nowMs - t) / 86_400_000);
}

function inquiryWeight(
  ageDaysVal: number,
  halflifeDays: number,
): number {
  if (halflifeDays <= 0) return 1;
  return Math.pow(0.5, ageDaysVal / halflifeDays);
}

/** Percentile rank: 0 for lowest, 1 for highest. Ties share average rank. */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    // average rank (0-based) of tied group, scaled to 0..1
    const avgRank = (i + j) / 2;
    const pct = avgRank / (n - 1);
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = pct;
    }
    i = j + 1;
  }
  return ranks;
}

export function aggregateInquiries(
  events: InquiryEvent[],
  config: RefreshScoreConfig,
  nowMs = Date.now(),
): {
  byListing: Map<number, number>;
  byCategory: Map<number, number>;
} {
  const byListing = new Map<number, number>();
  const categoryWeightSum = new Map<number, number>();

  for (const ev of events) {
    const age = ageDays(ev.inquiryAt, nowMs);
    if (age > config.inquiryWindowDays) continue;
    const w = inquiryWeight(age, config.inquiryHalflifeDays);
    byListing.set(
      ev.olxListingId,
      (byListing.get(ev.olxListingId) ?? 0) + w,
    );
    if (ev.olxCategoryId != null) {
      categoryWeightSum.set(
        ev.olxCategoryId,
        (categoryWeightSum.get(ev.olxCategoryId) ?? 0) + w,
      );
    }
  }

  return { byListing, byCategory: categoryWeightSum };
}

/**
 * Category demand prior: total inquiry weight in category / active listings in category.
 * Used as smoothing for listings with little/no direct inquiries.
 */
export function categoryDemandScores(
  categoryWeightSum: Map<number, number>,
  activeCountByCategory: Map<number, number>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [catId, weight] of categoryWeightSum) {
    const n = activeCountByCategory.get(catId) ?? 1;
    out.set(catId, weight / Math.max(1, n));
  }
  return out;
}

export function scoreListings(
  catalog: CatalogListing[],
  dbByOlxId: Map<number, DbListingInfo>,
  inquiryByListing: Map<number, number>,
  categoryDemand: Map<number, number>,
  config: RefreshScoreConfig,
  nowMs = Date.now(),
): ScoredListing[] {
  // Filter candidates
  const candidates: Array<{
    cat: CatalogListing;
    db: DbListingInfo | undefined;
    inquiryRaw: number;
    categoryRaw: number;
    valueRaw: number;
    stalenessRaw: number;
    unmapped: boolean;
  }> = [];

  const activeCountByCat = new Map<number, number>();
  for (const c of catalog) {
    if (c.status === "active") {
      activeCountByCat.set(
        c.categoryId,
        (activeCountByCat.get(c.categoryId) ?? 0) + 1,
      );
    }
  }

  // Recompute category demand if empty map was passed with raw weights —
  // caller should pass already-normalized demand; we just look up.
  for (const c of catalog) {
    if (c.status !== "active") continue;
    if (!c.refreshAvailable) continue;

    const db = dbByOlxId.get(c.olxListingId);
    // OOS: skip when we know in_feed=false
    if (db && db.inFeed === false) continue;
    // blacklisted
    if (db?.blacklisted) continue;

    const unmapped = db?.unmapped === true || db == null;
    const inquiryRaw = inquiryByListing.get(c.olxListingId) ?? 0;
    const categoryRaw = categoryDemand.get(c.categoryId) ?? 0;
    const valueRaw = Math.log(Math.max(1, c.price));

    const lastBumpIso = db?.lastRefreshedAt ?? null;
    const daysSinceBump = lastBumpIso
      ? ageDays(lastBumpIso, nowMs)
      : c.olxDate != null
        ? ageDays(c.olxDate, nowMs)
        : config.stalenessCapDays;
    const stalenessRaw = Math.min(
      daysSinceBump / Math.max(1, config.stalenessCapDays),
      1,
    );

    candidates.push({
      cat: c,
      db,
      inquiryRaw,
      categoryRaw,
      valueRaw,
      stalenessRaw,
      unmapped,
    });
  }

  if (candidates.length === 0) return [];

  const inqRanks = percentileRanks(candidates.map((c) => c.inquiryRaw));
  const catRanks = percentileRanks(candidates.map((c) => c.categoryRaw));
  const valRanks = percentileRanks(candidates.map((c) => c.valueRaw));
  // staleness already 0..1
  const scored: ScoredListing[] = candidates.map((c, i) => {
    let score =
      config.wInquiry * inqRanks[i] +
      config.wCategory * catRanks[i] +
      config.wValue * valRanks[i] +
      config.wStaleness * c.stalenessRaw;

    if (c.unmapped) score *= config.unmappedPenalty;

    return {
      olxListingId: c.cat.olxListingId,
      listingId: c.db?.listingId ?? null,
      categoryId: c.cat.categoryId,
      price: c.cat.price,
      score,
      inquiryRaw: c.inquiryRaw,
      categoryRaw: c.categoryRaw,
      valueRaw: c.valueRaw,
      stalenessRaw: c.stalenessRaw,
      unmapped: c.unmapped,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** Days remaining in calendar month (including today). Min 1. */
export function remainingDaysInMonth(now = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  return Math.max(1, lastDay - today + 1);
}
