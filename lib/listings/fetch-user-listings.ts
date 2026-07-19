import type { OlxClient } from "@/lib/olx/client";
import { fetchAllUserListingsViaSearch } from "@/lib/olx/search-user-listings";
import type { OlxUserListing } from "@/lib/olx/types";

/**
 * Povlači sve aktivne oglase preko javnog search API-ja
 * (sort desc+asc — /users/.../listings ne poštuje sort_order iznad 10k).
 */
export async function fetchAllUserListings(
  client: OlxClient,
  username: string,
): Promise<Map<number, OlxUserListing>> {
  const user = await client.getUser(username);
  const userId = user.id;
  console.log(`OLX user ${username} → user_id=${userId}`);

  const searchMap = await fetchAllUserListingsViaSearch(userId);
  const byId = new Map<number, OlxUserListing>();

  for (const ad of searchMap.values()) {
    byId.set(ad.id, {
      id: ad.id,
      title: ad.title,
      category_id: ad.categoryId ?? 0,
      price: ad.price,
      status: "active",
      image_url: ad.imageUrl,
    });
  }

  return byId;
}

/** id → price (CSV import dedup / posted_price). */
export async function fetchAllUserListingPrices(
  client: OlxClient,
  username: string,
): Promise<Map<number, number>> {
  const listings = await fetchAllUserListings(client, username);
  const prices = new Map<number, number>();
  for (const [id, listing] of listings) {
    prices.set(id, listing.price);
  }
  return prices;
}
