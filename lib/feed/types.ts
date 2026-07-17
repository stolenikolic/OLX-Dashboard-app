import { z } from "zod";

/**
 * Schema for a single offer inside a feed product (e.g. the "HU" or "BA" entry).
 * Kept permissive: unknown extra keys are stripped, currency is free text.
 */
const FeedOfferSchema = z.object({
  acquisition_price: z.coerce.number(),
  acquisition_currency: z.string().min(1),
  supplier_code: z.string().nullish(),
});

export const FeedProductSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shop_price: z.coerce.number().nullish(),
  offers: z
    .object({
      HU: FeedOfferSchema.nullish(),
      BA: FeedOfferSchema.nullish(),
    })
    .default({}),
  category: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  main_image: z.string().nullish(),
  specs: z.record(z.string(), z.unknown()).default({}),
});

export type FeedOffer = z.infer<typeof FeedOfferSchema>;
export type FeedProduct = z.infer<typeof FeedProductSchema>;

/**
 * Parses an arbitrary feed payload into validated products.
 * Invalid items are skipped and counted rather than aborting the whole sync.
 */
export function parseFeedProducts(payload: unknown): {
  products: FeedProduct[];
  invalid: number;
} {
  const rawList = extractList(payload);

  const products: FeedProduct[] = [];
  let invalid = 0;

  for (const raw of rawList) {
    const parsed = FeedProductSchema.safeParse(raw);
    if (parsed.success) {
      products.push(parsed.data);
    } else {
      invalid += 1;
    }
  }

  return { products, invalid };
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.products)) return obj.products;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
  }
  throw new Error(
    "Feed payload nije prepoznat (očekivan niz proizvoda ili { products: [...] }).",
  );
}
