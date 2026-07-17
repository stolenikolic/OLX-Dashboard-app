"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { dispatchGitHubWorkflow, type WorkflowName } from "@/lib/github/dispatch";
import {
  createClientForProfileId,
} from "@/lib/listings/profile-client";
import { calculateProductPrice } from "@/lib/pricing/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

async function getListingForAction(listingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, profile_id, product_id, olx_listing_id, status, manual_price, posted_price",
    )
    .eq("id", listingId)
    .single();

  if (error || !data?.olx_listing_id) {
    throw new Error("Oglas nije pronađen ili nema OLX ID.");
  }

  return data;
}

export async function hideListingAction(listingId: string) {
  await requireUser();
  const listing = await getListingForAction(listingId);
  const client = await createClientForProfileId(listing.profile_id);

  await client.hideListing(listing.olx_listing_id!);

  const admin = createAdminClient();
  await admin
    .from("listings")
    .update({
      status: "hidden",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  revalidatePath("/oglasi");
  revalidatePath("/");
}

export async function unhideListingAction(listingId: string) {
  await requireUser();
  const listing = await getListingForAction(listingId);
  const client = await createClientForProfileId(listing.profile_id);

  await client.unhideListing(listing.olx_listing_id!);

  const admin = createAdminClient();
  await admin
    .from("listings")
    .update({
      status: "active",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  revalidatePath("/oglasi");
  revalidatePath("/");
}

export async function refreshListingPriceAction(listingId: string) {
  await requireUser();
  const listing = await getListingForAction(listingId);
  if (!listing.product_id) {
    throw new Error("Oglas nema povezan proizvod.");
  }

  const admin = createAdminClient();
  const client = await createClientForProfileId(listing.profile_id);

  let newPrice: number;
  if (listing.manual_price != null) {
    newPrice = Math.round(Number(listing.manual_price));
  } else {
    const pricing = await calculateProductPrice(
      admin,
      listing.profile_id,
      listing.product_id,
      { applyVariance: true },
    );
    newPrice = pricing.finalPrice;
  }

  await client.updateListing(listing.olx_listing_id!, { price: newPrice });

  await admin
    .from("listings")
    .update({
      posted_price: newPrice,
      last_price_sync_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  revalidatePath("/oglasi");
  revalidatePath("/");
}

export async function finishListingAction(listingId: string) {
  await requireUser();
  const listing = await getListingForAction(listingId);
  const client = await createClientForProfileId(listing.profile_id);

  await client.finishListing(listing.olx_listing_id!);

  const admin = createAdminClient();
  await admin
    .from("listings")
    .update({
      status: "finished",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId);

  revalidatePath("/oglasi");
  revalidatePath("/");
}

export async function setProductImportOverrideAction(
  productId: string,
  value: Database["public"]["Enums"]["import_override"],
) {
  await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({ import_override: value, updated_at: new Date().toISOString() })
    .eq("id", productId);

  if (error) throw new Error(error.message);
  revalidatePath("/oglasi");
}

export async function dispatchWorkflowAction(
  workflow: WorkflowName,
  profileId?: string,
) {
  await requireAdmin();
  const inputs: Record<string, string> = {};
  if (profileId) inputs.profile_id = profileId;
  const result = await dispatchGitHubWorkflow(workflow, inputs);
  if (!result.ok) throw new Error(result.message);
  return result.message;
}

export async function updateProfileSettingsAction(
  profileId: string,
  form: {
    name: string;
    status: Database["public"]["Enums"]["profile_status"];
    kurs: number;
    kurs_uvoz: number;
    daily_post_limit: number;
    description_template: string;
    auth_method: Database["public"]["Enums"]["olx_auth_method"];
    olx_username: string;
    olx_login_email: string;
    olx_password_enc: string;
    olx_client_id: string;
    olx_client_token_enc: string;
    proxy_url: string;
  },
) {
  await requireAdmin();
  const admin = createAdminClient();

  const update: Database["public"]["Tables"]["profiles"]["Update"] = {
    name: form.name.trim(),
    status: form.status,
    kurs: form.kurs,
    kurs_uvoz: form.kurs_uvoz,
    daily_post_limit: form.daily_post_limit,
    description_template: form.description_template || null,
    auth_method: form.auth_method,
    olx_username: form.olx_username || null,
    olx_login_email: form.olx_login_email || null,
    olx_client_id: form.olx_client_id || null,
    proxy_url: form.proxy_url || null,
    updated_at: new Date().toISOString(),
  };

  if (form.olx_password_enc.trim()) {
    update.olx_password_enc = form.olx_password_enc;
    update.olx_bearer_token = null;
    update.olx_token_expires_at = null;
  }
  if (form.olx_client_token_enc.trim()) {
    update.olx_client_token_enc = form.olx_client_token_enc;
  }

  const { error } = await admin.from("profiles").update(update).eq("id", profileId);

  if (error) throw new Error(error.message);

  revalidatePath(`/profili/${profileId}/podesavanja`);
  revalidatePath("/");
}

export async function updateCategoryPriorityAction(
  profileId: string,
  items: Array<{ categoryId: string; priority: number; enabled: boolean }>,
) {
  await requireAdmin();
  const admin = createAdminClient();

  for (const item of items) {
    await admin.from("profile_category_priority").upsert(
      {
        profile_id: profileId,
        category_id: item.categoryId,
        priority: item.priority,
        enabled: item.enabled,
      },
      { onConflict: "profile_id,category_id" },
    );
  }

  revalidatePath(`/profili/${profileId}/kategorije`);
}

export async function updateCategoryMarginsAction(
  categoryId: string,
  form: {
    marza_huf: number;
    marza_bih: number;
    import_flag: boolean;
  },
) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("categories")
    .update({
      marza_huf: form.marza_huf,
      marza_bih: form.marza_bih,
      import_flag: form.import_flag,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/kategorije");
}

export async function createWorkerAccountAction(form: {
  email: string;
  password: string;
  profileId: string;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email: form.email.trim(),
      password: form.password,
      email_confirm: true,
    });

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? "Kreiranje korisnika nije uspjelo.");
  }

  const { error: memberError } = await admin.from("profile_members").insert({
    user_id: userData.user.id,
    profile_id: form.profileId,
    role: "worker",
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  revalidatePath("/admin/korisnici");
}

export async function createTestProfileAction(form: {
  name: string;
  olx_username: string;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .insert({
      name: form.name.trim(),
      olx_username: form.olx_username.trim() || null,
      status: "paused",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Greška");

  revalidatePath("/");
  revalidatePath("/admin/korisnici");
  return data.id;
}

export async function setSelectedProfileAction(profileId: string) {
  await requireUser();
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  if (profileId) {
    jar.set("dashboard_profile_id", profileId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    jar.delete("dashboard_profile_id");
  }
  revalidatePath("/");
}
