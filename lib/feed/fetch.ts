import { parseFeedProducts, type FeedProduct } from "@/lib/feed/types";

export type FetchFeedResult = {
  products: FeedProduct[];
  invalid: number;
  total: number;
};

/**
 * Downloads and validates the product feed.
 *
 * Configuration (env):
 * - FEED_URL       (required) full URL to the feed JSON (may include a signed token)
 * - FEED_API_KEY   (optional) sent according to FEED_AUTH_MODE
 * - FEED_AUTH_MODE (optional) "apikey" (default) | "bearer" | "both" | "none"
 */
export async function fetchFeed(): Promise<FetchFeedResult> {
  const url = process.env.FEED_URL;
  if (!url) {
    throw new Error("FEED_URL nije postavljen u okruženju.");
  }

  const apiKey = process.env.FEED_API_KEY;
  const mode = (process.env.FEED_AUTH_MODE ?? "apikey").toLowerCase();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey && mode !== "none") {
    if (mode === "apikey" || mode === "both") {
      headers.apikey = apiKey;
    }
    if (mode === "bearer" || mode === "both") {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Preuzimanje feed-a nije uspjelo: HTTP ${response.status} ${response.statusText}. ${body.slice(0, 300)}`,
    );
  }

  const payload: unknown = await response.json();
  const { products, invalid } = parseFeedProducts(payload);

  return { products, invalid, total: products.length + invalid };
}
