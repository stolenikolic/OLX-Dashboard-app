import { truncateOlxTitle } from "@/lib/listings/build-payload";

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Ključevi za indeks feed naslova (puni + OLX-skraćeni). */
export function feedTitleKeys(title: string): string[] {
  const full = normalizeTitle(title);
  const truncated = normalizeTitle(truncateOlxTitle(title));
  return full === truncated ? [full] : [full, truncated];
}

export function olxTitleKey(title: string): string {
  return normalizeTitle(title);
}

export type TitleMatchProduct = {
  id: string;
  feed_uuid: string;
  title: string;
  olxCategoryId: number | null;
};

export type TitleIndex = Map<string, TitleMatchProduct[]>;

export function buildTitleIndex(products: TitleMatchProduct[]): {
  index: TitleIndex;
  byCategory: Map<number, TitleMatchProduct[]>;
} {
  const index: TitleIndex = new Map();
  const byCategory = new Map<number, TitleMatchProduct[]>();

  for (const product of products) {
    if (product.olxCategoryId != null) {
      const bucket = byCategory.get(product.olxCategoryId) ?? [];
      bucket.push(product);
      byCategory.set(product.olxCategoryId, bucket);
    }
    for (const key of feedTitleKeys(product.title)) {
      const list = index.get(key) ?? [];
      list.push(product);
      index.set(key, list);
    }
  }

  return { index, byCategory };
}

export function findProductForOlxListing(
  index: TitleIndex,
  olxTitle: string,
  olxCategoryId: number,
  byCategory?: Map<number, TitleMatchProduct[]>,
): TitleMatchProduct | null {
  const key = olxTitleKey(olxTitle);
  const candidates = index.get(key) ?? [];

  const sameCategory = candidates.filter(
    (p) => p.olxCategoryId === olxCategoryId,
  );
  if (sameCategory.length >= 1) return sameCategory[0];

  if (candidates.length === 1) return candidates[0];

  const catProducts = byCategory?.get(olxCategoryId) ?? [];
  for (const p of catProducts) {
    const truncated = normalizeTitle(truncateOlxTitle(p.title));
    const full = normalizeTitle(p.title);
    if (
      truncated === key ||
      full === key ||
      (key.length >= 15 && full.startsWith(key)) ||
      (truncated.length >= 15 && key.startsWith(truncated))
    ) {
      return p;
    }
  }

  return null;
}
