import type { SupabaseClient } from "@supabase/supabase-js";

import { bumpListingManual } from "@/lib/listings/refresh-listings";
import { fetchAllUserListingPrices } from "@/lib/listings/fetch-user-listings";
import { syncUnmappedListings } from "@/lib/listings/sync-unmapped";
import { getPacing } from "@/lib/workers/job-pacing";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import {
  buildCompetitorIndex,
  countCompetitorListings,
  findCompetitorMin,
} from "@/lib/pricing/competitor";
import {
  loadProfilePriceMode,
  resolveProductListingPrice,
} from "@/lib/pricing/context";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type ManualAction =
  | "hide"
  | "unhide"
  | "finish"
  | "refresh_price"
  | "bump"
  | "hide_unmapped"
  | "finish_unmapped"
  | "refresh_unmapped"
  | "delete_unmapped"
  | "verify_import";

const ACTIONS = new Set<string>([
  "hide",
  "unhide",
  "finish",
  "refresh_price",
  "bump",
  "hide_unmapped",
  "finish_unmapped",
  "refresh_unmapped",
  "delete_unmapped",
  "verify_import",
]);

export function parseManualAction(raw: string | undefined): ManualAction {
  const value = (raw ?? "").trim();
  if (!ACTIONS.has(value)) {
    throw new Error(
      `Nepoznata manual action: ${raw}. Dozvoljeno: ${[...ACTIONS].join(", ")}`,
    );
  }
  return value as ManualAction;
}

export type ManualActionOptions = {
  profileId: string;
  action: ManualAction;
  listingId?: string;
  allowPaid?: boolean;
};

export type ManualActionResult = {
  summary: string;
  context: Record<string, unknown>;
};

async function refreshListingPrice(
  admin: Admin,
  listing: {
    id: string;
    profile_id: string;
    product_id: string | null;
    olx_listing_id: number;
    manual_price: number | null;
  },
) {
  if (!listing.product_id) {
    throw new Error("Oglas nema povezan proizvod.");
  }

  const client = await createClientForProfile(
    admin,
    await loadProfileForWorker(admin, listing.profile_id, {
      job: "refresh_prices",
    }),
  );

  let newPrice: number;
  let audit: {
    competitor_price: number | null;
    competitor_seller_id: number | null;
    competitor_matched_title: string | null;
    price_floor_applied: boolean;
    price_origin?: Database["public"]["Enums"]["offer_origin"] | null;
    was_import?: boolean;
  } = {
    competitor_price: null,
    competitor_seller_id: null,
    competitor_matched_title: null,
    price_floor_applied: false,
  };

  if (listing.manual_price != null) {
    newPrice = Math.round(Number(listing.manual_price));
  } else {
    const mode = await loadProfilePriceMode(admin, listing.profile_id);
    let competitorMin = null;

    if (mode === "competitor_minus_1") {
      const count = await countCompetitorListings(admin);
      if (count > 0) {
        const index = await buildCompetitorIndex(admin);
        const { data: product } = await admin
          .from("products")
          .select("title, categories(olx_category_id)")
          .eq("id", listing.product_id)
          .single();

        if (product) {
          const olxCategoryId =
            product.categories?.olx_category_id != null
              ? Number(product.categories.olx_category_id)
              : null;
          competitorMin = findCompetitorMin(
            index,
            product.title,
            olxCategoryId,
          );
        }
      }
    }

    const pricing = await resolveProductListingPrice(
      admin,
      listing.profile_id,
      listing.product_id,
      { mode, competitorMin, applyVariance: true },
    );
    newPrice = pricing.finalPrice;
    audit = {
      competitor_price: competitorMin?.price ?? null,
      competitor_seller_id: competitorMin?.sellerId ?? null,
      competitor_matched_title: competitorMin?.matchedTitle ?? null,
      price_floor_applied: pricing.floorApplied,
      price_origin: pricing.origin,
      was_import: pricing.wasImport,
    };
  }

  await client.updateListing(listing.olx_listing_id, { price: newPrice });

  await admin
    .from("listings")
    .update({
      posted_price: newPrice,
      last_price_sync_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
      ...audit,
    })
    .eq("id", listing.id);

  return { newPrice };
}

