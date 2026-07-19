"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireUser } from "@/lib/auth/dal";
import {
  fetchActivePostJob,
  fetchJobLogs,
  searchProductsForConnect,
} from "@/lib/dashboard/queries";
import {
  cancelGitHubWorkflowRun,
  dispatchGitHubWorkflow,
  githubActionsWorkflowUrl,
  type WorkflowName,
} from "@/lib/github/dispatch";
import { importListingsFromCsv } from "@/lib/listings/import-from-csv";
import {
  countCandidateProducts,
  countPostedToday,
} from "@/lib/listings/post-queue";
import {
  createClientForProfileId,
  createClientForProfileRecord,
  loadProfileForWorker,
} from "@/lib/listings/profile-client";
import { syncUnmappedListings } from "@/lib/listings/sync-unmapped";
import { calculateProductPrice } from "@/lib/pricing/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requestJobCancel } from "@/lib/workers/job-log";
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

export type CategoryPostPreview = {
  totalInFeed: number;
  alreadyListed: number;
  candidates: number;
  willPost: number;
  postedToday: number;
  dailyLimit: number;
  remaining: number;
  categorySlug: string;
  categoryName: string;
};

async function assertCategoryPostable(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  categoryId: string,
): Promise<{ slug: string; name: string }> {
  const { data: cat, error: catError } = await admin
    .from("categories")
    .select("id, internal_slug, internal_name, olx_category_id, is_postable")
    .eq("id", categoryId)
    .single();

  if (catError || !cat) {
    throw new Error("Kategorija nije pronađena.");
  }
  if (!cat.olx_category_id || !cat.is_postable) {
    throw new Error("Kategorija nije spremna za postavljanje (mapiranje / postable).");
  }

  const { data: priority } = await admin
    .from("profile_category_priority")
    .select("enabled")
    .eq("profile_id", profileId)
    .eq("category_id", categoryId)
    .maybeSingle();

  if (priority && !priority.enabled) {
    throw new Error("Kategorija je isključena (enabled=false) za ovaj profil.");
  }

  // Ako nema priority reda, default je enabled samo ako je mapirana (kao u formi).
  if (!priority && cat.olx_category_id == null) {
    throw new Error("Kategorija nije omogućena za ovaj profil.");
  }

  return { slug: cat.internal_slug, name: cat.internal_name };
}

export async function previewCategoryPostAction(
  profileId: string,
  categoryId: string,
): Promise<CategoryPostPreview> {
  await requireAdmin();
  const admin = createAdminClient();
  const cat = await assertCategoryPostable(admin, profileId, categoryId);
  const profile = await loadProfileForWorker(admin, profileId);

  const [stats, postedToday] = await Promise.all([
    countCandidateProducts(admin, profileId, categoryId),
    countPostedToday(admin, profileId),
  ]);

  const dailyLimit = profile.daily_post_limit;
  const remaining = Math.max(0, dailyLimit - postedToday);

  return {
    totalInFeed: stats.totalInFeed,
    alreadyListed: stats.alreadyListed,
    candidates: stats.candidates,
    willPost: Math.min(stats.candidates, remaining),
    postedToday,
    dailyLimit,
    remaining,
    categorySlug: cat.slug,
    categoryName: cat.name,
  };
}

export async function dispatchCategoryPostAction(
  profileId: string,
  categoryId: string,
): Promise<{ message: string; actionsUrl: string | null }> {
  await requireAdmin();
  const admin = createAdminClient();
  await assertCategoryPostable(admin, profileId, categoryId);

  const supabase = await createClient();
  const active = await fetchActivePostJob(supabase, profileId);
  if (active) {
    throw new Error(
      "Postavljanje već radi za ovaj profil. Sačekaj završetak ili zaustavi job.",
    );
  }

  const result = await dispatchGitHubWorkflow("post-listings", {
    profile_id: profileId,
    category_id: categoryId,
    skip_import: "true",
  });
  if (!result.ok) throw new Error(result.message);

  return {
    message: result.message,
    actionsUrl: githubActionsWorkflowUrl("post-listings"),
  };
}

export async function cancelPostJobAction(
  profileId: string,
): Promise<{ message: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const supabase = await createClient();
  const active = await fetchActivePostJob(supabase, profileId);

  if (!active) {
    throw new Error("Nema aktivnog post_listings joba za ovaj profil.");
  }

  await requestJobCancel(admin, active.id);

  let ghMessage = "";
  if (active.github_run_id != null) {
    const gh = await cancelGitHubWorkflowRun(active.github_run_id);
    ghMessage = gh.ok
      ? ` ${gh.message}`
      : ` (GitHub cancel: ${gh.message})`;
  }

  return {
    message: `Zaustavljanje zatraženo.${ghMessage}`,
  };
}

