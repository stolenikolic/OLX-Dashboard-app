import Link from "next/link";

import { FeedProductCard } from "@/components/dashboard/feed-product-card";
import { ListingCard } from "@/components/dashboard/listing-card";
import { OlxShopHeader } from "@/components/dashboard/olx-shop-header";
import { Pagination } from "@/components/dashboard/pagination";
import { UnmappedListingCard } from "@/components/dashboard/unmapped-listing-card";
import { UnmappedToolbar } from "@/components/dashboard/unmapped-toolbar";
import { getAuthContext } from "@/lib/auth/dal";
import {
  fetchFeedCategorySlugs,
  fetchFeedProducts,
  fetchListings,
  fetchProfileById,
  fetchUnmappedListings,
} from "@/lib/dashboard/queries";
import { fetchOlxShopProfile } from "@/lib/olx/fetch-shop-profile";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    profil?: string;
    q?: string;
    kat?: string;
    page?: string;
  }>;
};

export default async function OglasiPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { isAdmin, memberships } = await getAuthContext();
  const supabase = await createClient();

  const rawStatus = params.status ?? "all";
  const search = params.q ?? "";
  const categorySlug = params.kat ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const workerProfileId = !isAdmin
    ? (memberships.find((m) => m.role === "worker")?.profile_id ??
      memberships[0]?.profile_id ??
      null)
    : null;

  /** Admin: ?profil=… → listings; bez → feed. Worker: uvijek svoj profil. */
  const profileId = isAdmin
    ? params.profil || null
    : workerProfileId;

  /** Nemapirani je samo za admina na profilu. */
  const status =
    rawStatus === "unmapped" && !(isAdmin && profileId) ? "all" : rawStatus;

  const isFeedMode = isAdmin && !profileId;

  const categorySlugs = await fetchFeedCategorySlugs(supabase);

  if (isFeedMode) {
    const result = await fetchFeedProducts(supabase, {
      search: search || undefined,
      categorySlug: categorySlug || undefined,
      page,
    });

    function feedHref(next: {
      q?: string;
      kat?: string;
      page?: number;
    }) {
      const q = new URLSearchParams();
      const query = next.q ?? search;
      const kat = next.kat ?? categorySlug;
      const p = next.page ?? 1;
      if (query) q.set("q", query);
      if (kat) q.set("kat", kat);
      if (p > 1) q.set("page", String(p));
      const qs = q.toString();
      return qs ? `/oglasi?${qs}` : "/oglasi";
    }

    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Katalog (feed)</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {result.total.toLocaleString("bs-BA")} artikala iz feeda — bez
            veze na profile. Za oglase profila uđi sa početne na karticu
            profila.
          </p>
        </div>

        <FiltersForm
          action="/oglasi"
          search={search}
          categorySlug={categorySlug}
          categorySlugs={categorySlugs}
          showStatus={false}
          status={status}
        />

        {result.items.length === 0 ? (
          <EmptyState message="Nema artikala za odabrane filtere." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((product) => (
                <FeedProductCard key={product.id} product={product} />
              ))}
            </div>
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              hrefForPage={(p) => feedHref({ page: p })}
            />
          </>
        )}
      </div>
    );
  }

  const profile = profileId
    ? await fetchProfileById(supabase, profileId)
    : null;

  const isUnmapped = isAdmin && status === "unmapped" && !!profileId;

  const olxUsername = profile?.olx_username?.trim() || null;
  const [result, unmappedResult, olxShop] = await Promise.all([
    isUnmapped
      ? Promise.resolve(null)
      : fetchListings(supabase, {
          status: status === "all" ? undefined : status,
          profileId: profileId || undefined,
          search: search || undefined,
          categorySlug: categorySlug || undefined,
          page,
        }),
    isUnmapped
      ? fetchUnmappedListings(supabase, {
          profileId: profileId!,
          search: search || undefined,
          page,
        })
      : Promise.resolve(null),
    profileId && olxUsername
      ? fetchOlxShopProfile(profileId, olxUsername)
      : Promise.resolve(null),
  ]);

  const total = isUnmapped
    ? (unmappedResult?.total ?? 0)
    : (result?.total ?? 0);
  const pageNum = isUnmapped
    ? (unmappedResult?.page ?? 1)
    : (result?.page ?? 1);
  const totalPages = isUnmapped
    ? (unmappedResult?.totalPages ?? 0)
    : (result?.totalPages ?? 0);

  function listingHref(next: {
    status?: string;
    q?: string;
    kat?: string;
    page?: number;
  }) {
    const q = new URLSearchParams();
    if (profileId) q.set("profil", profileId);
    const s = next.status ?? status;
    const query = next.q ?? search;
    const kat = next.kat ?? categorySlug;
    const p = next.page ?? 1;
    if (s && s !== "all") q.set("status", s);
    if (query) q.set("q", query);
    if (kat && s !== "unmapped") q.set("kat", kat);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/oglasi?${qs}` : "/oglasi";
  }

  const statuses = [
    { value: "all", label: "Svi" },
    { value: "active", label: "Aktivni" },
    { value: "hidden", label: "Sakriveni" },
    { value: "failed", label: "Greška" },
    { value: "draft", label: "Draft" },
    ...(isAdmin ? [{ value: "unmapped", label: "Nemapirani" }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        {isAdmin && (
          <Link href="/" className="text-sm text-teal-600 hover:underline">
            ← Pregled profila
          </Link>
        )}
        <div className="mt-2">
          {profile ? (
            <OlxShopHeader shop={olxShop} fallbackName={profile.name} />
          ) : (
            <h1 className="text-2xl font-bold text-zinc-900">Oglasi</h1>
          )}
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {total.toLocaleString("bs-BA")}{" "}
          {isUnmapped ? "nemapiranih oglasa" : "oglasa"}
          {olxShop
            ? ` · @${olxShop.username}`
            : profile
              ? ` · ${profile.name}`
              : ""}
          .
        </p>
      </div>

      {isAdmin && profileId && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/profili/${profileId}/podesavanja`}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Podešavanja profila
          </Link>
          <Link
            href={`/profili/${profileId}/kategorije`}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Prioritet kategorija
          </Link>
        </div>
      )}

      <FiltersForm
        action="/oglasi"
        search={search}
        categorySlug={isUnmapped ? "" : categorySlug}
        categorySlugs={categorySlugs}
        showStatus
        status={status}
        showCategory={!isUnmapped}
        hiddenFields={
          profileId ? { profil: profileId } : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s.value}
            href={listingHref({ status: s.value, page: 1 })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              status === s.value
                ? "bg-teal-600 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {isUnmapped && profileId && <UnmappedToolbar profileId={profileId} />}

      {isUnmapped ? (
        !unmappedResult || unmappedResult.items.length === 0 ? (
          <EmptyState message="Nema nemapiranih oglasa. Klikni „Osvježi nemapirane“ da povučeš sa OLX-a." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {unmappedResult.items.map((listing) => (
                <UnmappedListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            <Pagination
              page={pageNum}
              totalPages={totalPages}
              hrefForPage={(p) => listingHref({ page: p })}
            />
          </>
        )
      ) : result?.items.length === 0 ? (
        <EmptyState message="Nema oglasa za odabrane filtere." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result!.items.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                hideProfileName
              />
            ))}
          </div>
          <Pagination
            page={pageNum}
            totalPages={totalPages}
            hrefForPage={(p) => listingHref({ page: p })}
          />
        </>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-sm text-zinc-500">
      {message}
    </p>
  );
}

function FiltersForm({
  action,
  search,
  categorySlug,
  categorySlugs,
  showStatus,
  status,
  showCategory = true,
  hiddenFields,
}: {
  action: string;
  search: string;
  categorySlug: string;
  categorySlugs: string[];
  showStatus: boolean;
  status: string;
  showCategory?: boolean;
  hiddenFields?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap gap-2">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      {showStatus && status !== "all" && (
        <input type="hidden" name="status" value={status} />
      )}
      <input
        name="q"
        defaultValue={search}
        placeholder="Pretraga po naslovu…"
        className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />
      {showCategory && (
        <select
          name="kat"
          defaultValue={categorySlug}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Sve kategorije</option>
          {categorySlugs.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        Traži
      </button>
    </form>
  );
}