async function verifyImport(admin: Admin, profileId: string) {
  const profile = await loadProfileForWorker(admin, profileId);
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) {
    throw new Error("Profil nema OLX username.");
  }
  const client = await createClientForProfile(admin, profile);
  const pacing = getPacing(profile, "import_listings");
  const olxPrices = await fetchAllUserListingPrices(client, username, profileId, pacing);

  const { data: listings, error } = await admin
    .from("listings")
    .select("id, olx_listing_id")
    .eq("profile_id", profileId)
    .not("olx_listing_id", "is", null);

  if (error) throw new Error(error.message);

  let removed = 0;
  let updated = 0;
  for (const row of listings ?? []) {
    const olxId = row.olx_listing_id!;
    const price = olxPrices.get(olxId);
    if (price == null) {
      await admin.from("listings").delete().eq("id", row.id);
      removed++;
      continue;
    }
    await admin
      .from("listings")
      .update({
        posted_price: price,
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", row.id);
    updated++;
  }

  return { olxTotal: olxPrices.size, removed, updated };
}

export async function runManualActionWorker(
  admin: Admin,
  options: ManualActionOptions,
): Promise<ManualActionResult> {
  const { profileId, action, listingId, allowPaid } = options;
  const profile = await loadProfileForWorker(admin, profileId);

  if (action === "refresh_unmapped") {
    const username = profile.olx_username ?? profile.olx_login_email;
    if (!username) {
      throw new Error("Profil nema OLX username — postavi ga u podešavanjima.");
    }
    const client = await createClientForProfile(admin, profile);
    const result = await syncUnmappedListings(
      admin,
      client,
      profileId,
      username,
    );
    return {
      summary: `Nemapirani: olx=${result.olxTotal}, unmapped=${result.unmapped}, inserted=${result.inserted}.`,
      context: result,
    };
  }

  if (action === "verify_import") {
    const result = await verifyImport(admin, profileId);
    return {
      summary: `CSV verifikacija: OLX=${result.olxTotal}, ažurirano=${result.updated}, uklonjeno=${result.removed}.`,
      context: result,
    };
  }

  if (action === "hide_unmapped" || action === "finish_unmapped") {
    if (!listingId) throw new Error("listing_id (unmapped id) je obavezan.");
    const { data: unmapped, error } = await admin
      .from("unmapped_listings")
      .select("id, profile_id, olx_listing_id")
      .eq("id", listingId)
      .eq("profile_id", profileId)
      .single();
    if (error || !unmapped) {
      throw new Error("Nemapirani oglas nije pronađen.");
    }
    const client = await createClientForProfile(admin, profile);
    if (action === "hide_unmapped") {
      await client.hideListing(unmapped.olx_listing_id);
    } else {
      await client.finishListing(unmapped.olx_listing_id);
    }
    await admin.from("unmapped_listings").delete().eq("id", unmapped.id);
    return {
      summary: `${action} OLX #${unmapped.olx_listing_id}`,
      context: { olxListingId: unmapped.olx_listing_id },
    };
  }

  if (action === "delete_unmapped") {
    throw new Error(
      "delete_unmapped koristi poseban workflow delete-unmapped.yml.",
    );
  }

  if (!listingId) throw new Error("listing_id je obavezan za ovu akciju.");

  const { data: listing, error } = await admin
    .from("listings")
    .select(
      "id, profile_id, product_id, olx_listing_id, status, manual_price, posted_price",
    )
    .eq("id", listingId)
    .eq("profile_id", profileId)
    .single();

  if (error || !listing?.olx_listing_id) {
    throw new Error("Oglas nije pronađen ili nema OLX ID.");
  }

  const client = await createClientForProfile(admin, profile);

  if (action === "hide") {
    await client.hideListing(listing.olx_listing_id);
    await admin
      .from("listings")
      .update({
        status: "hidden",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing.id);
    return { summary: `Sakrivен OLX #${listing.olx_listing_id}`, context: {} };
  }

  if (action === "unhide") {
    await client.unhideListing(listing.olx_listing_id);
    await admin
      .from("listings")
      .update({
        status: "active",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing.id);
    return { summary: `Vraćen OLX #${listing.olx_listing_id}`, context: {} };
  }

  if (action === "finish") {
    await client.finishListing(listing.olx_listing_id);
    await admin
      .from("listings")
      .update({
        status: "finished",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing.id);
    return { summary: `Završen OLX #${listing.olx_listing_id}`, context: {} };
  }

  if (action === "refresh_price") {
    const { newPrice } = await refreshListingPrice(admin, {
      ...listing,
      olx_listing_id: listing.olx_listing_id,
    });
    return {
      summary: `Cijena OLX #${listing.olx_listing_id} = ${newPrice} KM`,
      context: { newPrice },
    };
  }

  if (action === "bump") {
    const result = await bumpListingManual(
      admin,
      client,
      listing.profile_id,
      listing.id,
      listing.olx_listing_id,
      allowPaid ?? false,
    );
    return {
      summary: result.wasPaid
        ? `Bump OLX #${listing.olx_listing_id} (plaćeno)`
        : `Bump OLX #${listing.olx_listing_id} (besplatno)`,
      context: result,
    };
  }

  throw new Error(`Nepoznata akcija: ${action}`);
}

export async function runManualActionJob(
  admin: Admin,
  options: ManualActionOptions,
): Promise<ManualActionResult> {
  const jobRunId = await startJobRun(admin, {
    job: "manual_action",
    profileId: options.profileId,
  });

  try {
    const result = await runManualActionWorker(admin, options);
    await finishJobRun(admin, jobRunId, {
      status: "success",
      items_processed: 1,
      items_succeeded: 1,
      items_failed: 0,
      summary: result.summary,
    });
    await appendJobLog(admin, jobRunId, {
      level: "info",
      message: result.summary,
      context: result.context as Json,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });
    await appendJobLog(admin, jobRunId, {
      level: "error",
      message: "manual_action neuspješan",
      context: { error: message, action: options.action },
    });
    throw err;
  }
}