export async function getActivePostJobAction(profileId: string) {
  await requireAdmin();
  const supabase = await createClient();
  return fetchActivePostJob(supabase, profileId);
}

export async function getJobLogsAction(
  jobRunId: string,
  afterCreatedAt?: string,
) {
  await requireAdmin();
  const supabase = await createClient();
  return fetchJobLogs(supabase, jobRunId, { afterCreatedAt });
}

export async function refreshUnmappedListingsAction(profileId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const profile = await loadProfileForWorker(admin, profileId);
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) {
    throw new Error("Profil nema OLX username — postavi ga u podešavanjima.");
  }

  const client = await createClientForProfileRecord(profile);
  const result = await syncUnmappedListings(
    admin,
    client,
    profileId,
    username,
  );

  revalidatePath("/oglasi");
  return result;
}

export async function searchFeedProductsAction(query: string) {
  await requireAdmin();
  const supabase = await createClient();
  return searchProductsForConnect(supabase, query);
}

export async function connectUnmappedListingAction(
  unmappedId: string,
  productId: string,
) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: unmapped, error: unmappedError } = await admin
    .from("unmapped_listings")
    .select("id, profile_id, olx_listing_id, title, price")
    .eq("id", unmappedId)
    .single();

  if (unmappedError || !unmapped) {
    throw new Error("Nemapirani oglas nije pronađen.");
  }

  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, feed_uuid, title")
    .eq("id", productId)
    .single();

  if (productError || !product) {
    throw new Error("Feed artikal nije pronađen.");
  }

  const { data: conflictByOlx } = await admin
    .from("listings")
    .select("id, product_id")
    .eq("profile_id", unmapped.profile_id)
    .eq("olx_listing_id", unmapped.olx_listing_id)
    .maybeSingle();

  if (conflictByOlx && conflictByOlx.product_id !== productId) {
    await admin.from("listings").delete().eq("id", conflictByOlx.id);
  }

  const { error: upsertError } = await admin.from("listings").upsert(
    {
      profile_id: unmapped.profile_id,
      product_id: product.id,
      feed_uuid: product.feed_uuid,
      olx_listing_id: unmapped.olx_listing_id,
      status: "active",
      posted_price: unmapped.price,
      last_published_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,product_id" },
  );

  if (upsertError) {
    throw new Error(`Povezivanje nije uspjelo: ${upsertError.message}`);
  }

  await admin.from("unmapped_listings").delete().eq("id", unmappedId);

  revalidatePath("/oglasi");
  revalidatePath("/");
}

export async function hideUnmappedListingAction(unmappedId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: unmapped, error } = await admin
    .from("unmapped_listings")
    .select("id, profile_id, olx_listing_id")
    .eq("id", unmappedId)
    .single();

  if (error || !unmapped) {
    throw new Error("Nemapirani oglas nije pronađen.");
  }

  const client = await createClientForProfileId(unmapped.profile_id);
  await client.hideListing(unmapped.olx_listing_id);
  await admin.from("unmapped_listings").delete().eq("id", unmappedId);

  revalidatePath("/oglasi");
}

export async function finishUnmappedListingAction(unmappedId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: unmapped, error } = await admin
    .from("unmapped_listings")
    .select("id, profile_id, olx_listing_id")
    .eq("id", unmappedId)
    .single();

  if (error || !unmapped) {
    throw new Error("Nemapirani oglas nije pronađen.");
  }

  const client = await createClientForProfileId(unmapped.profile_id);
  await client.finishListing(unmapped.olx_listing_id);
  await admin.from("unmapped_listings").delete().eq("id", unmappedId);

  revalidatePath("/oglasi");
}

export async function deleteAllUnmappedAction(profileId: string) {
  await requireAdmin();

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("unmapped_listings")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (error) {
    throw new Error(error.message);
  }
  if (!count || count === 0) {
    throw new Error("Nema nemapiranih oglasa za brisanje.");
  }

  const result = await dispatchGitHubWorkflow("delete-unmapped", {
    profile_id: profileId,
  });
  if (!result.ok) throw new Error(result.message);
  return result.message;
}

export async function importExistingListingsCsvAction(
  profileId: string,
  formData: FormData,
) {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Odaberi CSV fajl.");
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error("CSV je prevelik (max 20 MB).");
  }

  const csvText = await file.text();
  const admin = createAdminClient();
  const profile = await loadProfileForWorker(admin, profileId);
  const username = profile.olx_username ?? profile.olx_login_email;
  if (!username) {
    throw new Error("Profil nema OLX username — postavi ga u podešavanjima.");
  }

  const client = await createClientForProfileRecord(profile);
  const result = await importListingsFromCsv(
    admin,
    client,
    profileId,
    username,
    csvText,
  );

  revalidatePath(`/profili/${profileId}/podesavanja`);
  revalidatePath("/oglasi");
  revalidatePath("/");

  return result;
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
