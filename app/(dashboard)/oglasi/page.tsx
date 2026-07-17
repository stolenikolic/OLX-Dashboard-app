import Link from "next/link";

import { ListingCard } from "@/components/dashboard/listing-card";
import { createClient } from "@/lib/supabase/server";
import { fetchListings, fetchProfileSummaries } from "@/lib/dashboard/queries";

type PageProps = {
  searchParams: Promise<{ status?: string; profil?: string; q?: string }>;
};

export default async function OglasiPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = params.status ?? "all";
  const profileId = params.profil;
  const search = params.q ?? "";

  const supabase = await createClient();
  const [listings, profiles] = await Promise.all([
    fetchListings(supabase, {
      status: status === "all" ? undefined : status,
      profileId: profileId || undefined,
      search: search || undefined,
      limit: 60,
    }),
    fetchProfileSummaries(supabase),
  ]);

  const statuses = [
    { value: "all", label: "Svi" },
    { value: "active", label: "Aktivni" },
    { value: "hidden", label: "Sakriveni" },
    { value: "failed", label: "Greška" },
    { value: "draft", label: "Draft" },
  ];

  function filterHref(next: { status?: string; profil?: string; q?: string }) {
    const q = new URLSearchParams();
    const s = next.status ?? status;
    const p = next.profil ?? profileId ?? "";
    const query = next.q ?? search;
    if (s && s !== "all") q.set("status", s);
    if (p) q.set("profil", p);
    if (query) q.set("q", query);
    const qs = q.toString();
    return qs ? `/oglasi?${qs}` : "/oglasi";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Oglasi</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {listings.length} oglasa — grid kartica sa statusom i ručnim akcijama.
        </p>
      </div>

      <form action="/oglasi" method="get" className="flex flex-wrap gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        {profileId && <input type="hidden" name="profil" value={profileId} />}
        <input
          name="q"
          defaultValue={search}
          placeholder="Pretraga po naslovu…"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Traži
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s.value}
            href={filterHref({ status: s.value })}
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

      {profiles.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Profil:</span>
          <Link
            href={filterHref({ profil: "" })}
            className={`rounded-lg px-2 py-1 ${!profileId ? "bg-teal-50 text-teal-800" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Svi
          </Link>
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={filterHref({ profil: p.id })}
              className={`rounded-lg px-2 py-1 ${profileId === p.id ? "bg-teal-50 text-teal-800" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {listings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Nema oglasa za odabrane filtere.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
