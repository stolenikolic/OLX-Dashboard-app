import type { SupabaseClient } from "@supabase/supabase-js";

import { buildListingPayload } from "@/lib/listings/build-payload";
import { mapProductAttributes } from "@/lib/listings/map-attributes";
import { calculateProductPrice } from "@/lib/pricing/context";
import { OlxClient } from "@/lib/olx/client";
import type { CreateListingPayload } from "@/lib/olx/types";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type PostListingOptions = {
  profileId: string;
  productId: string;
  client: OlxClient;
  dryRun?: boolean;
};

export type PostListingResult =
  | { ok: true; dryRun: true; payload: CreateListingPayload; price: number }
  | {
      ok: true;
      dryRun: false;
      olxListingId: number;
      price: number;
      listingRowId: string;
    }
  | { ok: false; reason: "already_posted"; olxListingId?: number | null };

export async function loadProductForListing(admin: Admin, productId: string) {
  const { data, error } = await admin
    .from("products")
    .select(
      `
      id,
      feed_uuid,
      title,
      main_image_url,
      specs,
      category_id,
      categories (
        id,
        olx_category_id,
        internal_slug
      )
    `,
    )
    .eq("id", productId)
    .single();

  if (error || !data) {
    throw new Error(`Proizvod ${productId} nije pronađen.`);
  }

  const cat = data.categories;
  if (!cat?.olx_category_id) {
    throw new Error(
      `Kategorija "${cat?.internal_slug ?? data.category_id}" nema mapiran olx_category_id.`,
    );
  }

  if (!data.main_image_url) {
    throw new Error(`Proizvod "${data.title}" nema main_image_url.`);
  }

  return {
    id: data.id,
    feedUuid: data.feed_uuid,
    title: data.title,
    mainImageUrl: data.main_image_url,
    specs: (data.specs ?? {}) as Record<string, unknown>,
    categoryId: cat.id,
    olxCategoryId: Number(cat.olx_category_id),
  };
}

export async function checkExistingListing(
  admin: Admin,
  profileId: string,
  productId: string,
): Promise<{ exists: boolean; olxListingId?: number | null; status?: string }> {
  const { data } = await admin
    .from("listings")
    .select("olx_listing_id, status")
    .eq("profile_id", profileId)
    .eq("product_id", productId)
    .maybeSingle();

  if (!data) return { exists: false };
  return {
    exists: true,
    olxListingId: data.olx_listing_id,
    status: data.status,
  };
}

export async function postProductListing(
  admin: Admin,
  options: PostListingOptions,
): Promise<PostListingResult> {
  const { profileId, productId, client, dryRun = false } = options;

  const { data: existingRow } = await admin
    .from("listings")
    .select("olx_listing_id, status, manual_price")
    .eq("profile_id", profileId)
    .eq("product_id", productId)
    .maybeSingle();

  if (
    existingRow &&
    existingRow.status !== "failed" &&
    existingRow.status !== "draft"
  ) {
    return {
      ok: false,
      reason: "already_posted",
      olxListingId: existingRow.olx_listing_id,
    };
  }

  const product = await loadProductForListing(admin, productId);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("description_template")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    throw new Error(`Profil ${profileId} nije pronađen.`);
  }

  const attributes = await mapProductAttributes(
    admin,
    product.categoryId,
    product.specs,
  );

  const pricing = await calculateProductPrice(admin, profileId, productId, {
    applyVariance: true,
  });

  const finalPrice =
    existingRow?.manual_price != null
      ? Math.round(Number(existingRow.manual_price))
      : pricing.finalPrice;

  const payload = buildListingPayload({
    title: product.title,
    olxCategoryId: product.olxCategoryId,
    price: finalPrice,
    descriptionTemplate: profile.description_template,
    specs: product.specs,
    attributes,
  });

  if (dryRun) {
    return { ok: true, dryRun: true, payload, price: finalPrice };
  }

  const created = await client.createListing(payload);
  const olxListingId = created.id;

  try {
    const images = await client.uploadListingImage(
      olxListingId,
      product.mainImageUrl,
    );
    const main = images.find((i) => i.main) ?? images[0];
    if (main && !main.main) {
      await client.setMainImage(olxListingId, main.id);
    }

    await client.publishListing(olxListingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("listings").upsert(
      {
        profile_id: profileId,
        product_id: productId,
        feed_uuid: product.feedUuid,
        olx_listing_id: olxListingId,
        status: "failed",
        posted_price: finalPrice,
        price_origin: pricing.origin,
        was_import: pricing.wasImport,
        manual_price: existingRow?.manual_price ?? null,
        error: message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,product_id" },
    );
    throw err;
  }

  const { data: row, error: insertError } = await admin
    .from("listings")
    .upsert(
      {
        profile_id: profileId,
        product_id: productId,
        feed_uuid: product.feedUuid,
        olx_listing_id: olxListingId,
        status: "active",
        posted_price: finalPrice,
        price_origin: pricing.origin,
        was_import: pricing.wasImport,
        manual_price: existingRow?.manual_price ?? null,
        last_published_at: new Date().toISOString(),
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,product_id" },
    )
    .select("id")
    .single();

  if (insertError || !row) {
    throw new Error(
      `OLX oglas #${olxListingId} objavljen, ali zapis u listings nije uspio: ${insertError?.message}`,
    );
  }

  return {
    ok: true,
    dryRun: false,
    olxListingId,
    price: finalPrice,
    listingRowId: row.id,
  };
}
